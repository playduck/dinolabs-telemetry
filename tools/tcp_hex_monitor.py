#!/usr/bin/env python3
"""
TCP Hex Monitor
Connects to localhost:12345 and prints received data in hex format
"""

import socket
import time
import sys

def main():
    host = 'localhost'
    port = 12345

    try:
        # Create TCP socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1)  # 1 second timeout for non-blocking behavior

        print(f"Connecting to {host}:{port}...")
        sock.connect((host, port))
        print("Connected! Monitoring data (Ctrl+C to stop)...")

        while True:
            try:
                # Receive data
                data = sock.recv(1024)
                if data:
                    # Print timestamp and hex data
                    timestamp = time.strftime("%H:%M:%S")
                    hex_data = data.hex().upper()

                    # Format hex data with spaces every 2 characters
                    formatted_hex = ' '.join(hex_data[i:i+2] for i in range(0, len(hex_data), 2))

                    # print(f"[{timestamp}] {len(data):3d} bytes: {formatted_hex}")
                    print(f"[{timestamp}] {len(data):3d} bytes: {data.decode(errors='replace')}")
                else:
                    print("Connection closed by server")
                    break

            except socket.timeout:
                # No data received, continue polling
                continue
            except socket.error as e:
                print(f"Socket error: {e}")
                break

    except KeyboardInterrupt:
        print("\nStopping monitor...")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        try:
            sock.close()
        except:
            pass

if __name__ == "__main__":
    main()
