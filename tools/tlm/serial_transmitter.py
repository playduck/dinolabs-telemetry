"""
Serial Transmitter Module

Takes batches of wire format messages from the scheduler and transmits them via serial port.
Also receives and processes incoming FCS messages.
Each batch contains a list of 10-byte wire format messages.
"""

import serial
import time
from typing import List, Optional, Callable
from scheduler import MessageScheduler
from packager import format_wire_message
from messages import MSG_TEC, MSG_POWER, MSG_SYS, MSG_EXP1, MSG_EXP2, MSG_EXP_IMU, MSG_FCS, FCSMessage, MESSAGE_TYPE_NAMES, MESSAGES
from packager import unpackage_message


class SerialTransmitter:
    """Serial transmitter/receiver for telemetry messages."""

    def __init__(self, port: str = '/dev/cu.usbserial-0001', baudrate: int = 115200, timeout: float = 1.0,
                 fcs_callback: Optional[Callable[[FCSMessage], None]] = None, loopback_mode: bool = False):
        """
        Initialize the serial transmitter/receiver.

        Args:
            port: Serial port device (e.g., '/dev/ttyUSB0', 'COM3')
            baudrate: Serial communication speed
            timeout: Serial timeout in seconds
            fcs_callback: Optional callback function for received FCS messages
            loopback_mode: If True, compare sent messages with received ones for validation
        """
        self.port = port
        self.baudrate = baudrate
        self.timeout = timeout
        self.serial_connection: Optional[serial.Serial] = None
        self.is_connected = False
        self.total_messages_sent = 0
        self.total_batches_sent = 0
        self.total_messages_received = 0
        self.fcs_callback = fcs_callback
        self.loopback_mode = loopback_mode

        # Serial reading buffer
        self.buffer = bytearray()

        # Loopback verification
        self.sent_messages_queue = []  # Queue of sent message objects for loopback comparison
        self.loopback_matches = 0
        self.loopback_mismatches = 0

    def connect(self) -> bool:
        """
        Establish serial connection.

        Returns:
            True if connection successful, False otherwise
        """
        try:
            self.serial_connection = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=self.timeout,
                bytesize=serial.EIGHTBITS,
                parity=serial.PARITY_NONE,
                stopbits=serial.STOPBITS_ONE
            )
            self.is_connected = True
            print(f"Connected to {self.port} at {self.baudrate} baud")
            return True

        except serial.SerialException as e:
            print(f"Failed to connect to {self.port}: {e}")
            self.is_connected = False
            return False

    def disconnect(self):
        """Close the serial connection."""
        if self.serial_connection and self.is_connected:
            self.serial_connection.close()
            self.is_connected = False
            print(f"Disconnected from {self.port}")

    def _read_serial_data(self):
        """Read and process any available data from serial port."""
        if not self.is_connected or not self.serial_connection:
            return

        try:
            if self.serial_connection.in_waiting > 0:
                # Read available bytes
                data = self.serial_connection.read(self.serial_connection.in_waiting)
                self.buffer.extend(data)

                # Process complete 10-byte messages
                while len(self.buffer) >= 10:
                    message_bytes = bytes(self.buffer[:10])
                    self.buffer = self.buffer[10:]
                    self._process_received_message(message_bytes)

        except serial.SerialException as e:
            print(f"Reader error: {e}")
        except Exception as e:
            print(f"Unexpected reader error: {e}")

    def _process_received_message(self, wire_data: bytes):
        """Process a received 10-byte wire format message."""
        try:
            msg_type, data, parity, is_valid = unpackage_message(wire_data)

            if not is_valid:
                print(f"Received invalid message (parity error): type={msg_type:02X}")
                return

            self.total_messages_received += 1

            # Parse and display message content
            self._parse_and_display_message(msg_type, data, wire_data)

        except Exception as e:
            print(f"Failed to process received message: {e}")

    def _parse_and_display_message(self, msg_type: int, data: bytes, wire_data: bytes):
        """Parse and display received message with actual values."""
        name = MESSAGE_TYPE_NAMES.get(msg_type, f"UNKNOWN_{msg_type:02X}")
        colored_msg = format_wire_message(wire_data, name)

        # Try to parse the message using the appropriate class
        if msg_type in MESSAGES:
            try:
                message_class = MESSAGES[msg_type]
                message = message_class.unpack_data(data)

                print(f"  Received {name}: {colored_msg}")
                message.display_values()

                # Loopback verification
                if self.loopback_mode:
                    self._verify_loopback_message(msg_type, message, name)

                # Special handling for FCS messages (callback)
                if msg_type == MSG_FCS and self.fcs_callback:
                    try:
                        self.fcs_callback(message)
                    except Exception as e:
                        print(f"    FCS callback error: {e}")

            except Exception as e:
                print(f"  Received {name}: {colored_msg} (parse error: {e})")
        else:
            print(f"  Received {name}: {colored_msg} (unknown message type)")

    def _verify_loopback_message(self, msg_type: int, received_message, msg_name: str):
        """Verify received message against sent message in loopback mode."""
        if not self.sent_messages_queue:
            print(f"    Loopback: No sent message to compare with")
            return

        # Find matching sent message by type
        sent_message = None
        sent_index = None
        for i, (sent_type, sent_msg) in enumerate(self.sent_messages_queue):
            if sent_type == msg_type:
                sent_message = sent_msg
                sent_index = i
                break

        if sent_message is None:
            print(f"    Loopback: No matching sent {msg_name} message found")
            return

        # Remove the matched message from queue
        self.sent_messages_queue.pop(sent_index)

        # Compare message objects
        if self._messages_equal(sent_message, received_message):
            self.loopback_matches += 1
            print(f"    Loopback: ✓ MATCH - {msg_name} message verified")
        else:
            self.loopback_mismatches += 1
            print(f"    Loopback: ✗ MISMATCH - {msg_name} message differs")
            print(f"      Sent:     {sent_message.__dict__}")
            print(f"      Received: {received_message.__dict__}")

    def _messages_equal(self, msg1, msg2) -> bool:
        """Compare two message objects for equality."""
        if type(msg1) != type(msg2):
            return False
        return msg1.__dict__ == msg2.__dict__

    def _store_sent_message_for_loopback(self, wire_data: bytes):
        """Extract and store sent message object for loopback verification."""
        try:
            msg_type, data, parity, is_valid = unpackage_message(wire_data)

            if not is_valid:
                print(f"    Loopback: Warning - sent message has parity error")
                return

            if msg_type in MESSAGES:
                message_class = MESSAGES[msg_type]
                message = message_class.unpack_data(data)
                self.sent_messages_queue.append((msg_type, message))
            else:
                print(f"    Loopback: Unknown message type {msg_type:02X}, cannot store for verification")

        except Exception as e:
            print(f"    Loopback: Failed to parse sent message: {e}")


    def send_batch(self, batch: List[bytes], verbose: bool = True, intermessage_delay_ms: int = 1) -> bool:
        """
        Send a batch of wire format messages over serial with inter-message delay.

        Args:
            batch: List of 10-byte wire format messages
            verbose: Print transmission details
            intermessage_delay_ms: Delay in milliseconds between messages

        Returns:
            True if all messages sent successfully, False otherwise
        """
        if not self.is_connected or not self.serial_connection:
            print("Error: Not connected to serial port")
            return False

        if not batch:
            # if verbose:
            #     print("Empty batch - nothing to send")
            return True

        try:
            messages_sent = 0

            for i, wire_data in enumerate(batch):
                if len(wire_data) != 10:
                    print(f"Error: Invalid message length {len(wire_data)} bytes, skipping")
                    continue

                # Store message for loopback verification if enabled
                if self.loopback_mode:
                    self._store_sent_message_for_loopback(wire_data)

                # Send the 10-byte message
                bytes_written = self.serial_connection.write(wire_data)
                if bytes_written != 10:
                    print(f"Warning: Expected to write 10 bytes, wrote {bytes_written}")

                # Ensure message is transmitted before continuing
                self.serial_connection.flush()

                messages_sent += 1

                if verbose:
                    msg_type = wire_data[0]
                    name = MESSAGE_TYPE_NAMES.get(msg_type, f"{msg_type:02X}")
                    colored_msg = format_wire_message(wire_data, name)
                    print(f"  Sent: {colored_msg}")

                # Add inter-message delay (except after the last message)
                if i < len(batch) - 1 and intermessage_delay_ms > 0:
                    time.sleep(intermessage_delay_ms / 1000.0)

            self.total_messages_sent += messages_sent
            self.total_batches_sent += 1

            if verbose and messages_sent > 0:
                print(f"Batch complete: {messages_sent} messages sent ({messages_sent * 10} bytes sent)")

            return True

        except serial.SerialException as e:
            print(f"Serial transmission error: {e}")
            return False




