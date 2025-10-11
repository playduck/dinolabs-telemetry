#!/usr/bin/env python3

# serial_link.py - Tool for sending/receiving protobuf stream from WARP
#
# Author: Bernhard Vorhofer, Niklas Gierse
#
# Code for sending/receiving delimited protobufs from https://krpc.github.io/krpc/communication-protocols/tcpip.html
#

from aioconsole import ainput
import sys

sys.path.append("scripts")
import message_pb2
import socket
import asyncio
import time
import json
import math
import threading
import serial
import serial.threaded
import serial.tools.list_ports
import sys
from google.protobuf.message import DecodeError
from google.protobuf.json_format import MessageToJson, MessageToDict


class SerialToNet(serial.threaded.Protocol):
    """serial->socket"""

    def __init__(self):
        self.socket = None

    def __call__(self):
        return self

    def data_received(self, data):
        if self.socket is not None:
            self.socket.sendall(data)


_EXIT = False

# TCP servers
# Local
IP_ADDR_LOCAL = 'localhost'
IP_PORT_LOCAL = 7777
# MCS
IP_ADDR_MCS = '192.168.178.200'
IP_PORT_MCS = 10003
# RGS
IP_ADDR_RGS = '192.168.1.201'
IP_PORT_RGS = 10003

# Plotjuggler server address to send telemetry to
PLOTJUGGLER_ADDR = '127.0.0.1'
PLOTJUGGLER_PORT = 9870

# Coordinates of pad for downrange distance calculations
PAD_LAT = 39.39046
PAD_LON = -8.288487
PAD_AZIMUTHD = 133  # Launch azimuth in degrees
PAD_MC_DISTANCE = 570  # meters between mission control and pad

# Recording
RECORD = False
RECORDING_FILE = None
REC_FIRST_WRITE = True

LOG_FILE = None
LOG_READING = False
LOGFILE_SIZE = 0
LOGFILE_NO = 0
_SEND_LOG_READ_ON_CMD_ACK = False

# Packet health tracking
n_good = 0
n_bad = 0

# Mission tracking
mission_started = False
mission_start_time = time.time()

# Print flags
print_health = False
print_health_lock = False
print_load = False
print_load_lock = False
print_packet_info = False
print_packet_info_lock = False
print_flight = False
print_crc = True
print_pyro = False

# Flight mode data
flight_phase = 0
rocket_alt = 0.0
rocket_vel = 0.0
rocket_acc = 0.0
rocket_gnss = message_pb2.GNSSData()

# Throttling
min_send_interval_ns = 0


def set_min_send_interval(ms: int):
    global min_send_interval_ns
    min_send_interval_ns = int((ms if ms >= 0 else 0) * 1_000_000)


start_throttle = True
send_lock = asyncio.Lock()
last_send_time_ns = 0
set_min_send_interval(1)


def get_time_now():
    return time.time()


def calc_crc32(buf: bytes):
    crc = 0xFFFFFFFF
    for b in buf:
        crc ^= b
        for i in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xEDB88320
            else:
                crc >>= 1

    if ~crc < 0:
        return ~crc + (1 << 32)
    else:
        return ~crc


def send_to_plotjuggler(sock, dict):
    try:
        sock.sendto(json.dumps(dict).encode(), (PLOTJUGGLER_ADDR, PLOTJUGGLER_PORT))
    except Exception:
        pass


def ser2net_work(srv, serial_worker, ser, ser_to_net):
    global _EXIT, IP_PORT_LOCAL

    try:
        # print(f"Started internal ser2net server on {IP_PORT_LOCAL}")
        client_socket, addr = srv.accept()
        # print(f"Connected by {addr}")

        # More quickly detect bad clients who quit without closing the
        # connection: After 1 second of idle, start sending TCP keep-alive
        # packets every 1 second. If 3 consecutive keep-alive packets
        # fail, assume the client is gone and close the connection.
        try:
            client_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPIDLE, 1)
            client_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPINTVL, 1)
            client_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_KEEPCNT, 3)
            client_socket.setsockopt(socket.SOL_SOCKET, socket.SO_KEEPALIVE, 1)
        except AttributeError:
            pass  # XXX not available on windows
        client_socket.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)

        try:
            ser_to_net.socket = client_socket
            # Enter network <-> serial loop
            while True:
                try:
                    data = client_socket.recv(1024)
                    if not data:
                        break
                    ser.write(data)  # get a bunch of bytes and send them
                except socket.error as msg:
                    sys.stderr.write('ERROR: {}\n'.format(msg))
                    # probably got disconnected
                    break
        except KeyboardInterrupt:
            _EXIT = True
            raise
        except socket.error as msg:
            sys.stderr.write('ERROR: {}\n'.format(msg))
        finally:
            ser_to_net.socket = None
            client_socket.close()
    except KeyboardInterrupt:
        pass

    serial_worker.stop()


def start_ser2net(pre_sel_port: str = ""):
    global _EXIT, IP_PORT_LOCAL

    # First, find available serial ports, and select the one to use
    ser_port = "/dev/ttyUSB0"
    if pre_sel_port != "":
        ser_port = pre_sel_port
    else:
        # Get list of ports and remove /dev/ttyS... ports
        port_list = list(serial.tools.list_ports.comports())
        for i in reversed(range(len(port_list))):
            if port_list[i].device.startswith("/dev/ttyS"):
                port_list.remove(port_list[i])
                i = i - 1
            i = i - 1

        # Select the one available port,
        # or make the user select if more than 1 exist
        if len(port_list) == 0:
            print("No available serial ports. Try again.")
            exit(1)
        elif len(port_list) == 1:
            ser_port = port_list[0].device
        else:
            # List ports
            port_index = 0
            print("Available serial ports:")
            for port in port_list:
                port_index = port_index + 1
                print(f"{port_index}: {port.device} - {port.description}")
            sel = input("Select port to use: ")

            # Get selection from user
            try:
                if int(sel) <= len(port_list) and int(sel) > 0:
                    ser_port = port_list[int(sel) - 1].device
                else:
                    print("Invalid option.")
                    exit(1)
            except ValueError:
                print("Invalid option.")
                exit(1)

    # Start using the selected serial port
    ser = serial.serial_for_url(ser_port, do_not_open=True)
    ser.baudrate = 460800

    try:
        print(f"Opening serial port {ser_port}")
        ser.open()
    except serial.SerialException:
        print("Could not open serial port. Try again.")
        exit(1)

    ser_to_net = SerialToNet()
    serial_worker = serial.threaded.ReaderThread(ser, ser_to_net)
    serial_worker.start()

    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind(('', IP_PORT_LOCAL))
    srv.listen(1)

    server_worker = threading.Thread(target=ser2net_work, args=(srv, serial_worker, ser, ser_to_net))
    server_worker.start()

    return server_worker


def is_serial_port(s: str):
    ports = list(serial.tools.list_ports.grep(s))

    return len(ports) > 0


def enable_recording():
    global RECORD, RECORDING_FILE, REC_FIRST_WRITE

    if RECORD:
        print("Already recording!")
        return

    print("Enabling recording")

    filename = 'local_recordings/warp_' + time.strftime("%Y%m%d-%H%M%S") + '.json'

    if RECORDING_FILE is not None:
        RECORDING_FILE.close()

    RECORDING_FILE = open(filename, "w")
    RECORDING_FILE.write('[')
    REC_FIRST_WRITE = True
    RECORD = True


def disable_recording():
    global RECORD, RECORDING_FILE, REC_FIRST_WRITE

    if not RECORD:
        print("Recording already inactive!")

    print("Disabling recording")

    if RECORDING_FILE is not None:
        RECORDING_FILE.write(']')
        RECORDING_FILE.close()

    RECORDING_FILE = None
    REC_FIRST_WRITE = False
    RECORD = False


