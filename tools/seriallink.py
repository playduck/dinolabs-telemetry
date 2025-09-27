#!/usr/bin/env python3
"""
Serial to TCP Bridge Server
Forwards data between serial port and TCP connections
"""

import serial
import socket
import threading
import time
import argparse
import sys
import atexit
from collections import defaultdict

class SerialTCPBridge:
    def __init__(self, serial_port, baudrate, tcp_port, host='0.0.0.0'):
        self.serial_port = serial_port
        self.baudrate = baudrate
        self.tcp_port = tcp_port
        self.host = host

        self.serial_conn = None
        self.tcp_socket = None
        self.clients = []
        self.running = False

        # Statistics
        self.stats = {
            'serial_rx_bytes': 0,
            'serial_tx_bytes': 0,
            'tcp_rx_bytes': 0,
            'tcp_tx_bytes': 0,
            'client_connections': 0,
            'start_time': time.time()
        }

        self.lock = threading.Lock()

        # CSI sequences
        self.CSI_CLEAR_SCREEN = '\033[2J'
        self.CSI_HOME = '\033[H'
        self.CSI_HIDE_CURSOR = '\033[?25l'
        self.CSI_SHOW_CURSOR = '\033[?25h'

        # Statistics positioning (line 4 accounting for startup messages)
        self.stats_line = 4

        # Sparkline configuration
        self.sparkline_length = 25

        # Activity history for sparklines
        self.activity_history = {
            'serial_rx': [0] * self.sparkline_length,
            'serial_tx': [0] * self.sparkline_length,
            'tcp_rx': [0] * self.sparkline_length,
            'tcp_tx': [0] * self.sparkline_length
        }

        # Colors
        self.COLOR_RESET = '\033[0m'
        self.COLOR_BOLD = '\033[1m'
        self.COLOR_GREEN = '\033[32m'
        self.COLOR_BLUE = '\033[34m'
        self.COLOR_CYAN = '\033[36m'
        self.COLOR_YELLOW = '\033[33m'
        self.COLOR_RED = '\033[31m'
        self.COLOR_MAGENTA = '\033[35m'

        # Register cleanup on exit
        atexit.register(self._show_cursor)

    def start(self):
        """Start the bridge server"""
        try:
            # Initialize serial connection
            self.serial_conn = serial.Serial(
                port=self.serial_port,
                baudrate=self.baudrate,
                timeout=1
            )
            print(f"{self.COLOR_CYAN}Serial port {self.serial_port} opened at {self.baudrate} baud{self.COLOR_RESET}")

            # Initialize TCP server
            self.tcp_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.tcp_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.tcp_socket.bind((self.host, self.tcp_port))
            self.tcp_socket.listen(5)
            self.tcp_socket.settimeout(1)
            print(f"{self.COLOR_CYAN}TCP server listening on {self.host}:{self.tcp_port}{self.COLOR_RESET}")

            # Only clear screen and hide cursor after successful initialization
            print(self.CSI_CLEAR_SCREEN + self.CSI_HOME + self.CSI_HIDE_CURSOR, end='', flush=True)
            print(f"{self.COLOR_CYAN}Serial port {self.serial_port} opened at {self.baudrate} baud{self.COLOR_RESET}")
            print(f"{self.COLOR_CYAN}TCP server listening on {self.host}:{self.tcp_port}{self.COLOR_RESET}")

            self.running = True

            # Start serial to TCP thread
            serial_thread = threading.Thread(target=self._serial_to_tcp_loop)
            serial_thread.daemon = True
            serial_thread.start()

            # Start TCP accept thread
            accept_thread = threading.Thread(target=self._accept_clients_loop)
            accept_thread.daemon = True
            accept_thread.start()

            # Start statistics thread
            stats_thread = threading.Thread(target=self._stats_loop)
            stats_thread.daemon = True
            stats_thread.start()

            print(f"{self.COLOR_CYAN}Bridge server started. Press Ctrl+C to stop.{self.COLOR_RESET}")
            print()  # Add blank line for statistics area

            # Main loop
            while self.running:
                time.sleep(0.1)

        except KeyboardInterrupt:
            print(f"\n{self.COLOR_CYAN}Shutting down...{self.COLOR_RESET}")
        except Exception as e:
            print(f"{self.COLOR_RED}FATAL ERROR: {e}{self.COLOR_RESET}")
        finally:
            self.stop()

    def stop(self):
        """Stop the bridge server"""
        self.running = False

        with self.lock:
            for client in self.clients:
                try:
                    client.close()
                except:
                    pass
            self.clients.clear()

        if self.tcp_socket:
            try:
                self.tcp_socket.close()
            except:
                pass

        if self.serial_conn and self.serial_conn.is_open:
            try:
                self.serial_conn.close()
            except:
                pass

        self._show_cursor()

    def _show_cursor(self):
        """Show the cursor on exit"""
        print(self.CSI_SHOW_CURSOR, end='', flush=True)

    def _generate_sparkline(self, values):
        """Generate a sparkline bar graph from a list of values"""
        if not values or max(values) == 0:
            return "⎢" + "▁" * self.sparkline_length + "⎥"

        # Normalize values to 0-7 range for block characters
        max_val = max(values)
        normalized = [int((v / max_val) * 7) for v in values]

        # Block characters from low to high
        blocks = [" ", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]

        sparkline = "⎢" + "".join(blocks[min(n, 8)] for n in normalized) + "⎥"
        return sparkline

    def _accept_clients_loop(self):
        """Accept incoming TCP connections"""
        while self.running:
            try:
                client_socket, client_address = self.tcp_socket.accept()
                print(f"{self.COLOR_BLUE}New client connected: {client_address[0]}:{client_address[1]}{self.COLOR_RESET}")

                with self.lock:
                    self.clients.append(client_socket)
                    self.stats['client_connections'] += 1

                # Start client handler thread
                client_thread = threading.Thread(
                    target=self._handle_client,
                    args=(client_socket, client_address)
                )
                client_thread.daemon = True
                client_thread.start()

            except socket.timeout:
                continue
            except Exception as e:
                if self.running:
                    print(f"{self.COLOR_RED}TCP ACCEPT ERROR: {e}{self.COLOR_RESET}")

    def _handle_client(self, client_socket, client_address):
        """Handle data from a TCP client to serial"""
        client_str = f"{client_address[0]}:{client_address[1]}"

        try:
            while self.running:
                data = client_socket.recv(1024)
                if not data:
                    break

                # Send to serial port
                if self.serial_conn and self.serial_conn.is_open:
                    bytes_written = self.serial_conn.write(data)
                    with self.lock:
                        self.stats['tcp_rx_bytes'] += len(data)
                        self.stats['serial_tx_bytes'] += bytes_written

        except Exception as e:
            if self.running:
                print(f"{self.COLOR_RED}CLIENT ERROR ({client_str}): {e}{self.COLOR_RESET}")
        finally:
            with self.lock:
                if client_socket in self.clients:
                    self.clients.remove(client_socket)
            try:
                client_socket.close()
            except:
                pass
            print(f"{self.COLOR_BLUE}Client disconnected: {client_str}{self.COLOR_RESET}")

    def _serial_to_tcp_loop(self):
        """Read from serial port and send to all TCP clients"""
        while self.running:
            try:
                if self.serial_conn and self.serial_conn.is_open:
                    # Read from serial
                    data = self.serial_conn.read(self.serial_conn.in_waiting or 1)
                    if data:
                        with self.lock:
                            self.stats['serial_rx_bytes'] += len(data)

                        # Send to all connected clients
                        clients_to_remove = []
                        with self.lock:
                            for client in self.clients:
                                try:
                                    bytes_sent = client.send(data)
                                    self.stats['tcp_tx_bytes'] += bytes_sent
                                except:
                                    clients_to_remove.append(client)

                            # Remove dead clients
                            for client in clients_to_remove:
                                if client in self.clients:
                                    self.clients.remove(client)
                                try:
                                    client.close()
                                except:
                                    pass
                elif self.serial_conn and not self.serial_conn.is_open:
                    # Move cursor below stats area and show error
                    print(f'\033[{self.stats_line + 12};1H', end='')
                    print(f"{self.COLOR_RED}SERIAL DEVICE DISCONNECTED{self.COLOR_RESET}")
                    self._show_cursor()
                    self.running = False
                    break
                else:
                    time.sleep(0.1)

            except Exception as e:
                if self.running:
                    # Move cursor below stats area and show error
                    print(f'\033[{self.stats_line + 12};1H', end='')
                    print(f"{self.COLOR_RED}SERIAL ERROR: {e}{self.COLOR_RESET}")
                    # Check if this is a critical error that should stop the bridge
                    error_str = str(e).lower()
                    if any(x in error_str for x in ['device', 'disconnected', 'not found', 'permission denied', 'no such file']):
                        print(f"{self.COLOR_RED}Critical serial error - stopping bridge{self.COLOR_RESET}")
                        self._show_cursor()
                        self.running = False
                        break
                time.sleep(0.1)

    def _stats_loop(self):
        """Periodically print statistics"""
        last_time = time.time()
        last_stats = self.stats.copy()

        while self.running:
            time.sleep(0.1)  # Print stats every second

            if not self.running:  # Double-check in case we were stopped
                break

            with self.lock:
                current_time = time.time()
                time_diff = current_time - last_time
                current_stats = self.stats.copy()

                # Calculate rates
                serial_rx_rate = (current_stats['serial_rx_bytes'] - last_stats['serial_rx_bytes']) / time_diff
                serial_tx_rate = (current_stats['serial_tx_bytes'] - last_stats['serial_tx_bytes']) / time_diff
                tcp_rx_rate = (current_stats['tcp_rx_bytes'] - last_stats['tcp_rx_bytes']) / time_diff
                tcp_tx_rate = (current_stats['tcp_tx_bytes'] - last_stats['tcp_tx_bytes']) / time_diff

                # Update activity history for sparklines
                self.activity_history['serial_rx'].append(serial_rx_rate)
                self.activity_history['serial_rx'] = self.activity_history['serial_rx'][-self.sparkline_length:]

                self.activity_history['serial_tx'].append(serial_tx_rate)
                self.activity_history['serial_tx'] = self.activity_history['serial_tx'][-self.sparkline_length:]

                self.activity_history['tcp_rx'].append(tcp_rx_rate)
                self.activity_history['tcp_rx'] = self.activity_history['tcp_rx'][-self.sparkline_length:]

                self.activity_history['tcp_tx'].append(tcp_tx_rate)
                self.activity_history['tcp_tx'] = self.activity_history['tcp_tx'][-self.sparkline_length:]

                # Position cursor at stats area to overwrite previous stats
                print(f'\033[{self.stats_line};1H', end='')
                print(f"{self.COLOR_BOLD}{self.COLOR_CYAN}=== Bridge Statistics ==={self.COLOR_RESET}")
                print(f"{self.COLOR_BLUE}Uptime:{self.COLOR_RESET} {current_time - self.stats['start_time']:>8.1f}s" + " " * 30)
                print(f"{self.COLOR_CYAN}Connected clients:{self.COLOR_RESET} {len(self.clients):>3}" + " " * 30)
                print(f"{self.COLOR_BLUE}Total clients    :{self.COLOR_RESET} {current_stats['client_connections']:>3}" + " " * 30)

                # Generate sparklines for data transfer rates
                serial_rx_spark = self._generate_sparkline(self.activity_history['serial_rx'])
                serial_tx_spark = self._generate_sparkline(self.activity_history['serial_tx'])
                tcp_rx_spark = self._generate_sparkline(self.activity_history['tcp_rx'])
                tcp_tx_spark = self._generate_sparkline(self.activity_history['tcp_tx'])

                print(f"{self.COLOR_CYAN}Serial RX:{self.COLOR_RESET} {current_stats['serial_rx_bytes']:>10} bytes ({serial_rx_rate:>6.1f} B/s) {serial_rx_spark}" + " " * 5)
                print(f"{self.COLOR_CYAN}Serial TX:{self.COLOR_RESET} {current_stats['serial_tx_bytes']:>10} bytes ({serial_tx_rate:>6.1f} B/s) {serial_tx_spark}" + " " * 5)
                print(f"{self.COLOR_MAGENTA}TCP RX   :{self.COLOR_RESET} {current_stats['tcp_rx_bytes']:>10} bytes ({tcp_rx_rate:>6.1f} B/s) {tcp_rx_spark}" + " " * 5)
                print(f"{self.COLOR_MAGENTA}TCP TX   :{self.COLOR_RESET} {current_stats['tcp_tx_bytes']:>10} bytes ({tcp_tx_rate:>6.1f} B/s) {tcp_tx_spark}" + " " * 5)
                print(f"{self.COLOR_BOLD}{self.COLOR_CYAN}========================{self.COLOR_RESET}")
                print(f"{self.COLOR_CYAN}Press Ctrl+C to stop.{self.COLOR_RESET}" + " " * 30)

                last_time = current_time
                last_stats = current_stats.copy()

def main():
    parser = argparse.ArgumentParser(description='Serial to TCP Bridge Server')
    parser.add_argument('--serial-port', required=True, help='Serial port (e.g., /dev/ttyUSB0 or COM3)')
    parser.add_argument('--baudrate', type=int, default=9600, help='Baud rate (default: 9600)')
    parser.add_argument('--tcp-port', type=int, default=10000, help='TCP port to listen on (default: 10000)')
    parser.add_argument('--host', default='0.0.0.0', help='Host to bind TCP server to (default: 0.0.0.0)')

    args = parser.parse_args()

    bridge = SerialTCPBridge(
        serial_port=args.serial_port,
        baudrate=args.baudrate,
        tcp_port=args.tcp_port,
        host=args.host
    )

    try:
        bridge.start()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