def fcs_message_handler(fcs_message: FCSMessage):
    """Example FCS message callback handler."""
    print(f"    FCS Handler: FCS state changed to {fcs_message.fcs_state}")


def main():
    """Demonstrate the serial transmitter with actual serial communication."""
    print("Serial Transmitter Demo")
    print("=" * 50)

    # Create scheduler and transmitter with FCS callback
    scheduler = MessageScheduler()
    transmitter = SerialTransmitter(
        port='/dev/cu.usbserial-0001',
        baudrate=2_000_000,
        fcs_callback=fcs_message_handler,
        loopback_mode=False
    )

    print(f"Attempting to connect to serial port: {transmitter.port}")
    print(f"Baudrate: {transmitter.baudrate}")

    if not transmitter.connect():
        print("Failed to connect to serial port. Check your connection and port settings.")
        return

    print("Successfully connected! Starting transmission...")
    print("Press Ctrl+C to stop\n")

    try:
        while True:
            # Read any incoming serial data
            transmitter._read_serial_data()

            is_ready, batch = scheduler.get_batch_if_ready()

            if is_ready:
                # print(f"\n[BATCH {transmitter.total_batches_sent + 1}]:")
                success = transmitter.send_batch(batch, verbose=True, intermessage_delay_ms=scheduler.intermessage_delay_ms)
                if not success:
                    print("Failed to send batch - check serial connection")

            time.sleep(0.01)

    except KeyboardInterrupt:
        print(f"\n\nStopping transmission...")

    finally:
        transmitter.disconnect()
        print(f"Total batches sent: {transmitter.total_batches_sent}")
        print(f"Total messages sent: {transmitter.total_messages_sent}")
        average_batch_size_bytes = (transmitter.total_messages_sent * 10 / transmitter.total_batches_sent) if transmitter.total_batches_sent > 0 else 0
        average_datarate = (average_batch_size_bytes * 1000 / scheduler.batch_interval_ms) if scheduler.batch_interval_ms > 0 else 0
        print(f"Average batch size: {average_batch_size_bytes:.2f} bytes")
        print(f"Average data rate: {average_datarate:.2f} bytes/sec")
        print(f"Total messages received: {transmitter.total_messages_received}")


if __name__ == "__main__":
    main()