async def start_log_read(writer, file_no: int):
    global LOG_FILE, LOG_READING, LOGFILE_SIZE, LOGFILE_NO
    LOGFILE_NO = file_no
    LOG_FILE = open(f"warp_logs_raw/warplog_{time.strftime("%Y%m%d-%H%M%S")}", "wb")
    LOG_READING = True
    LOGFILE_SIZE = 0
    print("Starting logfile read")

    await send_read_logfile(writer, False)


def write_to_log_read(buf: bytes, size: int, read_more: bool):
    global LOG_FILE, LOG_READING, LOGFILE_SIZE, _SEND_LOG_READ_ON_CMD_ACK
    if not LOG_READING:
        print("Erroneously reading log!")
        return

    # write
    if len(buf) < size:
        print("Log data size too small!")
    LOG_FILE.write(buf[:size])
    LOGFILE_SIZE += size

    print(f"Reading logfile ({LOGFILE_SIZE} bytes)")

    if read_more:
        _SEND_LOG_READ_ON_CMD_ACK = True


def end_log_read():
    global LOG_FILE, LOG_READING, LOGFILE_SIZE
    LOG_READING = False
    LOG_FILE.close()
    print(f"Finished reading log file ({LOGFILE_SIZE} bytes)")


def print_one_pyro(state: bool):
    if state:
        return "ON"
    else:
        return "OFF"


def print_cont(state: bool):
    if state:
        return "YES"
    else:
        return "NO"


def print_pyros(pyros: list, conts: list, cont_on: bool):
    if len(pyros) < 4 or len(conts) < 4:
        return
    print(
        f"PYROS {print_one_pyro(pyros[0])} {print_one_pyro(pyros[1])} {print_one_pyro(pyros[2])} {print_one_pyro(pyros[3])}")
    pre = ""
    if not cont_on:
        pre = "\33[33m(measurement off)\33[0m "
    print(
        f"CONTINUITIES {pre}{print_cont(conts[0])} {print_cont(conts[1])} {print_cont(conts[2])} {print_cont(conts[3])}")


