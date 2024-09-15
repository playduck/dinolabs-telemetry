import zlib # crc32
import datetime # generate timestmap
from cobs import cobs # COBS endoding
import data.proto.payload_pb2 as payload # generated protobuf description

## BEGIN DEBUG FUNCTIONS ##

DEBUG_WIDTH_CHARS = 80
def debug_center_string(string) -> str:
    import math # debug only

    padding = (DEBUG_WIDTH_CHARS - (len(string) - 2)) / 2
    return f"{'-' * math.floor(padding)} {string} {'-' * math.ceil(padding)}"

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

def debug_parse_buffer(buffer: bytearray) -> None:

    # find first occourance of a null byte in the message
    first_null_byte = buffer.find(b'\x00')
    # decode COBS
    unpackaged = cobs.decode(buffer[:first_null_byte])

    # calcualte the CRC on the pacakge
    # this takes into account that the first five bytes are the flag and existing CRC
    crc32 = __calculate_crc(unpackaged)

    # decode the protobuf message
    msg = payload.PayloadPacakge()
    msg.ParseFromString(bytes(unpackaged))

    print(debug_center_string("Parsed Protobuf"))
    print(msg)

    # compare the protobuf's CRC with the calculated CRC
    if(msg.crc32 != crc32):
        print("CRC Mismatch!")
    else:
        print("Message parsed successfully")

## BEGIN API FUNCTIONS ##

# get a fresh POSIX compliant __timestamp
def __timestamp() -> int:
    # this avoid immsgementation specifics from time.time()
    unix_timestamp = int(datetime.datetime.now().timestamp()) * 1000
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
def serialize(msg: payload.PayloadPacakge) -> bytearray:
    if(msg is None):
        return bytearray(0)
    if(type(msg) != payload.PayloadPacakge):
        return bytearray(0)

    msg.crc32 = 0xDEADBEEF # insert later
    msg.version = payload.Versions.Version_1
    msg.timestamp = __timestamp()

    buffer_str = msg.SerializeToString()

    buffer = __append_crc(buffer_str)

    buffer = cobs.encode(buffer)
    buffer += b'\x00' # append terminating null byte

    return buffer

## BEGIN EXAMPLE FUNCTIONS ##
MESSAGE_TYPES = ["SystemStatus","PowerState","CoolingState","ExperiementState"]

# generate an encoded buffer of a random type
state = 0
def example_generate_random_buffer() -> bytearray:
    global state

    msg = payload.PayloadPacakge()
    example_populate_data(msg, MESSAGE_TYPES[state])
    buffer = serialize(msg)

    state = (state + 1) % len(MESSAGE_TYPES)

    return buffer

exp_board_state = 0
# populate a protobuf with dummy datr for a given type
def example_populate_data(msg: payload.PayloadPacakge, type: str) -> payload.PayloadPacakge:
    global exp_board_state
    import random
    import math

    time = __timestamp()

    match(type):
        case "SystemStatus":
            # populate data
            msg.SystemStatus.currentPayloadState = 0x01
            msg.SystemStatus.lastFCSState = 0x05
            msg.SystemStatus.rawErrorCount = 0
            msg.SystemStatus.cpuUsage = random.uniform(0.05, 0.6)
            msg.SystemStatus.storageCapacity = 63242
            msg.SystemStatus.IMU.accX = 0.0
            msg.SystemStatus.IMU.accY = 1.0
            msg.SystemStatus.IMU.accZ = 0.0
            msg.SystemStatus.IMU.gyroX = 0.0
            msg.SystemStatus.IMU.gyroY = 0.0
            msg.SystemStatus.IMU.gyroZ = 0.0
        case "PowerState":
            msg.PowerState.V_Battery = random.uniform(14, 16.5)
            msg.PowerState.I_Battery = random.uniform(1.2, 3)

            msg.PowerState.V_Charge_Input = random.uniform(35.1, 36.2)
            msg.PowerState.I_Charge_Input = random.uniform(0.01, 0.6)
            msg.PowerState.I_Charge_Battery = random.uniform(0.8, 1.2)

            msg.PowerState.V_Rail_12V = random.uniform(11.5, 12.2)
            msg.PowerState.I_Rail_12V = random.uniform(0.8,1)
            msg.PowerState.V_Rail_5V =random.uniform(4.5, 5.2)
            msg.PowerState.I_Rail_5V = random.uniform(1.0, 2.0)
            msg.PowerState.V_Rail_3V3 = random.uniform(3.18, 3.65)
            msg.PowerState.I_Rail_3V3 = random.uniform(0.7, 1.2)

            msg.PowerState.powerState = 0x12
        case "CoolingState":
            msg.CoolingState.TopTEC.TECVoltage = 6 + 2 * math.sin(time / 5000.0)
            msg.CoolingState.TopTEC.TECCurrent = random.uniform(0.7, 2.5)

            msg.CoolingState.BottomTEC.TECVoltage = 5 + 3 * math.cos(time / 5000.0)
            msg.CoolingState.BottomTEC.TECCurrent = random.uniform(0.7, 2.5)

            msg.CoolingState.fan.FanVoltage = random.uniform(11.5, 12.1)
            msg.CoolingState.fan.FanCurrent = random.uniform(0.7, 0.9)

            msg.CoolingState.Temp_Top_Cool_Side = random.uniform(18, 22)
            msg.CoolingState.Temp_Bottom_Cool_Side = random.uniform(18, 22)
            msg.CoolingState.Temp_Hot_Side = random.uniform(35, 50)

            msg.CoolingState.overtempEventOccured = 0x00

        case "ExperiementState":
            msg.ExperiementState.boardId = exp_board_state
            exp_board_state = (exp_board_state + 1) % 2

            msg.ExperiementState.sensors.add(
                averageRawOpticalPower = random.uniform(0, 20),
                photodiodeVoltage = random.uniform(0, 3.3),
            )
            msg.ExperiementState.sensors.add(
                averageRawOpticalPower = random.uniform(0, 20),
                photodiodeVoltage = random.uniform(0, 3.3),
            )
            msg.ExperiementState.sensors.add(
                averageRawOpticalPower = random.uniform(0, 20),
                photodiodeVoltage = random.uniform(0, 3.3),
            )
            msg.ExperiementState.sensors.add(
                averageRawOpticalPower = random.uniform(0, 20),
                photodiodeVoltage = random.uniform(0, 3.3),
            )

# example message generation
def example_generate_package():

    for message_type in MESSAGE_TYPES:
        print(debug_center_string(message_type))

        msg = payload.PayloadPacakge() # create the protobuf
        example_populate_data(msg, message_type) # add the data
        buffer = serialize(msg) # serialize to wire-ready format

        print(debug_center_string("Serialized Buffer"))
        print(debug_print_bytestr(buffer))
        debug_parse_buffer(buffer)

# script entry point
if __name__ == "__main__":
    example_generate_package()
