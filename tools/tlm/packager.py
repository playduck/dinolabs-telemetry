"""
Message Packager Module

Packages messages into wire format:
- First Byte: Message Type
- Following 8 Bytes: Data
- Last Byte: Even Parity Byte
"""

from typing import Union, List
from colors import Colors

MESSAGE_DATA_SIZE_BITS = 8 * 8
PADDING_VALUE = 0

def _calculate_parity(data: bytes) -> int:
    """Sum all set bits in the data and return the number of bits set."""
    return sum(bin(byte).count('1') for byte in data)


def _add_padding(data: bytes) -> bytes:
    padding_length = MESSAGE_DATA_SIZE_BITS // 8 - len(data)
    if padding_length > 0:
        padding = bytes([PADDING_VALUE] * padding_length)
        data += padding
    return data


def _validate_and_convert_data(data: Union[bytes, bytearray, List[int]]) -> bytes:
    """
    Validate and convert input data to bytes.

    Args:
        data: Input data in various formats

    Returns:
        Validated 8-byte data as bytes

    Raises:
        ValueError: If data is invalid
        TypeError: If data type is unsupported
    """
    if isinstance(data, (bytes, bytearray)):
        data_bytes = bytes(data)
    elif isinstance(data, list):
        if not all(isinstance(x, int) and 0 <= x <= 255 for x in data):
            raise ValueError("List elements must be integers between 0 and 255")
        data_bytes = bytes(data)
    else:
        raise TypeError(f"Unsupported data type: {type(data)}. Expected bytes, bytearray, or list of integers")

    data_bytes = _add_padding(data_bytes)

    return data_bytes


def _validate_message_type(msg_type: int) -> int:
    """
    Validate message type.

    Args:
        msg_type: Message type value

    Returns:
        Validated message type

    Raises:
        ValueError: If message type is invalid
        TypeError: If message type is not an integer
    """
    if not isinstance(msg_type, int):
        raise TypeError(f"Message type must be an integer, got {type(msg_type)}")

    if not (0 <= msg_type <= 255):
        raise ValueError(f"Message type must be between 0 and 255, got {msg_type}")

    return msg_type


def package_message(msg_type: int, data: Union[bytes, bytearray, List[int]]) -> bytes:
    """
    Package a message into wire format.

    Wire format:
    - Byte 0: Message type
    - Bytes 1-8: Data (8 bytes)
    - Byte 9: Even parity byte

    Args:
        msg_type: Message type (0-255)
        data: 8 bytes of data (as bytes, bytearray, or list of integers)

    Returns:
        10-byte packaged message in wire format

    Raises:
        ValueError: If inputs are invalid
        TypeError: If input types are unsupported
    """
    # Validate inputs
    validated_msg_type = _validate_message_type(msg_type)
    validated_data = _validate_and_convert_data(data)

    # Create the message without parity
    message_without_parity = bytes([validated_msg_type]) + validated_data

    # Calculate parity for the entire message (type + data)
    parity_byte = _calculate_parity(message_without_parity)

    # Return complete wire format message
    return message_without_parity + bytes([parity_byte])


def unpackage_message(wire_data: Union[bytes, bytearray]) -> tuple:
    """
    Unpackage a wire format message.

    Args:
        wire_data: 10-byte wire format message

    Returns:
        Tuple of (message_type, data, parity_byte, is_valid)

    Raises:
        ValueError: If wire data is invalid length
        TypeError: If wire data type is unsupported
    """
    if not isinstance(wire_data, (bytes, bytearray)):
        raise TypeError(f"Wire data must be bytes or bytearray, got {type(wire_data)}")

    if len(wire_data) != 10:
        raise ValueError(f"Wire data must be exactly 10 bytes, got {len(wire_data)} bytes")

    wire_bytes = bytes(wire_data)

    msg_type = wire_bytes[0]
    data = wire_bytes[1:9]
    received_parity = wire_bytes[9]

    # Calculate expected parity
    expected_parity = _calculate_even_parity(wire_bytes[:9])
    is_valid = (received_parity == expected_parity)

    return msg_type, data, received_parity, is_valid


def format_wire_message(wire_data: bytes, msg_name: str = None) -> str:
    """
    Format wire message with ANSI colors highlighting type, data, and parity.

    Args:
        wire_data: 10-byte wire format message
        msg_name: Optional message name for display

    Returns:
        Colored hex string showing [TYPE] [DATA...] [PARITY]
    """
    if len(wire_data) != 10:
        return f"{Colors.RED}Invalid message length: {len(wire_data)} bytes{Colors.RESET}"

    type_byte = f"{Colors.RED}{wire_data[0]:02X}{Colors.RESET}"
    data_bytes = f"{Colors.GREEN}{' '.join(f'{b:02X}' for b in wire_data[1:9])}{Colors.RESET}"
    parity_byte = f"{Colors.BLUE}{wire_data[9]:02X}{Colors.RESET}"

    if msg_name:
        name_part = f"{Colors.YELLOW}[{msg_name:6s}]{Colors.RESET} "
    else:
        name_part = ""

    return f"{name_part}[{type_byte} {data_bytes} {parity_byte}]"


def format_wire_data(wire_data: bytes) -> str:
    """Format wire data for simple display without colors."""
    hex_str = ' '.join(f'{b:02X}' for b in wire_data)
    return f"[{hex_str}]"