def print_gnss(pb, print_alt: bool = True):
    global PAD_LAT, PAD_LON, PAD_AZIMUTHD, PAD_MC_DISTANCE
    alt = pb.altitude
    fix = pb.fix
    lat = pb.latitude
    lon = pb.longitude
    rocket_lat = lat
    rocket_lon = lon

    lat_deg = math.floor(lat)
    lat = lat - lat_deg
    lat_min = math.floor(lat * 60.0)
    lat = lat - (lat_min / 60.0)
    lat_sec = math.floor(lat * 3600.0)

    lon_post = "E"
    if lon < 0:
        lon_post = "W"
    lon = abs(lon)
    lon_deg = math.floor(lon)
    lon = lon - lon_deg
    lon_min = math.floor(lon * 60.0)
    lon = lon - (lon_min / 60.0)
    lon_sec = math.floor(lon * 3600.0)

    if print_alt:
        print(f"GPS ({fix}): {lat_deg}°{lat_min}'{lat_sec}\"N {lon_deg}°{lon_min}'{lon_sec}\"{lon_post} - {alt:.2f} m")
    else:
        print(f"GPS ({fix}): {lat_deg}°{lat_min}'{lat_sec}\"N {lon_deg}°{lon_min}'{lon_sec}\"{lon_post}")

    # Calculate downrange distance
    R = 6371000
    phi1 = math.radians(rocket_lat)
    phi2 = math.radians(PAD_LAT)
    delta_phi = phi2 - phi1
    delta_lambda = math.radians(PAD_LON) - math.radians(rocket_lon)

    a = math.sin(delta_phi / 2) * math.sin(delta_phi / 2) + math.cos(phi1) * math.cos(phi2) * math.sin(
        delta_lambda / 2) * math.sin(delta_lambda / 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    d = R * c

    # Calculate azimuth pointing towards the rocket
    # https://en.wikipedia.org/wiki/Great-circle_navigation#Course
    azi_rocket = math.atan2(math.cos(rocket_lat) * math.sin(rocket_lon - PAD_LON),
                            math.cos(PAD_LAT) * math.sin(rocket_lat) - math.sin(PAD_LAT) * math.cos(
                                rocket_lat) * math.cos(rocket_lon - PAD_LON))

    projected_distance = d * math.cos(azi_rocket - PAD_AZIMUTHD * (math.pi / 180))

    safety_color = "\033[42m"  # green
    if projected_distance < 0:
        safety_color = "\033[43m"  # orange
    elif projected_distance + PAD_MC_DISTANCE < 200:
        safety_color = "\033[41m"  # red
    print(
        f"Downrange Distance {math.floor(d)} m --- {safety_color}{math.floor(projected_distance)} m along rail azimuth\033[0m")


def print_nav(data):
    alt = data.altitude
    vel = data.velocity
    acc = data.acceleration
    cov_alt = data.covariance_alt
    cov_vel = data.covariance_vel
    cov_acc = data.covariance_acc
    imu_sel = data.selected_input
    baro_sel = data.selected_measurement

    print(f"ALT: {alt:7.2f} VEL: {vel:5.2f} ACC: {acc:5.2f}   cov: {cov_alt:9.4f} {cov_vel:7.4f} {cov_acc:6.4f}")
    print(f"IMU source {imu_sel} --- Baro source {baro_sel}")


def get_phase_name(number: int):
    if number == 0:
        return "STARTUP"
    elif number == 1:
        return "PREFLIGHT"
    elif number == 2:
        return "LAUNCH READY"
    elif number == 3:
        return "BOOST"
    elif number == 4:
        return "COAST"
    elif number == 5:
        return "DROGUE DESCENT"
    elif number == 6:
        return "MAIN DESCENT"
    elif number == 7:
        return "LANDED"


def print_sensor_health(data):
    sensors = ""
    if not data.mcu_adc:
        sensors = sensors + " mcu_adc"
    if not data.highg:
        sensors = sensors + " highg"
    if not data.ads1:
        sensors = sensors + " ads1"
    if not data.ads2:
        sensors = sensors + " ads2"
    if not data.ads3:
        sensors = sensors + " ads3"
    if not data.gnss:
        sensors = sensors + " gnss"
    if not data.imu1:
        sensors = sensors + " imu1"
    if not data.imu2:
        sensors = sensors + " imu2"
    if not data.baro1:
        sensors = sensors + " baro1"
    if not data.baro2:
        sensors = sensors + " baro2"
    if not data.thermo1:
        sensors = sensors + " thermo1"
    if not data.thermo2:
        sensors = sensors + " thermo2"
    if not data.thermo3:
        sensors = sensors + " thermo3"
    if not data.thermo4:
        sensors = sensors + " thermo4"
    if sensors != "":
        print("Unhealthy sensors: " + sensors)


async def recv_message(reader):
    global n_good, n_bad, print_crc

    """ Receive a packet, prefixed with header, from a TCP/IP socket """
    state = 0

    while True:
        one_byte = await reader.read(1)

        if state == 0:
            if one_byte == b'\xFA':
                state = 1
            else:
                continue
        elif state == 1:
            if one_byte == b'\xCE':
                break
            elif one_byte == b'\xFA':
                continue
            else:
                state = 0

    # Receive the checksum of the message data
    data = await reader.readexactly(4)
    checksum = int.from_bytes(data, "little")

    # Receive the size of the message data
    data = await reader.readexactly(2)
    size = int.from_bytes(data, "big")
    if size == 0:
        # Something went wrong
        n_bad = n_bad + 1
        return None
    if size > 255:
        # Unrealistic size
        n_bad = n_bad + 1
        return None

    # Receive the message data
    data = await reader.readexactly(size)

    crc = calc_crc32(data)
    if crc != checksum:
        n_bad = n_bad + 1
        if print_crc:
            print(f"\033[3mCRC Error! Got 0x{checksum:x}, calculated 0x{crc:x}\033[0m")
        return None

    # Decode the message
    pack = message_pb2.Packet()

    try:
        pack.ParseFromString(data)
    except DecodeError:
        print(f"DecodeError ({len(data)} bytes)")
        print(data.hex())
        n_bad = n_bad + 1
        return None

    n_good = n_good + 1
    return pack


async def tcp_reader(reader, writer):
    global _EXIT, RECORD, RECORDING_FILE, REC_FIRST_WRITE, print_health, print_health_lock, print_load, print_load_lock, print_packet_info, print_packet_info_lock, n_good, n_bad, mission_start_time, mission_started, flight_phase, rocket_alt, rocket_vel, rocket_acc, rocket_gnss, print_pyro, _SEND_LOG_READ_ON_CMD_ACK

    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    start_time = time.time()
    flight_print_mark = start_time
    time_mark = start_time

    while True:
        # Print packet info
        if time.time() - time_mark > 1:
            time_mark = time.time()
            n_total = n_good + n_bad
            if print_packet_info:
                print(f"{n_good / n_total * 100.0:.2f}% healthy packets ({n_good}/{n_total})")
                if not print_packet_info_lock:
                    print_packet_info = False
            n_good = n_bad = 0

        # Print flight info
        if time.time() - flight_print_mark > 0.25:
            flight_print_mark = time.time()
            if print_flight:
                if mission_started:
                    mission_time = time.time() - mission_start_time
                    pre = ""
                    if mission_time > 0:
                        pre = "+"
                    print(f"T{pre}{mission_time:.2f}s  ", end="")
                print(
                    f"\33[105m[{get_phase_name(flight_phase)}]\33[0m  \033[1mAlt {rocket_alt:8.1f} Vel {rocket_vel:7.1f} Acc {rocket_acc:7.2f}\033[0m")
                print_gnss(rocket_gnss, print_alt=False)

        if _EXIT:
            if RECORD:
                disable_recording()
            return

        packet = await recv_message(reader)
        if packet is None:
            continue

        for msg in packet.payloads:
            if RECORD:
                json_obj = MessageToJson(msg, always_print_fields_with_no_presence=True)
                # Write comma before new object, except on first write
                if not REC_FIRST_WRITE:
                    RECORDING_FILE.write(',')
                else:
                    REC_FIRST_WRITE = False

                RECORDING_FILE.write(json_obj)

            if msg.WhichOneof("Data") == "command_ack":
                output = True
                if _SEND_LOG_READ_ON_CMD_ACK:
                    _SEND_LOG_READ_ON_CMD_ACK = False
                    await send_read_logfile(writer, output=False)
                    output = False

                response_code = message_pb2.CommandResponse.Result.Name(msg.command_ack.result)
                if not output and response_code == "OK":
                    break

                if response_code == "OK":
                    print(f"Command returned [\033[32m{response_code}\033[0m]")  # green
                else:
                    print(f"Command returned [\033[31m{response_code}\033[0m]")  # red
            elif msg.WhichOneof("Data") == "log_message":
                loglvl = message_pb2.LogMessage.LogLevel.Name(msg.log_message.log_level)

                color = "\33[0m"  # standard
                if loglvl == "ERROR":
                    color = "\33[31m"  # red
                elif loglvl == "WARNING":
                    color = "\33[33m"  # yellow
                elif loglvl == "INFO":
                    color = "\33[94m"  # blue
                print(f"[{color}{loglvl}\33[0m] {msg.log_message.message}")
            elif msg.WhichOneof("Data") == "gnss_data":
                rocket_gnss = msg.gnss_data

                # TODO flag for print
                if False:
                    print_gnss(msg.gnss_data)
            elif msg.WhichOneof("Data") == "rocket_state":
                rocket_alt = msg.rocket_state.altitude
                rocket_vel = msg.rocket_state.velocity
                rocket_acc = msg.rocket_state.acceleration

                # TODO flag for print
                if False:
                    print_nav(msg.rocket_state)

                dict_out = {
                    "timestamp": msg.timestamp / 1000,
                    "altitude": rocket_alt,
                    "velocity": rocket_vel,
                    "acceleration": rocket_acc,
                    "altitude_covariance": msg.rocket_state.covariance_alt,
                    "velocity_covariance": msg.rocket_state.covariance_vel,
                    "acceleration_covariance": msg.rocket_state.covariance_acc
                }
                send_to_plotjuggler(sock, dict_out)
            elif msg.WhichOneof("Data") == "baro_data":
                module_nr = msg.baro_data.module_nr
                press = msg.baro_data.pressure
                temp = msg.baro_data.temperature

                dict_out = {
                    "timestamp": msg.timestamp / 1000,
                    "module_nr": module_nr,
                    "press_Pa": press,
                    "temp_C": temp
                }
                send_to_plotjuggler(sock, dict_out)
            elif msg.WhichOneof("Data") == "thermocouple_data":
                channel = msg.thermocouple_data.channel
                dict_out = {
                    "timestamp": msg.timestamp / 1000,
                    f"t/t{channel}": msg.thermocouple_data.temperature
                }
                send_to_plotjuggler(sock, dict_out)
            elif msg.WhichOneof("Data") == "pressure_data":
                channel = msg.pressure_data.channel
                press_bar = msg.pressure_data.pressure_calib
                dict_out = {
                    "timestamp": msg.timestamp / 1000,
                    f"p/p{channel}": press_bar
                }
                send_to_plotjuggler(sock, dict_out)
            elif msg.WhichOneof("Data") == "rl_triggered":
                print("\033[41mREDLINE TRIGGERED\033[0m")
            elif msg.WhichOneof("Data") == "voltage_data":
                vsup = msg.voltage_data.v_supply
                v24 = msg.voltage_data.v_24
                v5 = msg.voltage_data.v_5
                dict_out = {
                    "timestamp": msg.timestamp / 1000,
                    "vsup": vsup,
                    "v24": v24,
                    "v5": v5
                }
                send_to_plotjuggler(sock, dict_out)
            elif msg.WhichOneof("Data") == "flight_status":
                flight_phase = msg.flight_status.flight_phase
                dict_out = {
                    "timestamp": msg.timestamp / 1000,
                    "flight_phase": msg.flight_status.flight_phase,
                    "liftoff_detect": msg.flight_status.lod_loop
                }
                send_to_plotjuggler(sock, dict_out)

                if flight_phase < 3 and msg.flight_status.lod_loop == 1:
                    # print("\033[41mARMED\033[0m ", end="")
                    pass
            elif msg.WhichOneof("Data") == "pyro_status":
                pyros = [
                    msg.pyro_status.pyro1,
                    msg.pyro_status.pyro2,
                    msg.pyro_status.pyro3,
                    msg.pyro_status.pyro4,
                ]
                continuity = [
                    msg.pyro_status.pyro1_cont,
                    msg.pyro_status.pyro2_cont,
                    msg.pyro_status.pyro3_cont,
                    msg.pyro_status.pyro4_cont,
                ]
                cont_on = msg.pyro_status.cont_measurement_active

                if print_pyro:
                    print_pyros(pyros, continuity, cont_on)
            elif msg.WhichOneof("Data") == "link_loads":
                if print_load:
                    print(
                        f"Downlink bus loads: Serial {(msg.link_loads.serial_link_load * 100):.2f}% - Radio {(msg.link_loads.radio_link_load * 100):.2f}% - Logger {(msg.link_loads.logging_load * 100):.2f}%")
                    if not print_load_lock:
                        print_load = False
            elif msg.WhichOneof("Data") == "warp_config":
                print("\033[1mWARP CONFIG ------------------\033[0m")
                print(f"Sequence revision \033[44m{msg.warp_config.seqn_rev_no}\033[0m")
                print(f"FSM Launch Threshold (acc) {msg.warp_config.fsm_launch_threshold} m/s^2")
                print(f"FSM Launch Detect Period {msg.warp_config.fsm_launch_threshold_period} ms")
                print(f"FSM Engine Cutoff Threshold (acc) {msg.warp_config.fsm_engine_cutoff_threshold} m/s^2")
                print(f"FSM Engine Cutoff max TAL {msg.warp_config.fsm_engine_cutoff_max_tal} ms")
                print(f"FSM Apogee Threshold (vel) {msg.warp_config.fsm_apogee_threshold} m/s")
                print(f"FSM Apogee min TAL {msg.warp_config.fsm_apogee_min_tal} ms")
                print(f"FSM Apogee max TAL \033[44m{msg.warp_config.fsm_apogee_max_tal}\033[0m ms")
                print(f"FSM Main Deploy Threshold (height) {msg.warp_config.fsm_main_deploy_threshold} m")
                print(f"FSM Main Deploy max TAA {msg.warp_config.fsm_main_deploy_max_taa} ms")
                print(f"FSM Touchdown Threshold (|vel|) {msg.warp_config.fsm_touchdown_threshold} m/s")
                print(f"FSM Touchdown Detect Period {msg.warp_config.fsm_touchdown_threshold_period} ms")
                print(f"Pyro Firing Duration {msg.warp_config.pyro_firing_duration} ms")
                print(f"Drogue 1 pyro channel {msg.warp_config.pyro_drogue_1}")
                print(f"Drogue 2 pyro channel {msg.warp_config.pyro_drogue_2}")
                print(f"Main pyro channel {msg.warp_config.pyro_main}")
                print("\033[1m------------------------------\033[0m")
            elif msg.WhichOneof("Data") == "go_nogo":
                print_go = False
                if msg.go_nogo.state == message_pb2.GoNogo.State.GO:
                    if print_go:
                        print("\033[32mWARP is GO\033[0m")
                elif msg.go_nogo.state == message_pb2.GoNogo.State.NOT_READY:
                    if print_go:
                        print("\033[33mWARP is NOT_READY\033[0m")
                elif msg.go_nogo.state == message_pb2.GoNogo.State.NO_GO:
                    if print_go:
                        print("\033[31mWARP is NO_GO\033[0m")
            elif msg.WhichOneof("Data") == "diagnostics":
                smm = msg.diagnostics.task_stack_free_smm
                daq = msg.diagnostics.task_stack_free_daq
                nav = msg.diagnostics.task_stack_free_nav
                fsm = msg.diagnostics.task_stack_free_fsm
                cmd = msg.diagnostics.task_stack_free_cmd
                tlm = msg.diagnostics.task_stack_free_tlm
                dio = msg.diagnostics.task_stack_free_dio
                lim = 32  # no. of words (32-bit)

                if smm < lim or daq < lim or nav < lim or fsm < lim or cmd < lim or tlm < lim or dio < lim:
                    print(
                        f"TASK STACKS CRITICAL - Free Space: SMM {smm} DAQ {daq} NAV {nav} FSM {fsm} CMD {cmd} TLM {tlm} DIO {dio}")
            elif msg.WhichOneof("Data") == "sensor_health":
                if print_health:
                    print_sensor_health(msg.sensor_health)
                    if not print_health_lock:
                        print_health = False
            elif msg.WhichOneof("Data") == "logging_info":
                print("DATALOGGING INFO -------------")
                print(f"Logging active: {str(msg.logging_info.logging_active)}")
                print(f"Number of files: {msg.logging_info.no_of_files}")
                if msg.logging_info.lut_full:
                    print("Block redirect table FULL")
                else:
                    print("Block redirect table OK")
                print(f"Free bytes on flash remaining: {msg.logging_info.free_bytes}")
                if msg.logging_info.no_of_files > 0:
                    print("File sizes:")
                    i = 0
                    for size in msg.logging_info.file_sizes:
                        i = i + 1
                        if size > 0:
                            print(f"File {i - 1} ({size} bytes)")
                print("------------------------------")
            elif msg.WhichOneof("Data") == "logfile_data":
                rcvd_data = msg.logfile_data.log_data
                write_to_log_read(rcvd_data, msg.logfile_data.size_bytes, not msg.logfile_data.finished)
                if msg.logfile_data.finished:
                    end_log_read()
            elif msg.WhichOneof("Data") == "eth_ereg_data":
                index = msg.eth_ereg_data.index
                value = msg.eth_ereg_data.value
                match index:
                    case 0:  # gain p
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "ETH/Gain P": value
                        }
                        send_to_plotjuggler(sock, dict_out)
                    case 1:  # gain i
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "ETH/Gain I": value
                        }
                        send_to_plotjuggler(sock, dict_out)
                    case 2:  # gain d
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "ETH/Gain D": value
                        }
                        send_to_plotjuggler(sock, dict_out)
                    case 3:  # setpoint
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "ETH/Setpoint": value
                        }
                        send_to_plotjuggler(sock, dict_out)
                    case 4:  # active
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "ETH/Active": value
                        }
                        send_to_plotjuggler(sock, dict_out)
                    case 5:  # pt1
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "ETH/PT1": value
                        }
                        send_to_plotjuggler(sock, dict_out)
                    case 6:  # angle
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "ETH/Angle": value
                        }
                        send_to_plotjuggler(sock, dict_out)
                    case _:
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "ETH/?": value
                        }
                        send_to_plotjuggler(sock, dict_out)
            elif msg.WhichOneof("Data") == "lox_ereg_data":
                index = msg.lox_ereg_data.index
                value = msg.lox_ereg_data.value
                match index:
                    case 0:  # gain p
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "LOX/Gain P": value
                        }
                        send_to_plotjuggler(sock, dict_out)
                    case 1:  # gain i
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "LOX/Gain I": value
                        }
                        send_to_plotjuggler(sock, dict_out)
                    case 2:  # gain d
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "LOX/Gain D": value
                        }
                        send_to_plotjuggler(sock, dict_out)
                    case 3:  # setpoint
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "LOX/Setpoint": value
                        }
                        send_to_plotjuggler(sock, dict_out)
                    case 4:  # active
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "LOX/Active": value
                        }
                        send_to_plotjuggler(sock, dict_out)
                    case 5:  # pt1
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "LOX/PT1": value
                        }
                        send_to_plotjuggler(sock, dict_out)
                    case 6:  # angle
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "LOX/Angle": value
                        }
                        send_to_plotjuggler(sock, dict_out)
                    case _:
                        dict_out = {
                            "timestamp": msg.timestamp / 1000,
                            "LOX/?": value
                        }
                        send_to_plotjuggler(sock, dict_out)
            elif msg.WhichOneof("Data") == "fill_lvl_data":
                dict_out = {
                    "timestamp": msg.timestamp / 1000,
                    "Fill-LvL": msg.fill_lvl_data.level
                }
                send_to_plotjuggler(sock, dict_out)
            elif msg.WhichOneof("Data") == "payload_data":
                dict_out = {
                    "timestamp": msg.timestamp / 1000,
                    "payload/0": msg.payload_data.d0,
                    "payload/1": msg.payload_data.d1,
                    "payload/2": msg.payload_data.d2,
                    "payload/3": msg.payload_data.d3,
                    "payload/4": msg.payload_data.d4,
                    "payload/5": msg.payload_data.d5,
                    "payload/6": msg.payload_data.d6,
                    "payload/7": msg.payload_data.d7,
                    "payload/8": msg.payload_data.d8,
                    "payload/9": msg.payload_data.d9
                }
                send_to_plotjuggler(sock, dict_out)
            else:
                json_obj = MessageToJson(msg, always_print_fields_with_no_presence=True)
                try:
                    sock.sendto(json_obj.encode(), (PLOTJUGGLER_ADDR, PLOTJUGGLER_PORT))
                except Exception:
                    pass


