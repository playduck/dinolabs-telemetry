import zlib # crc32
import datetime # generate timestmap
from cobs import cobs # COBS endoding
import proto.payload_pb2 as payload # generated protobuf description

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
    unix_timestamp = int(datetime.datetime.now().timestamp())
    return unix_timestamp

CRC_LENGTH_BYTES = 4
CRC_BUFFER_OFFSET_BYTES = 1
def __calculate_crc(buffer: bytearray) -> int:
    # first 5 bytes are: 1 byte flag field, 4 crc bytes
    buffer_without_crc = buffer[CRC_BUFFER_OFFSET_BYTES + CRC_LENGTH_BYTES:]
    crc32 = zlib.crc32(buffer_without_crc)
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

# populate a protobuf with dummy datr for a given type
def populate_data(msg: payload.PayloadPacakge, type: str) -> payload.PayloadPacakge:
    match(type):
        case "SystemStatus":
            # populate data
            msg.SystemStatus.currentPayloadState = 0x01
            msg.SystemStatus.lastFCSState = 0x05
            msg.SystemStatus.rawErrorCount = 0
            msg.SystemStatus.cpuUsage = 0.24
            msg.SystemStatus.storageCapacity = 63242
            msg.SystemStatus.IMU.accX = 0.0
            msg.SystemStatus.IMU.accY = 2.0
            msg.SystemStatus.IMU.accZ = 0.0
            msg.SystemStatus.IMU.gyroX = 0.0
            msg.SystemStatus.IMU.gyroY = 0.0
            msg.SystemStatus.IMU.gyroZ = 0.0
        case "PowerState":
            msg.PowerState.V_Battery = 16.4
            msg.PowerState.I_Battery = 2.52

            msg.PowerState.V_Charge_Input = 36.01
            msg.PowerState.I_Charge_Input = 0.62
            msg.PowerState.I_Charge_Battery = 1.26

            msg.PowerState.V_Rail_12V = 12.2
            msg.PowerState.I_Rail_12V = 0.93
            msg.PowerState.V_Rail_5V = 5.12
            msg.PowerState.I_Rail_5V = 1.62
            msg.PowerState.V_Rail_3V3 = 3.27
            msg.PowerState.I_Rail_3V3 = 0.96

            msg.PowerState.powerState = 0x12
        case "CoolingState":
            msg.CoolingState.TopTEC.TECVoltage = 7.55
            msg.CoolingState.TopTEC.TECCurrent = 1.77

            msg.CoolingState.BottomTEC.TECVoltage = 5.55
            msg.CoolingState.BottomTEC.TECCurrent = 0.99

            msg.CoolingState.fan.FanVoltage = 12.01
            msg.CoolingState.fan.FanCurrent = 0.874

            msg.CoolingState.Temp_Top_Cool_Side = 19.93
            msg.CoolingState.Temp_Bottom_Cool_Side = 20.16
            msg.CoolingState.Temp_Hot_Side = 44.1

            msg.CoolingState.overtempEventOccured = 0x00

        case "ExperiementState":
            msg.ExperiementState.boardId = 1 # top or bottom
            msg.ExperiementState.sensors.add(
                averageRawOpticalPower = 0.5,
                photodiodeVoltage = 0.256,
            )
            msg.ExperiementState.sensors.add(
                averageRawOpticalPower = 0.1,
                photodiodeVoltage = 0.152,
            )
            msg.ExperiementState.sensors.add(
                averageRawOpticalPower = 22.5,
                photodiodeVoltage = 2.533,
            )
            msg.ExperiementState.sensors.add(
                averageRawOpticalPower = 0.2,
                photodiodeVoltage = 0.11,
            )

# example message generation
def generate_package():

    message_types = ["SystemStatus","PowerState","CoolingState","ExperiementState"]

    for message_type in message_types:
        print(debug_center_string(message_type))
        msg = payload.PayloadPacakge() # create the protobuf
        populate_data(msg, message_type) # add the data
        buffer = serialize(msg) # serialize to wire-ready format

        print(debug_center_string("Serialized Buffer"))
        print(debug_print_bytestr(buffer))
        debug_parse_buffer(buffer)

# script entry point
if __name__ == "__main__":
    generate_package()
