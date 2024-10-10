import serial
import socket
import sys
import threading
import time
import random
import signal

import data.source as source

# Serial port settings
SERIAL_PORT = '/dev/cu.usbserial-0001'
BAUDRATE = 115200
SERIAL_TIMEOUT = 1  # seconds

# TCP server settings
TCP_SERVER_HOST = 'localhost'
TCP_SERVER_PORT = 8081
TCP_SERVER_BUFFER_SIZE = 1024  # bytes

# Dummy data settings
USE_DUMMY_DATA = True

# Data request settings
DATA_REQUEST_INTERVAL = 0.25  # seconds
DATA_REQUEST_BYTE = b'\x02'
DATA_TERMINATOR_BYTE = b'\x00'

# Status byte settings
STATUS_BYTE_INTERVAL = 3  # seconds

# Maximum package size logging settings
MAX_PACKAGE_SIZE_LOG_INTERVAL = 10  # seconds
max_package_size_serial = 0
max_package_size_dummy = 0
last_log_time = time.time()

class TCPServer:
    def __init__(self, host, port):
        self.host = host
        self.port = port
        self.clients = []

    def start(self):
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.bind((self.host, self.port))
        self.server_socket.listen()
        print(f"TCP server started on {self.host}:{self.port}")
        while True:
            client_socket, address = self.server_socket.accept()
            print(f"Connection from {address} established.")
            self.clients.append(client_socket)
            client_thread = threading.Thread(target=self.handle_client, args=(client_socket,))
            client_thread.start()

    def stop(self):
        self.server_socket.close()
        for client in self.clients:
            client.close()

    def handle_client(self, client_socket):
        try:
            while True:
                data = client_socket.recv(TCP_SERVER_BUFFER_SIZE)
                if not data:
                    break
                print(f"Received data packet from TCP client: {data}")
        except Exception as e:
            print(f"Error: Failed to receive data packet from TCP client. {str(e)}")
        finally:
            self.clients.remove(client_socket)
            client_socket.close()

    def send_data(self, data):
        for client in self.clients:
            try:
                client.sendall(data)
            except Exception as e:
                print(f"Error: Failed to send data packet to TCP client. {str(e)}")
                self.clients.remove(client)
                client.close()

def read_serial_data(serial_port):
    """Read serial data until a null byte (0x00)"""
    global max_package_size_serial, last_log_time
    data = bytearray()
    while True:
        byte = serial_port.read(1)
        if not byte:
            print("Warning: No data received from serial port. Skipping...")
            return bytearray()
        if byte == DATA_TERMINATOR_BYTE:
            data.extend(b'\x00')
            break
        data.extend(byte)
    package_size = len(data)
    # print(data, package_size)
    if package_size > max_package_size_serial:
        max_package_size_serial = package_size
    if time.time() - last_log_time >= MAX_PACKAGE_SIZE_LOG_INTERVAL:
        print(f"Maximum package size (serial): {max_package_size_serial} bytes")
        last_log_time = time.time()

    # print(f"Received data packet from serial port: {data}")
    return data

def generate_dummy_data():
    """Generate dummy data packet"""
    global max_package_size_dummy, last_log_time
    data = source.example_generate_random_buffer()

    if(random.random() <= 0.1):
        data = random.randbytes(len(data))

    package_size = len(data)
    if package_size > max_package_size_dummy:
        max_package_size_dummy = package_size
    if time.time() - last_log_time >= MAX_PACKAGE_SIZE_LOG_INTERVAL:
        print(f"Maximum package size (dummy): {max_package_size_dummy} bytes")
        last_log_time = time.time()
    # print(f"Generated dummy data packet: {data}")
    return data

def request_serial_data(serial_port):
    """Request serial data from the device"""
    serial_port.write(DATA_REQUEST_BYTE)
    return read_serial_data(serial_port)

def send_status_bytes(serial_port):
    """Send status bytes to the serial port"""
    status_byte = bytes([0x01, random.randint(0, 6)])
    serial_port.write(status_byte)
    print(f"Sent status bytes to serial port: {status_byte}")

def main():

    try:
        tcp_server = TCPServer(TCP_SERVER_HOST, TCP_SERVER_PORT)
        tcp_server_thread = threading.Thread(target=tcp_server.start)
        tcp_server_thread.daemon = True  # Allow main thread to exit even if TCP server thread is still running
        tcp_server_thread.start()

        def signal_handler(sig, frame):
            print("\nProgram interrupted by user. Closing TCP server and exiting...")
            tcp_server.stop()
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)

        if not USE_DUMMY_DATA:
            with serial.Serial(SERIAL_PORT, BAUDRATE, timeout=SERIAL_TIMEOUT) as ser:
                print(f"Serial port {SERIAL_PORT} opened successfully.")
                last_status_byte_time = time.time()
                while True:
                    data = request_serial_data(ser)
                    if data:
                        tcp_server.send_data(data[1:])
                    if time.time() - last_status_byte_time >= STATUS_BYTE_INTERVAL:
                        send_status_bytes(ser)
                        last_status_byte_time = time.time()
                    time.sleep(DATA_REQUEST_INTERVAL)
        else:
            while True:
                data = generate_dummy_data()
                tcp_server.send_data(data)
                time.sleep(DATA_REQUEST_INTERVAL)

    except serial.SerialException as e:
        print(f"Error: Failed to open serial port {SERIAL_PORT}. {str(e)}")
    except KeyboardInterrupt:
        print("\nProgram interrupted by user. Closing serial port and exiting...")
        try:
            ser.close()
        except NameError:
            pass  # Serial port not opened
        sys.exit(0)
    except Exception as e:
        print(f"Error: An unexpected error occurred. {str(e)}")
        sys.exit(1)



if __name__ == '__main__':
    main()