async def send_reset(writer):
    cmd = message_pb2.Payload()
    cmd.cmd_reset.SetInParent()
    await send_command(writer, cmd)


async def send_arm(writer, arm: bool, override: bool):
    cmd = message_pb2.Payload()
    cmd.cmd_arm_launch.arm = arm
    cmd.cmd_arm_launch.override = override
    await send_command(writer, cmd)


async def send_cams(writer, ch1: bool, ch2: bool, ch3: bool):
    cmd = message_pb2.Payload()
    cmd.cmd_switch_cams.cam1 = ch1
    cmd.cmd_switch_cams.cam2 = ch2
    cmd.cmd_switch_cams.cam3 = ch3
    await send_command(writer, cmd)


async def send_switch_radio(writer, state: bool):
    cmd = message_pb2.Payload()
    cmd.cmd_switch_radio.state = bool(state)
    await send_command(writer, cmd)


async def send_change_freq(writer, freq: int):
    cmd = message_pb2.Payload()
    cmd.cmd_change_freq.freq_hz = freq
    await send_command(writer, cmd)


async def send_change_tx_power(writer, power: int):
    cmd = message_pb2.Payload()
    cmd.cmd_change_tx_power.tx_power_dbm = power
    await send_command(writer, cmd)


async def send_valves(writer, v1, v2, v3, v4, v5, v6):
    cmd = message_pb2.Payload()
    cmd.cmd_switch_valves.valve1 = bool(v1)
    cmd.cmd_switch_valves.valve2 = bool(v2)
    cmd.cmd_switch_valves.valve3 = bool(v3)
    cmd.cmd_switch_valves.valve4 = bool(v4)
    cmd.cmd_switch_valves.valve5 = bool(v5)
    cmd.cmd_switch_valves.valve6 = bool(v6)
    await send_command(writer, cmd)


