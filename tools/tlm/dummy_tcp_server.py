#!/usr/bin/env python3
"""
TCP Transmitter Module

Usage:
    python dummy_tcp_server.py [port]

Default port: 8082
"""

import socket
import threading
import time
import random
from typing import List
from scheduler import MessageScheduler
from packager import format_wire_message
from messages import MESSAGE_TYPE_NAMES
from colors import Colors


class TcpTransmitter:
    """TCP transmitter for telemetry messages."""

    def __init__(self, host: str = 'localhost', port: int = 8082):
        """
        Initialize the TCP transmitter.

        Args:
            host: TCP host to bind to
            port: TCP port to listen on
        """
        self.host = host
        self.port = port
        self.server_socket = None
        self.clients = []  # List of connected client sockets
        self.running = False
        self.total_messages_sent = 0
        self.total_batches_sent = 0

        # Message scheduler - uses existing logic from scheduler.py
        self.scheduler = MessageScheduler()

        # Client management lock
        self.clients_lock = threading.Lock()

    def start(self) -> bool:
        """
        Start the TCP server.

        Returns:
            True if server started successfully, False otherwise
        """
        try:
            self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(5)
            self.running = True

            print(f"TLM TCP Server listening on {self.host}:{self.port}")
            print("Using scheduler for proper message timing and batching")
            print(f"Batch interval: {self.scheduler.batch_interval_ms}ms")

            # Display message intervals
            print("\nMessage intervals:")
            for msg_type, interval_ms in self.scheduler.get_intervals():
                name = MESSAGE_TYPE_NAMES[msg_type]
                rate = 1000.0 / interval_ms if interval_ms > 0 else 0
                print(f"  {name:8s}: {interval_ms:4d}ms ({rate:4.1f}/s)")

            print(f"\n{Colors.BOLD}Wire format legend:{Colors.RESET}")
            print(f"  [{Colors.RED}TT{Colors.RESET}] [{Colors.GREEN}DD DD DD DD DD DD DD DD{Colors.RESET}] [{Colors.BLUE}PP{Colors.RESET}]")
            print(f"  Where: {Colors.RED}TT{Colors.RESET}=Type, {Colors.GREEN}DD{Colors.RESET}=Data (8 bytes), {Colors.BLUE}PP{Colors.RESET}=Parity")
            print("\nPress Ctrl+C to stop\n")

            # Start client acceptance thread
            accept_thread = threading.Thread(target=self._accept_clients, daemon=True)
            accept_thread.start()

            # Start transmission loop
            self._transmission_loop()

            return True

        except Exception as e:
            print(f"Failed to start TCP server: {e}")
            self.running = False
            return False

    def _accept_clients(self):
        """Accept incoming client connections."""
        while self.running:
            try:
                client_socket, address = self.server_socket.accept()
                print(f"Client connected from {address}")

                with self.clients_lock:
                    self.clients.append(client_socket)

            except Exception as e:
                if self.running:
                    print(f"Error accepting client: {e}")
                break

    def _transmission_loop(self):
        """Main transmission loop - gets batches from scheduler and sends to clients."""
        batch_count = 0
        start_time = time.time()

        while self.running:
            try:
                # Get batch from scheduler
                is_ready, batch = self.scheduler.get_batch_if_ready()

                if is_ready:
                    batch_count += 1
                    elapsed_ms = (time.time() - start_time) * 1000

                    # Corrupt random bits for testing
                    if batch and random.random() < 0.03:
                        msg_index = random.randint(0, len(batch) - 1)
                        byte_index = random.randint(0, 9)
                        bit_index = random.randint(0, 7)
                        corrupted_byte = batch[msg_index][byte_index] ^ (1 << bit_index)
                        corrupted_msg = bytearray(batch[msg_index])
                        corrupted_msg[byte_index] = corrupted_byte
                        batch[msg_index] = bytes(corrupted_msg)
                        print(f"{Colors.RED}Corrupted message {msg_index} byte {byte_index} bit {bit_index}{Colors.RESET}")


                    if batch:
                        # Send batch to all clients
                        success = self.send_batch(batch, batch_count, elapsed_ms, self.scheduler.intermessage_delay_ms)
                        if success:
                            self.total_batches_sent += 1
                    else:
                        # Empty batch
                        print(f"{Colors.BOLD}[BATCH {batch_count:2d}] at {elapsed_ms:6.1f}ms - {Colors.YELLOW}EMPTY{Colors.RESET}")

                # Clean up disconnected clients
                self._cleanup_clients()

                time.sleep(0.001)  # 1ms polling to match scheduler

            except KeyboardInterrupt:
                break
            except Exception as e:
                print(f"Transmission loop error: {e}")
                time.sleep(0.1)

    def send_batch(self, batch: List[bytes], batch_num: int, elapsed_ms: float, intermessage_delay_ms: int = 1) -> bool:
        """
        Send a batch of wire format messages to all connected clients.

        Args:
            batch: List of 10-byte wire format messages
            batch_num: Batch sequence number
            elapsed_ms: Elapsed time since start in milliseconds

        Returns:
            True if batch sent successfully to at least one client, False otherwise
        """
        if not batch:
            return True

        with self.clients_lock:
            if not self.clients:
                return False  # No clients connected

            messages_sent = 0
            clients_reached = 0

            # Display batch header
            print(f"{Colors.BOLD}[BATCH {batch_num:2d}] at {elapsed_ms:6.1f}ms - {len(batch)} messages:{Colors.RESET}")

            # Send each message in the batch to all clients with inter-message delay
            for i, wire_data in enumerate(batch):
                if len(wire_data) != 10:
                    print(f"Error: Invalid message length {len(wire_data)} bytes, skipping")
                    continue

                msg_type = wire_data[0]
                msg_name = MESSAGE_TYPE_NAMES.get(msg_type, f"{msg_type:02X}")
                colored_msg = format_wire_message(wire_data, msg_name)

                # Send to all clients
                clients_sent_to = 0
                for client in self.clients[:]:  # Copy list to avoid modification during iteration
                    try:
                        bytes_sent = client.send(wire_data)
                        if bytes_sent == 10:
                            clients_sent_to += 1
                        else:
                            print(f"Warning: Expected to send 10 bytes, sent {bytes_sent}")
                    except Exception as e:
                        # Client disconnected, will be cleaned up later
                        pass

                if clients_sent_to > 0:
                    messages_sent += 1
                    clients_reached = max(clients_reached, clients_sent_to)
                    print(f"  {colored_msg} -> {clients_sent_to} client(s)")
                else:
                    print(f"  {colored_msg} -> {Colors.RED}FAILED{Colors.RESET}")

                # Add inter-message delay (except after the last message)
                if i < len(batch) - 1 and intermessage_delay_ms > 0:
                    time.sleep(intermessage_delay_ms / 1000.0)

            self.total_messages_sent += messages_sent
            return messages_sent > 0

    def _cleanup_clients(self):
        """Remove disconnected clients."""
        with self.clients_lock:
            disconnected = []
            for client in self.clients:
                try:
                    # Try to peek at the socket to see if it's still connected
                    client.settimeout(0.001)
                    data = client.recv(1, socket.MSG_PEEK)
                    if not data:
                        # Client disconnected gracefully
                        disconnected.append(client)
                except socket.timeout:
                    # Still connected, just no data available
                    pass
                except:
                    # Socket error, client disconnected
                    disconnected.append(client)
                finally:
                    client.settimeout(None)

            for client in disconnected:
                try:
                    client.close()
                    self.clients.remove(client)
                    print("Client disconnected")
                except:
                    pass

    def stop(self):
        """Stop the TCP server."""
        self.running = False

        # Close all client connections
        with self.clients_lock:
            for client in self.clients[:]:
                try:
                    client.close()
                except:
                    pass
            self.clients.clear()

        # Close server socket
        if self.server_socket:
            try:
                self.server_socket.close()
            except:
                pass

        print(f"\nTCP server stopped")
        print(f"Statistics:")
        print(f"  Total batches sent: {self.total_batches_sent}")
        print(f"  Total messages sent: {self.total_messages_sent}")


def main():
    """Main function"""
    import sys

    port = 8082
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            print("Invalid port number")
            sys.exit(1)

    transmitter = TcpTransmitter('localhost', port)

    try:
        transmitter.start()
    except KeyboardInterrupt:
        print("\nReceived interrupt signal")
    except Exception as e:
        print(f"Server error: {e}")
    finally:
        transmitter.stop()


if __name__ == "__main__":
    main()
