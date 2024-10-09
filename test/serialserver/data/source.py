import zlib # crc32
import datetime # generate timestmap
from cobs import cobs # COBS endoding
import data.proto.payload_pb2 as payload # generated protobuf description

## BEGIN DEBUG FUNCTIONS ##
import random

SCALING_FACTOR = 1000.0
DEBUG_WIDTH_CHARS = 80
# center a string on screen
def debug_center_string(string) -> str:
    import math # debug only

    padding = (DEBUG_WIDTH_CHARS - (len(string) - 2)) / 2
    return f"{'-' * math.floor(padding)} {string} {'-' * math.ceil(padding)}"

# pretty-print a byte string array
def debug_print_bytestr(arr: bytearray) -> str:
    original_length = len(arr)
    # Zero-pad the bytearray to ensure it fills the last row
    padding_size = 16 - (len(arr) % 16)
    if padding_size != 16:
        arr += bytearray(padding_size)

    result = ""
    for i in range(0, len(arr), 16):
        chunk = arr[i:i+16]
        hex_str = ""
        ascii_str = ""
        for j, byte in enumerate(chunk):
            if i + j >= original_length:
                # If this is a padding byte, color it black on a white background
                hex_str += f"\033[40;30m{byte:02x}\033[0m "
                ascii_str += f"\033[40;30m{chr(byte) if 32 <= byte <= 126 else '.'}\033[0m"
            else:
                hex_str += f"{byte:02x} "
                ascii_str += chr(byte) if 32 <= byte <= 126 else "."
        result += f"{i:08x}: {hex_str} | {ascii_str}\n"
    result += f"Total length: {original_length} bytes\n"
    return result.rstrip()

# parse data from a cobs encoded buffer
def debug_parse_buffer(buffer: bytearray) -> None:

    # find first occourance of a null byte in the message
    first_null_byte = buffer.find(b'\x00')
    # decode COBS
    unpackaged = cobs.decode(buffer[:first_null_byte])

    # calcualte the CRC on the pacakge
    # this takes into account that the first five bytes are the flag and existing CRC
    crc32 = __calculate_crc(unpackaged)

    # decode the protobuf message
    msg = payload.PayloadPackage()
    msg.ParseFromString(bytes(unpackaged))

    print(debug_center_string("Parsed Protobuf"))
    print(msg)

    # compare the protobuf's CRC with the calculated CRC
    if(msg.crc32 != crc32):
        print("CRC Mismatch!")
    else:
        print("Message parsed successfully")

# debug function to generate data from a uniform distribution between two bounds
def debug_uniform(low: float, high: float) -> int:
    return int(round(random.uniform(low, high) * SCALING_FACTOR, 0))

## BEGIN API FUNCTIONS ##
# get a fresh POSIX compliant __timestamp
def __timestamp() -> int:
    # this avoid immsgementation specifics from time.time()
    unix_timestamp = int(round(datetime.datetime.now().timestamp() * 1000, 0))
    return unix_timestamp

CRC_LENGTH_BYTES = 4
CRC_BUFFER_OFFSET_BYTES = 1
def __calculate_crc(buffer: bytearray) -> int:
    # first 5 bytes are: 1 byte flag field, 4 crc bytes
    buffer_without_crc = buffer[CRC_BUFFER_OFFSET_BYTES + CRC_LENGTH_BYTES : ]
    crc32 = zlib.crc32(buffer_without_crc, 0)
    return crc32

# calculate and prepend the CRC32 from a serialized protobuf
def __append_crc(buffer_str: str) -> bytearray:
    buffer = bytearray(buffer_str)
    crc32 = __calculate_crc(buffer_str)
    crc32_bytes = crc32.to_bytes(CRC_LENGTH_BYTES, 'little')

    # insert crc at index 1:5
    buffer[CRC_BUFFER_OFFSET_BYTES:CRC_BUFFER_OFFSET_BYTES + CRC_LENGTH_BYTES] = crc32_bytes

    return buffer

# serialize a protobuf package to a bytestream
def serialize(msg: payload.PayloadPackage) -> bytearray:
    if(msg is None):
        return bytearray(0)
    if(type(msg) != payload.PayloadPackage):
        return bytearray(0)

    msg.crc32 = 0xDEADBEEF # insert later
    msg.timestamp = __timestamp()

    buffer_str = msg.SerializeToString()

    buffer = __append_crc(buffer_str)

    buffer = cobs.encode(buffer)
    buffer += b'\x00' # append terminating null byte

    # Prepend the length of the buffer as a single byte
    length_byte = len(buffer).to_bytes(1, 'little')
    buffer = length_byte + buffer

    return buffer

## BEGIN EXAMPLE FUNCTIONS ##
MESSAGE_TYPES = ["SystemStatus","PowerState","CoolingState","ExperiementState"]