async def send_launch(writer):
    cmd = message_pb2.Payload()
    cmd.cmd_launch.SetInParent()
    await send_command(writer, cmd)


async def send_run_test_seqn(writer, number):
    cmd = message_pb2.Payload()
    cmd.cmd_run_test_seqn.seqn_nr = int(number)
    await send_command(writer, cmd)


async def send_abortseqn(writer):
    cmd = message_pb2.Payload()
    cmd.cmd_abort_seqn.SetInParent()
    await send_command(writer, cmd)


async def send_safestate(writer):
    cmd = message_pb2.Payload()
    cmd.cmd_safe_state.SetInParent()
    await send_command(writer, cmd)


async def send_epurge(writer):
    cmd = message_pb2.Payload()
    cmd.cmd_emer_purge.SetInParent()
    await send_command(writer, cmd)


async def send_calib(writer, alt_m, temp_k):
    cmd = message_pb2.Payload()
    cmd.cmd_calibrate_baro.local_temp_k = float(temp_k)
    cmd.cmd_calibrate_baro.local_altitude_m = float(alt_m)
    await send_command(writer, cmd)


async def send_adjust_fsm_timing(writer, timer: message_pb2.CMD_AdjustFSMTiming.Timer, time: int):
    cmd = message_pb2.Payload()
    cmd.cmd_adjust_fsm_timing.timer = timer
    cmd.cmd_adjust_fsm_timing.new_time = time
    await send_command(writer, cmd)


async def send_adjust_fsm_threshold(writer, threshold: message_pb2.CMD_AdjustFSMThreshold.Threshold, value: float):
    cmd = message_pb2.Payload()
    cmd.cmd_adjust_fsm_threshold.threshold = threshold
    cmd.cmd_adjust_fsm_threshold.new_threshold = value
    await send_command(writer, cmd)


async def send_get_config(writer):
    cmd = message_pb2.Payload()
    cmd.cmd_get_config.SetInParent()
    await send_command(writer, cmd)


async def send_pyro_test_arm(writer, arm):
    cmd = message_pb2.Payload()
    cmd.cmd_pyro_test_arm.state = bool(arm)
    await send_command(writer, cmd)


async def send_pyro_test_activate(writer, p1, p2, p3, p4):
    cmd = message_pb2.Payload()
    cmd.cmd_pyro_test_activate.pyro1 = bool(p1)
    cmd.cmd_pyro_test_activate.pyro2 = bool(p2)
    cmd.cmd_pyro_test_activate.pyro3 = bool(p3)
    cmd.cmd_pyro_test_activate.pyro4 = bool(p4)
    await send_command(writer, cmd)


async def send_pyro_test_end(writer):
    cmd = message_pb2.Payload()
    cmd.cmd_pyro_test_end.SetInParent()
    await send_command(writer, cmd)


async def send_switch_continuity(writer, state: bool):
    cmd = message_pb2.Payload()
    cmd.cmd_switch_continuity.state = bool(state)
    await send_command(writer, cmd)


async def send_start_dummy_flight(writer):
    cmd = message_pb2.Payload()
    cmd.cmd_start_dummy_flight.SetInParent()
    await send_command(writer, cmd)


async def send_control_log(writer, state: bool):
    cmd = message_pb2.Payload()
    cmd.cmd_control_logging.on_off = state
    await send_command(writer, cmd)


async def send_get_logging_info(writer):
    cmd = message_pb2.Payload()
    cmd.cmd_get_logging_info.SetInParent()
    await send_command(writer, cmd)


async def send_read_logfile(writer, output: bool = True):
    global LOGFILE_NO
    cmd = message_pb2.Payload()
    cmd.cmd_read_logfile.file_no = LOGFILE_NO
    await send_command(writer, cmd, output)


async def send_erase_logfile(writer, file_no: int):
    cmd = message_pb2.Payload()
    cmd.cmd_erase_logfile.file_no = file_no
    await send_command(writer, cmd)


async def send_clear_flash(writer):
    cmd = message_pb2.Payload()
    cmd.cmd_clear_flash.SetInParent()
    await send_command(writer, cmd)


async def send_restore_files(writer):
    cmd = message_pb2.Payload()
    cmd.cmd_restore_files.SetInParent()
    await send_command(writer, cmd)


async def send_output_go_nogo(writer):
    cmd = message_pb2.Payload()
    cmd.cmd_output_go_nogo.SetInParent()
    await send_command(writer, cmd)


async def send_command(writer, cmd: message_pb2.Payload, output: bool = True):
    # Add command to a packet object
    pack = message_pb2.Packet()
    pack.payloads.append(cmd)
    # Serialize packet protobuf
    buf = pack.SerializeToString()

    # Add packet header
    ident = (0xFACE).to_bytes(2, 'big')
    crc_out = calc_crc32(buf).to_bytes(4, 'big')
    length = len(buf).to_bytes(2, 'big')

    header = ident + crc_out + length
    if len(header) != 8:
        # Somehow wrong packet header size
        return
    packet = header + buf

    if output:
        print(f"Sending command: '{cmd.WhichOneof("Data")}'")
    await send(packet, writer)
    # writer.write(packet)
    # await writer.drain()


async def send(msg_bytes: bytes, writer) -> None:
    """
    Send raw bytes to the PFC connection, with throttling applied.
    :param writer:
    :param msg_bytes: The bytes to send.
    :return: None
    """
    # Check if msg_bytes is not bytes
    if isinstance(msg_bytes, int):
        print("Error: msg_bytes is an integer, expected bytes")
        return

    if not start_throttle:
        writer.write(msg_bytes)
        await writer.drain()
        print(f"Sent {len(msg_bytes)} bytes without throttling")
    else:
        await throttled_write(msg_bytes, writer)


async def throttled_write(data: bytes, writer) -> None:
    global last_send_time_ns, min_send_interval_ns, min_send_interval_ns, send_lock
    async with send_lock:
        print("Acquired send lock")
        for b in data:
            writer.write(bytes([b]))
            await writer.drain()

            await asyncio.sleep(min_send_interval_ns / 1_000_000_000)

            last_send_time_ns = time.monotonic_ns()
        print(f"Sent {len(data)} bytes with throttling of {min_send_interval_ns / 1_000_000} ms")


async def send_set_press_lox(writer, pres: float):
    cmd = message_pb2.Payload()
    cmd.cmd_set_pressure_lox.setpoint = pres
    await send_command(writer, cmd)


async def send_set_press_eth(writer, pres):
    cmd = message_pb2.Payload()
    cmd.cmd_set_pressure_eth.setpoint = pres
    await send_command(writer, cmd)


async def send_set_gain_lox_p(writer, gain):
    cmd = message_pb2.Payload()
    cmd.cmd_set_gain_lox_p.gain = gain
    await send_command(writer, cmd)


async def send_set_gain_lox_i(writer, gain):
    cmd = message_pb2.Payload()
    cmd.cmd_set_gain_lox_i.gain = gain
    await send_command(writer, cmd)


async def send_set_gain_lox_d(writer, gain):
    cmd = message_pb2.Payload()
    cmd.cmd_set_gain_lox_d.gain = gain
    await send_command(writer, cmd)


async def send_set_gain_eth_p(writer, gain):
    cmd = message_pb2.Payload()
    cmd.cmd_set_gain_eth_p.gain = gain
    await send_command(writer, cmd)


async def send_set_gain_eth_i(writer, gain):
    cmd = message_pb2.Payload()
    cmd.cmd_set_gain_eth_i.gain = gain
    await send_command(writer, cmd)


async def send_set_gain_eth_d(writer, gain):
    cmd = message_pb2.Payload()
    cmd.cmd_set_gain_eth_d.gain = gain
    await send_command(writer, cmd)


async def send_set_active_lox(writer, active):
    cmd = message_pb2.Payload()
    cmd.cmd_set_active_lox.active = active
    await send_command(writer, cmd)


async def send_set_active_eth(writer, active):
    cmd = message_pb2.Payload()
    cmd.cmd_set_active_eth.active = active
    await send_command(writer, cmd)


async def send_set_lox_pt1(writer, active):
    cmd = message_pb2.Payload()
    cmd.cmd_set_lox_pt1.active = active
    await send_command(writer, cmd)


async def send_set_eth_pt1(writer, active):
    cmd = message_pb2.Payload()
    cmd.cmd_set_eth_pt1.active = active
    await send_command(writer, cmd)


async def send_set_angle_lox(writer, angle):
    cmd = message_pb2.Payload()
    cmd.cmd_set_angle_lox.angle = angle
    await send_command(writer, cmd)


async def send_set_angle_eth(writer, angle):
    cmd = message_pb2.Payload()
    cmd.cmd_set_angle_eth.angle = angle
    await send_command(writer, cmd)


async def send_set_ereg_eth(writer, p, i, d, setpoint, active, pt1, angle):
    cmd = message_pb2.Payload()
    cmd.cmd_set_eth_ereg.gain_p = p
    cmd.cmd_set_eth_ereg.gain_i = i
    cmd.cmd_set_eth_ereg.gain_d = d
    cmd.cmd_set_eth_ereg.setpoint = setpoint
    cmd.cmd_set_eth_ereg.active = bool(active)
    cmd.cmd_set_eth_ereg.pt1 = bool(pt1)
    cmd.cmd_set_eth_ereg.angle = angle
    await send_command(writer, cmd)


async def send_set_ereg_lox(writer, p, i, d, setpoint, active, pt1, angle):
    cmd = message_pb2.Payload()
    cmd.cmd_set_lox_ereg.gain_p = p
    cmd.cmd_set_lox_ereg.gain_i = i
    cmd.cmd_set_lox_ereg.gain_d = d
    cmd.cmd_set_lox_ereg.setpoint = setpoint
    cmd.cmd_set_lox_ereg.active = bool(active)
    cmd.cmd_set_lox_ereg.pt1 = bool(pt1)
    cmd.cmd_set_lox_ereg.angle = angle
    await send_command(writer, cmd)