# generate an encoded buffer of a random type
state = 0
def example_generate_random_buffer() -> bytearray:
    global state

    msg = payload.PayloadPackage()
    example_populate_data(msg, MESSAGE_TYPES[state])
    buffer = serialize(msg)

    state = (state + 1) % len(MESSAGE_TYPES)

    return buffer

exp_board_state = 0
# populate a protobuf with dummy datr for a given type
def example_populate_data(msg: payload.PayloadPackage, type: str) -> payload.PayloadPackage:
    global exp_board_state
    import math

    time = __timestamp()

    match(type):
        case "SystemStatus":
            # populate data
            msg.SystemStatus.currentPayloadState = 0x01
            msg.SystemStatus.lastFCSState = 0x05
            msg.SystemStatus.rawErrorCount = 0
            msg.SystemStatus.cpuUsage = debug_uniform(0, 100)
            msg.SystemStatus.storageCapacity = 63242
            msg.SystemStatus.IMU.accX = int(round(0.0 * SCALING_FACTOR, 0))
            msg.SystemStatus.IMU.accY = int(round(1.0 * SCALING_FACTOR, 0))
            msg.SystemStatus.IMU.accZ = int(round(0.0 * SCALING_FACTOR, 0))
            msg.SystemStatus.IMU.gyroX = int(round(0.0 * SCALING_FACTOR, 0))
            msg.SystemStatus.IMU.gyroY = int(round(0.0 * SCALING_FACTOR, 0))
            msg.SystemStatus.IMU.gyroZ = int(round(0.0 * SCALING_FACTOR, 0))
        case "PowerState":
            msg.PowerState.V_Battery = debug_uniform(14, 16.5)
            msg.PowerState.I_Battery = debug_uniform(1.2, 3)

            msg.PowerState.V_Charge_Input = debug_uniform(35.1, 36.2)

            msg.PowerState.V_Rail_12V = debug_uniform(11.5, 12.2)
            msg.PowerState.I_Rail_12V = debug_uniform(0.8,1)
            msg.PowerState.V_Rail_5V =debug_uniform(4.5, 5.2)
            msg.PowerState.I_Rail_5V = debug_uniform(1.0, 2.0)
            msg.PowerState.V_Rail_3V3 = debug_uniform(3.18, 3.65)
            msg.PowerState.I_Rail_3V3 = debug_uniform(0.7, 1.2)

            msg.PowerState.powerState = 0b0000_0110
        case "CoolingState":
            msg.CoolingState.TopTEC.TECVoltage = int((6 + 2 * math.sin(time / 5000.0)) * SCALING_FACTOR)
            msg.CoolingState.TopTEC.TECCurrent = debug_uniform(0.7, 2.5)

            msg.CoolingState.BottomTEC.TECVoltage = int((5 + 3 * math.cos(time / 5000.0)) * SCALING_FACTOR)
            msg.CoolingState.BottomTEC.TECCurrent = debug_uniform(0.7, 2.5)

            msg.CoolingState.fan.FanPWM = debug_uniform(0, 1024)

            msg.CoolingState.Temp_Top_Cool_Side = debug_uniform(18, 22)
            msg.CoolingState.Temp_Bottom_Cool_Side = debug_uniform(18, 22)
            msg.CoolingState.Temp_Hot_Side = debug_uniform(35, 50)

        case "ExperiementState":
            msg.ExperiementState.boardId = exp_board_state
            exp_board_state = (exp_board_state + 1) % 2

            msg.ExperiementState.sensors.add(
                averageRawOpticalPower = debug_uniform(0, 20),
                photodiodeVoltage = debug_uniform(0, 3.3),
            )
            msg.ExperiementState.sensors.add(
                averageRawOpticalPower = debug_uniform(0, 20),
                photodiodeVoltage = debug_uniform(0, 3.3),
            )
            msg.ExperiementState.sensors.add(
                averageRawOpticalPower = debug_uniform(0, 20),
                photodiodeVoltage = debug_uniform(0, 3.3),
            )
            msg.ExperiementState.sensors.add(
                averageRawOpticalPower = debug_uniform(0, 20),
                photodiodeVoltage = debug_uniform(0, 3.3),
            )

# example message generation
def example_generate_package():

    for message_type in MESSAGE_TYPES:
        print(debug_center_string(message_type))

        msg = payload.PayloadPackage() # create the protobuf
        example_populate_data(msg, message_type) # add the data
        buffer = serialize(msg) # serialize to wire-ready format

        print(debug_center_string("Serialized Buffer"))
        print(debug_print_bytestr(buffer))
        debug_parse_buffer(buffer)

# script entry point
if __name__ == "__main__":
    example_generate_package()