async def tcp_writer(writer):
    global RECORD, _EXIT, start_throttle, print_health, print_health_lock, print_load, print_load_lock, print_packet_info, print_packet_info_lock, print_flight, mission_start_time, mission_started, print_crc, print_pyro

    mission_start_time = get_time_now()
    print("Enter 'help' for commands")

    while True:
        try:
            cmd = await ainput('')
        except asyncio.exceptions.CancelledError:
            # Close writer thread
            _EXIT = True
            return

        if cmd == "help":
            print("Commands:")
            print("  record on:      Start a recording.")
            print("  record off:     Stop the recording.")
            print("  see health:     Display the sensor health.")
            print("  health on:      Start regularly displaying the sensor health.")
            print("  health off:     Stop regularly displaying the sensor health.")
            print("  see load:       Display the serial bus load.")
            print("  load on:        Start regularly displaying the bus load.")
            print("  load off:       Stop regularly displaying the bus load.")
            print("  see info:       Display overall packet information.")
            print("  info on:        Start regularly displaying overall packet information.")
            print("  info off:       Stop regularly displaying overall packet information.")
            print("  mode flight:    Set the interface into flight mode")
            print("  mode normal:    Set the interface into normal mode (default")
            print("  crc on:         Notify operator of CRC errors")
            print("  crc off:        Do not notify operator of CRC errors")
            print("  pyroprint on:   Print pyro information")
            print("  pyroprint off:  Do not print pyro information")
            print("------------------")
            print("  close           Close writer thread")
            print("  reset           ")
            print("  arm             arm bb")
            print("  cams            cams bbb")
            print("  radio           radio (on|off)")
            print("  freq            freq uuuuuuuuuu")
            print("  power           power iii")
            print("  valves          valves bbbbbb")
            print("  LAUNCH          ")
            print("  runseqn         runseqn u")
            print("  abort sequn     ")
            print("  safestate       ")
            print("  epurge          ")
            print("  calib           calib fff fff")
            print("  cfgtiming       cfgtiming u uuuuuu")
            print("  cfgthreshold    fgthreshold u ffff")
            print("  cfg             ")
            print("  pyroarm         pyroarm b")
            print("  pyroact         pyroact bbbb")
            print("  pyroend         ")
            print("  pyrocont        pyrocont (on|off)")
            print("  dummy           ")
            print("  throttle on     Toggles throttling of commands to one every 100 milliseconds")
            print("  throttle off    ")
            print("  log on          ")
            print("  log off         ")
            print("  log info        ")
            print("  log read        log read u")
            print("  log erase       log erase u")
            print("  clear flash     ")
            print("  fix flash       ")
            print("  gonogo          ")
            print("  set lox         set lox ffff")
            print("  set eth         set eth ffff")
            print("  set gain lox_p  set gain lox_p ffff")
            print("  set gain lox_i  set gain lox_i ffff")
            print("  set gain lox_d  set gain lox_d ffff")
            print("  set gain eth_p  set gain eth_p ffff")
            print("  set gain eth_i  set gain eth_i ffff")
            print("  set gain eth_d  set gain eth_d ffff")
            print("  activate lox")
            print("  deactivate lox")
            print("  activate eth")
            print("  deactivate eth")
            print("  activate pt1_lox")
            print("  deactivate pt1_lox")
            print("  activate pt1_eth")
            print("  deactivate pt1_eth")
            print("  set angle lox   set angle lox ffff")
            print("  set angle eth   set angle eth ffff")
        elif cmd == "record on":
            enable_recording()
        elif cmd == "record off":
            disable_recording()
        elif cmd == "throttle on":
            start_throttle = True
        elif cmd == "throttle off":
            start_throttle = False
        elif cmd == "see health":
            print_health = True
        elif cmd == "health on":
            print_health = True
            print_health_lock = True
        elif cmd == "health off":
            print_health = False
            print_health_lock = False
        elif cmd == "see load":
            print_load = True
        elif cmd == "load on":
            print_load = True
            print_load_lock = True
        elif cmd == "load off":
            print_load = False
            print_load_lock = False
        elif cmd == "see info":
            print_packet_info = True
        elif cmd == "info on":
            print_packet_info = True
            print_packet_info_lock = True
        elif cmd == "info off":
            print_packet_info = False
            print_packet_info_lock = False
        elif cmd == "mode flight":
            print_flight = True
        elif cmd == "mode normal":
            print_flight = False
        elif cmd == "crc on":
            print_crc = True
        elif cmd == "crc off":
            print_crc = False
        elif cmd == "pyroprint on":
            print_pyro = True
        elif cmd == "pyroprint off":
            print_pyro = False
        elif cmd == "close":
            # Close writer thread
            _EXIT = True
            return
        # PFC commands
        elif cmd == "reset":
            await send_reset(writer)
        # "arm bb"
        elif cmd.startswith("arm "):
            arm = False
            override = False
            if len(cmd) >= 5:
                try:
                    arm = bool(int(cmd[4]))
                    if not arm:
                        mission_started = False
                    if len(cmd) >= 6:
                        override = bool(int(cmd[5]))
                except Exception:
                    print("invalid arguments")
                    continue
            else:
                print("missing arguments")
                continue

            await send_arm(writer, arm, override)
        # "cams bbb"
        elif cmd.startswith("cams"):
            cam1 = cam2 = cam3 = False
            if len(cmd) >= 8:
                try:
                    cam1 = bool(int(cmd[5]))
                    cam2 = bool(int(cmd[6]))
                    cam3 = bool(int(cmd[7]))
                except Exception:
                    print("Invalid arguments")
                    continue
            else:
                print("Invalid arguments")
                continue

            await send_cams(writer, cam1, cam2, cam3)
        # "radio (on|off)"
        elif cmd.startswith("radio"):
            state = False
            if cmd == "radio on":
                state = True
            elif cmd != "radio off":
                print("invalid argument")
                continue
            await send_switch_radio(writer, state)
        # "freq uuuuuuuuuu"
        elif cmd.startswith("freq"):
            freq = 0
            try:
                freq = int(cmd[5:])
            except Exception:
                print("Invalid argument")
                continue
            await send_change_freq(writer, freq)
        # "power iii"
        elif cmd.startswith("power"):
            power = 0
            try:
                power = int(cmd[6:])
            except Exception:
                print("Invalid argument")
                continue
            await send_change_tx_power(writer, power)
        # "valves bbbbbb"
        elif cmd.startswith("valves"):
            v1 = v2 = v3 = v4 = v5 = v6 = False
            if len(cmd) >= 13:
                try:
                    v1 = bool(int(cmd[7]))
                    v2 = bool(int(cmd[8]))
                    v3 = bool(int(cmd[9]))
                    v4 = bool(int(cmd[10]))
                    v5 = bool(int(cmd[11]))
                    v6 = bool(int(cmd[12]))
                except Exception:
                    print("Invalid arguments")
                    continue
            else:
                print("Missing arguments")
                continue

            await send_valves(writer, v1, v2, v3, v4, v5, v6)
        elif cmd == "LAUNCH":
            mission_started = True
            mission_start_time = get_time_now() + 10.0
            await send_launch(writer)
        # "runseqn u"
        elif cmd.startswith("runseqn"):
            if len(cmd) >= 8:
                try:
                    number = int(cmd[7])
                except Exception:
                    print("Invalid argument")
                    continue
            else:
                print("Missing argument")
                continue

            await send_run_test_seqn(writer, number)
        elif cmd == "abort seqn":
            await send_abortseqn(writer)
        elif cmd == "safestate":
            await send_safestate(writer)
        elif cmd == "epurge":
            await send_epurge(writer)
        # "calib fff fff"
        elif cmd.startswith("calib"):
            alt: float
            temp: float
            slices = cmd.split()
            if len(cmd) > 8:
                try:
                    alt = float(slices[1])
                    temp = float(slices[2])
                except Exception:
                    print("Invalid arguments")
                    continue
            else:
                print("Invalid arguments")
                continue

            await send_calib(writer, alt, temp)
        # "cfgtiming u uuuuuu"
        elif cmd.startswith("cfgtiming"):
            timer: any
            time = 0
            if len(cmd) > 13:
                try:
                    timer_int = int(cmd[10])
                    if timer_int == 0:
                        timer = message_pb2.CMD_AdjustFSMTiming.Timer.ENGINE_CUTOFF_MAX_TAL
                    elif timer_int == 1:
                        timer = message_pb2.CMD_AdjustFSMTiming.Timer.APOGEE_MIN_TAL
                    elif timer_int == 2:
                        timer = message_pb2.CMD_AdjustFSMTiming.Timer.APOGEE_MAX_TAL
                    elif timer_int == 3:
                        timer = message_pb2.CMD_AdjustFSMTiming.Timer.MAIN_DEPLOY_MAX_TAA
                    else:
                        print("Wrong timer argument")
                        continue
                except Exception:
                    print("Invalid timer argument")
                    continue
            else:
                print("Wrong arguments")
                continue

            try:
                time = int(cmd[12:])
            except Exception:
                print("Invalid time argument")
                continue

            await send_adjust_fsm_timing(writer, timer, time)
        # "cfgthreshold u ffff"
        elif cmd.startswith("cfgthreshold"):
            threshold: any
            value = 0.0
            if len(cmd) > 15:
                try:
                    threshold_int = int(cmd[13])
                    if threshold_int == 0:
                        threshold = message_pb2.CMD_AdjustFSMThreshold.Threshold.MAIN_CHUTE_HEIGHT
                    else:
                        print("Wrong threshold argument")
                except Exception:
                    print("Invalid threshold argument")
                    continue
            else:
                print("Wrong arguments")
                continue

            try:
                value = float(cmd[14:])
            except Exception:
                print("Invalid value")
                continue

            await send_adjust_fsm_threshold(writer, threshold, value)
        elif cmd == "cfg":
            await send_get_config(writer)
        # "pyroarm b"
        elif cmd.startswith("pyroarm"):
            arm = False
            if len(cmd) >= 9:
                try:
                    arm = bool(int(cmd[8]))
                except Exception:
                    print("Invalid argument")
                    continue
            else:
                print("Invalid argument")
                continue

            await send_pyro_test_arm(writer, arm)
        # "pyroact bbbb"
        elif cmd.startswith("pyroact"):
            p1 = p2 = p3 = p4 = False
            if len(cmd) >= 12:
                try:
                    p1 = bool(int(cmd[8]))
                    p2 = bool(int(cmd[9]))
                    p3 = bool(int(cmd[10]))
                    p4 = bool(int(cmd[11]))
                except Exception:
                    print("Invalid arguments")
                    continue
            else:
                print("Invalid arguments")
                continue

            await send_pyro_test_activate(writer, p1, p2, p3, p4)
        elif cmd == "pyroend":
            await send_pyro_test_end(writer)
        # "pyrocont (on|off)"
        elif cmd.startswith("pyrocont"):
            if cmd == "pyrocont on":
                await send_switch_continuity(writer, True)
            elif cmd == "pyrocont off":
                await send_switch_continuity(writer, False)
            else:
                print("Invalid arguments")
                continue
        elif cmd == "dummy":
            await send_start_dummy_flight(writer)
        elif cmd == "log on":
            await send_control_log(writer, True)
        elif cmd == "log off":
            await send_control_log(writer, False)
        elif cmd == "log info":
            await send_get_logging_info(writer)
        # "log read u"
        elif cmd.startswith("log read"):
            file_no = 0
            try:
                file_no = int(cmd[9:])
            except Exception:
                print("Invalid argument(s)")
                continue
            await start_log_read(writer, file_no)
        # "log erase u"
        elif cmd.startswith("log erase"):
            file_no = 0
            try:
                file_no = int(cmd[10:])
            except Exception:
                print("Invalid argument(s)")
                continue
            await send_erase_logfile(writer, file_no)
        elif cmd == "clear flash":
            await send_clear_flash(writer)
        elif cmd == "fix flash":
            await send_restore_files(writer)
        elif cmd == "gonogo":
            await send_output_go_nogo(writer)
        # "set lox ffff"
        elif cmd.startswith("set lox"):
            pres = 0.0
            try:
                pres = float(cmd[8:])
            except Exception:
                print("Invalid argument")
                continue
            await send_set_press_lox(writer, pres)
        # "set eth ffff"
        elif cmd.startswith("set eth"):
            pres = 0.0
            try:
                pres = float(cmd[8:])
            except Exception:
                print("Invalid argument")
                continue
            await send_set_press_eth(writer, pres)
        # set gain ffff
        elif cmd.startswith("set gain lox_p"):
            gain = 0.0
            try:
                gain = float(cmd[14:])
            except Exception:
                print("Invalid argument")
                continue
            await send_set_gain_lox_p(writer, gain)
        elif cmd.startswith("set gain lox_i"):
            gain = 0.0
            try:
                gain = float(cmd[14:])
            except Exception:
                print("Invalid argument")
                continue
            await send_set_gain_lox_i(writer, gain)
        elif cmd.startswith("set gain lox_d"):
            gain = 0.0
            try:
                gain = float(cmd[14:])
            except Exception:
                print("Invalid argument")
                continue
            await send_set_gain_lox_d(writer, gain)
        elif cmd.startswith("set gain eth_p"):
            gain = 0.0
            try:
                gain = float(cmd[14:])
            except Exception:
                print("Invalid argument")
                continue
            await send_set_gain_eth_p(writer, gain)
        elif cmd.startswith("set gain eth_i"):
            gain = 0.0
            try:
                gain = float(cmd[14:])
            except Exception:
                print("Invalid argument")
                continue
            await send_set_gain_eth_i(writer, gain)
        elif cmd.startswith("set gain eth_d"):
            gain = 0.0
            try:
                gain = float(cmd[14:])
            except Exception:
                print("Invalid argument")
                continue
            await send_set_gain_eth_d(writer, gain)
        # set active
        elif cmd == "activate lox":
            await send_set_active_lox(writer, 1)
        elif cmd == "deactivate lox":
            await send_set_active_lox(writer, 0)
        elif cmd == "activate eth":
            await send_set_active_eth(writer, 1)
        elif cmd == "deactivate eth":
            await send_set_active_eth(writer, 0)
        elif cmd == "activate pt1_lox":
            await send_set_lox_pt1(writer, 1)
        elif cmd == "deactivate pt1_lox":
            await send_set_lox_pt1(writer, 0)
        elif cmd == "activate pt1_eth":
            await send_set_eth_pt1(writer, 1)
        elif cmd == "deactivate pt1_eth":
            await send_set_eth_pt1(writer, 0)
        # send angles ffff
        elif cmd.startswith("set angle lox"):
            angle = 0.0
            try:
                angle = float(cmd[14:])
            except Exception:
                print("Invalid argument")
                continue
            await send_set_angle_lox(writer, angle)
        elif cmd.startswith("set angle eth"):
            angle = 0.0
            try:
                angle = float(cmd[14:])
            except Exception:
                print("Invalid argument")
                continue
            await send_set_angle_eth(writer, angle)
        # set ereg
        elif cmd.startswith("set ereg eth"):
            print("This cmd should only be used by OPCUA")
            # gain_p = 1.0
            # gain_i = 2.0
            # gain_d = 3.0
            # setpoint = 4.0
            # active = 0.0
            # pt1 = 1.0
            # angle = 5.0
            # await send_set_ereg_eth(writer, gain_p, gain_i, gain_d, setpoint, active, pt1, angle)
        elif cmd.startswith("set ereg lox"):
            print("This cmd should only be used by OPCUA")
            # gain_p = 1.0
            # gain_i = 2.0
            # gain_d = 3.0
            # setpoint = 4.0
            # active = 0.0
            # pt1 = 1.0
            # angle = 5.0
            # await send_set_ereg_lox(writer, gain_p, gain_i, gain_d, setpoint, active, pt1, angle)


async def main():
    global _EXIT

    pre_sel_serial_port = ""
    if len(sys.argv) >= 2:
        if is_serial_port(sys.argv[1]):
            data_source = "local"
            pre_sel_serial_port = sys.argv[1]
        else:
            data_source = sys.argv[1]
    else:
        try:
            data_source = input("Connect to (local/mcs/rgs): ")
        except KeyboardInterrupt:
            exit(0)

    ip = IP_ADDR_LOCAL
    port = IP_PORT_LOCAL
    if data_source == "q":
        exit(0)
    elif data_source == "help":
        print("Available options:")
        print(" local:  Use a serial connection on this machine")
        print(" mcs:    Connect to the MCS ground station")
        print(" rgs:    Connect to the RGS ground station")
        exit(0)
    elif data_source == "local":
        ip = IP_ADDR_LOCAL
        port = IP_PORT_LOCAL
        srv_thread = start_ser2net(pre_sel_serial_port)
    elif data_source == "mcs":
        ip = IP_ADDR_MCS
        port = IP_PORT_MCS
    elif data_source == "rgs":
        ip = IP_ADDR_RGS
        port = IP_PORT_RGS
    else:
        print("Invalid option. Try again! (enter 'help' for help)")
        if len(sys.argv) > 1:
            print("A serial port as argument is only recognized if the port currently exists.")
        exit(1)

    if data_source != "local":
        print("Connecting...")

    try:
        reader, writer = await asyncio.open_connection(ip, port)
    except Exception:
        print("TCP connection failed. Try again.")
        exit(1)

    print(f"TCP connected to {ip}:{port}")

    try:
        await asyncio.gather(
            tcp_reader(reader, writer),
            tcp_writer(writer)
        )
    except asyncio.exceptions.CancelledError:
        pass

    writer.close()
    await writer.wait_closed()

    _EXIT = True
    srv_thread.join()

    print("Bye")
    exit(0)


asyncio.run(main())
