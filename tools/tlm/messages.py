"""
Message Types Module - Clean Implementation

Defines Python dataclasses for different message types.
Each message has a type (8-bit int) and 8 bytes of data as a packed struct.
Compatible with packager.py for wire format packaging.
"""

import math
import struct
from dataclasses import dataclass
from typing import List, Tuple, Dict


# Message type definitions
MSG_TEC = 100
MSG_POWER = 101
MSG_SYS = 102
MSG_EXP1 = 103
MSG_EXP2 = 104
MSG_EXP_IMU = 105

MSG_FCS = 20

SLOW_INTERVAL = 1000
FAST_INTERVAL = 100

# Message type names for display
MESSAGE_TYPE_NAMES = {
    MSG_TEC: "TEC",
    MSG_POWER: "POWER",
    MSG_SYS: "SYSTEM",
    MSG_EXP1: "EXP1",
    MSG_EXP2: "EXP2",
    MSG_EXP_IMU: "EXPIMU",
    MSG_FCS: "FCS"
}


# Field formatting utilities - simple approach
def format_field(value: float, multiplier: float, max_raw: int) -> int:
    """Convert real value to raw integer, clamped to range."""
    raw = int(value * multiplier)
    return max(0, min(raw, max_raw))

def unformat_field(raw: int, multiplier: float) -> float:
    """Convert raw integer back to real value."""
    return raw / multiplier


class BitField:
    """Helper class for packing/unpacking bit fields with optional formatting."""

    def __init__(self, fields: List[Tuple[str, int, float, str]]):
        """
        Args:
            fields: List of (field_name, bit_width, multiplier, unit) tuples in order from MSB to LSB
                   multiplier: factor to convert real value to raw (e.g., 10.0 for 3.3V -> 33)
                   unit: display unit (e.g., "V", "A", "%", "°C")
        """
        self.fields = fields
        self.total_bits = sum(width for _, width, _, _ in fields)
        if self.total_bits > 64:
            raise ValueError(f"Total bits {self.total_bits} exceeds 64")

        # Build lookup tables for formatting
        self.field_info = {}
        for name, width, multiplier, unit in fields:
            self.field_info[name] = {
                'width': width,
                'multiplier': multiplier,
                'unit': unit,
                'max_raw': (1 << width) - 1
            }

    def pack(self, **values) -> bytes:
        """Pack field values into bytes."""
        packed = 0
        bit_pos = self.total_bits

        for name, width, _, _ in self.fields:
            bit_pos -= width
            value = values[name]
            mask = (1 << width) - 1
            if value > mask:
                raise ValueError(f"{name} value {value} exceeds {width}-bit limit")
            packed |= (value & mask) << bit_pos

        return struct.pack('<Q', packed)

    def unpack(self, data: bytes) -> dict:
        """Unpack bytes into field values."""
        packed = struct.unpack('<Q', data)[0]
        values = {}
        bit_pos = self.total_bits

        for name, width, _, _ in self.fields:
            bit_pos -= width
            mask = (1 << width) - 1
            values[name] = (packed >> bit_pos) & mask

        return values

    def pack_real_values(self, **real_values) -> bytes:
        """Pack real-world values after converting to raw integers."""
        raw_values = {}
        for name, real_value in real_values.items():
            if name in self.field_info:
                info = self.field_info[name]
                raw_values[name] = format_field(real_value, info['multiplier'], info['max_raw'])
            else:
                raw_values[name] = real_value  # Pass through raw values
        return self.pack(**raw_values)

    def unpack_real_values(self, data: bytes) -> dict:
        """Unpack to both raw and real-world values."""
        raw_values = self.unpack(data)
        real_values = {}
        for name, raw_value in raw_values.items():
            if name in self.field_info:
                info = self.field_info[name]
                real_values[name] = unformat_field(raw_value, info['multiplier'])
            else:
                real_values[name] = raw_value  # Pass through raw values
        return real_values

    def display_value(self, field_name: str, raw_value: int) -> str:
        """Get formatted display string for a field."""
        if field_name in self.field_info:
            info = self.field_info[field_name]
            real_value = unformat_field(raw_value, info['multiplier'])
            if info['unit']:
                return f"{real_value:.2f} {info['unit']}"
            return f"{real_value:.2f}"
        return str(raw_value)


@dataclass
class TecMessage:
    cold_side_temp: int      # 16 bits
    hot_side_temp: int       # 13 bits
    tec_voltage: int         # 10 bits
    tec_current: int         # 9 bits
    fan_pwm: int            # 8 bits
    stats_byte: int         # 8 bits

    interval_ms = SLOW_INTERVAL

    _bitfield = BitField([
        ('cold_side_temp', 16, 100.0, '°C'),     # 25.0°C → 2500 (2 decimal places)
        ('hot_side_temp', 13, 100.0, '°C'),      # 45.0°C → 4500 (2 decimal places)
        ('tec_voltage', 10, 100.0, 'V'),         # 12.0V → 1200 (2 decimal places)
        ('tec_current', 9, 100.0, 'A'),          # 5.0A → 500 (2 decimal places)
        ('fan_pwm', 8, 1.0, '%'),                # 75.0% → 75 (direct)
        ('stats_byte', 8, 1.0, '')               # Raw status value
    ])

    def pack_data(self) -> bytes:
        return self._bitfield.pack(
            cold_side_temp=self.cold_side_temp,
            hot_side_temp=self.hot_side_temp,
            tec_voltage=self.tec_voltage,
            tec_current=self.tec_current,
            fan_pwm=self.fan_pwm,
            stats_byte=self.stats_byte
        )

    @classmethod
    def unpack_data(cls, data: bytes) -> 'TecMessage':
        values = cls._bitfield.unpack(data)
        return cls(**values)

    @classmethod
    def from_real_values(cls, cold_side_temp: float, hot_side_temp: float,
                        tec_voltage: float, tec_current: float,
                        fan_pwm: float, stats_byte: int = 0) -> 'TecMessage':
        """Create TecMessage from real-world values."""
        raw_data = cls._bitfield.pack_real_values(
            cold_side_temp=cold_side_temp,
            hot_side_temp=hot_side_temp,
            tec_voltage=tec_voltage,
            tec_current=tec_current,
            fan_pwm=fan_pwm,
            stats_byte=stats_byte
        )
        return cls.unpack_data(raw_data)

    def to_real_values(self) -> dict:
        """Convert message fields back to real-world values."""
        return self._bitfield.unpack_real_values(self.pack_data())

    def display_values(self) -> None:
        """Display the parsed values from this message."""
        print(f"    Cold side: {self._bitfield.display_value('cold_side_temp', self.cold_side_temp)}, Hot side: {self._bitfield.display_value('hot_side_temp', self.hot_side_temp)}")
        print(f"    TEC V: {self._bitfield.display_value('tec_voltage', self.tec_voltage)}, TEC I: {self._bitfield.display_value('tec_current', self.tec_current)}")
        print(f"    Fan PWM: {self._bitfield.display_value('fan_pwm', self.fan_pwm)}, Stats: {self.stats_byte}")


@dataclass
class PowerMessage:
    battery_voltage: int     # 12 bits
    battery_current: int     # 6 bits
    rail_12v_voltage: int    # 8 bits
    rail_12v_current: int    # 5 bits
    rail_5v_voltage: int     # 7 bits
    rail_5v_current: int     # 5 bits
    rail_3v3_voltage: int    # 6 bits
    rail_3v3_current: int    # 5 bits
    status_byte: int         # 6 bits

    interval_ms = SLOW_INTERVAL

    _bitfield = BitField([
        ('battery_voltage', 12, 200.0, 'V'),     # 16.8V → 3360 (for 20V max range)
        ('battery_current', 6, 6.4, 'A'),        # 10.0A → 64 (for 10A max range)
        ('rail_12v_voltage', 8, 17.0, 'V'),      # 12.0V → 204 (for 15V max range)
        ('rail_12v_current', 5, 6.4, 'A'),       # 2.5A → 16 (for 5A max range)
        ('rail_5v_voltage', 7, 21.0, 'V'),       # 5.0V → 105 (for 6V max range)
        ('rail_5v_current', 5, 10.0, 'A'),       # 1.5A → 15 (for 3A max range)
        ('rail_3v3_voltage', 6, 10.0, 'V'),      # 3.3V → 33 (for 5V max range, user's example)
        ('rail_3v3_current', 5, 16.0, 'A'),      # 1.0A → 16 (for 2A max range)
        ('status_byte', 6, 1.0, '')              # Raw status value
    ])

    def pack_data(self) -> bytes:
        return self._bitfield.pack(**self.__dict__)

    @classmethod
    def unpack_data(cls, data: bytes) -> 'PowerMessage':
        values = cls._bitfield.unpack(data)
        return cls(**values)

    @classmethod
    def from_real_values(cls, battery_voltage: float, battery_current: float,
                        rail_12v_voltage: float, rail_12v_current: float,
                        rail_5v_voltage: float, rail_5v_current: float,
                        rail_3v3_voltage: float, rail_3v3_current: float,
                        status_byte: int = 0) -> 'PowerMessage':
        """Create PowerMessage from real-world values."""
        raw_data = cls._bitfield.pack_real_values(
            battery_voltage=battery_voltage,
            battery_current=battery_current,
            rail_12v_voltage=rail_12v_voltage,
            rail_12v_current=rail_12v_current,
            rail_5v_voltage=rail_5v_voltage,
            rail_5v_current=rail_5v_current,
            rail_3v3_voltage=rail_3v3_voltage,
            rail_3v3_current=rail_3v3_current,
            status_byte=status_byte
        )
        return cls.unpack_data(raw_data)

    def to_real_values(self) -> dict:
        """Convert message fields back to real-world values."""
        return self._bitfield.unpack_real_values(self.pack_data())

    def display_values(self) -> None:
        """Display the parsed values from this message."""
        print(f"    Battery:  {self._bitfield.display_value('battery_voltage', self.battery_voltage)}, {self._bitfield.display_value('battery_current', self.battery_current)}")
        print(f"    12V rail: {self._bitfield.display_value('rail_12v_voltage', self.rail_12v_voltage)}, {self._bitfield.display_value('rail_12v_current', self.rail_12v_current)}")
        print(f"    5V rail:  {self._bitfield.display_value('rail_5v_voltage', self.rail_5v_voltage)}, {self._bitfield.display_value('rail_5v_current', self.rail_5v_current)}")
        print(f"    3V3 rail: {self._bitfield.display_value('rail_3v3_voltage', self.rail_3v3_voltage)}, {self._bitfield.display_value('rail_3v3_current', self.rail_3v3_current)}")
        print(f"    Status: {self.status_byte}")


@dataclass
class SysMessage:
    cpu_load: int           # 7 bits
    storage_capacity: int   # 7 bits
    soc: int               # 7 bits
    ext_fan_pwm: int     # 8 bits
    epoch: int             # 13 bits
    charge_voltage: int     # 8 bits
    led_states: int         # 6 bits
    status_byte: int        # 8 bits

    interval_ms = SLOW_INTERVAL

    _bitfield = BitField([
        ('cpu_load', 7, 1.28, '%'),              # 100% → 128 (percentage)
        ('storage_capacity', 7, 1.28, '%'),      # 100% → 128 (percentage)
        ('soc', 7, 1.28, '%'),                   # 100% → 128 (percentage)
        ('ext_fan_pwm', 8, 1.0, ''),             # 100% -> 255 (PWM Code)
        ('epoch', 13, 1.0, 's'),                 # Direct timestamp (13 bits)
        ('charge_voltage', 8, 6.0, 'V'),         # 36V → 216 (Voltage)
        ('led_states', 6, 1.0, ''),              # LED states (6 bits, one per chamber)
        ('status_byte', 8, 1.0, '')              # Raw status value
    ])

    def pack_data(self) -> bytes:
        return self._bitfield.pack(**self.__dict__)

    @classmethod
    def unpack_data(cls, data: bytes) -> 'SysMessage':
        values = cls._bitfield.unpack(data)
        return cls(**values)

    @classmethod
    def from_real_values(cls, cpu_load: float, storage_capacity: float, soc: float,
                        ext_fan_pwm: float, epoch: int, charge_voltage: float,
                        led_states: int = 0, status_byte: int = 0) -> 'SysMessage':
        """Create SysMessage from real-world values."""
        raw_data = cls._bitfield.pack_real_values(
            cpu_load=cpu_load,
            storage_capacity=storage_capacity,
            soc=soc,
            ext_fan_pwm=ext_fan_pwm,
            epoch=epoch,
            charge_voltage=charge_voltage,
            led_states=led_states,
            status_byte=status_byte
        )
        return cls.unpack_data(raw_data)

    def to_real_values(self) -> dict:
        """Convert message fields back to real-world values."""
        return self._bitfield.unpack_real_values(self.pack_data())

    def display_values(self) -> None:
        """Display the parsed values from this message."""
        print(f"    CPU load: {self._bitfield.display_value('cpu_load', self.cpu_load)}, Storage: {self._bitfield.display_value('storage_capacity', self.storage_capacity)}")
        print(f"    SOC: {self._bitfield.display_value('soc', self.soc)}, Ext fan: {self._bitfield.display_value('ext_fan_pwm', self.ext_fan_pwm)}")
        print(f"    Epoch: {self._bitfield.display_value('epoch', self.epoch)}, Charge V: {self._bitfield.display_value('charge_voltage', self.charge_voltage)}")
        print(f"    LED states: {self.led_states:06b}, Status: {self._bitfield.display_value('status_byte', self.status_byte)}")


# Simple message classes for experiments (no formatting needed)
@dataclass
class Exp1Message:
    c0_min: int             # 11 bits
    c0_max: int             # 10 bits
    c1_min: int             # 11 bits
    c1_max: int             # 10 bits
    c2_min: int             # 11 bits
    c2_max: int             # 10 bits

    interval_ms = FAST_INTERVAL

    _bitfield = BitField([
        ('c0_min', 11, 1.0, 'counts'),
        ('c0_max', 10, 1.0, 'counts'),
        ('c1_min', 11, 1.0, 'counts'),
        ('c1_max', 10, 1.0, 'counts'),
        ('c2_min', 11, 1.0, 'counts'),
        ('c2_max', 10, 1.0, 'counts')
    ])

    def pack_data(self) -> bytes:
        return self._bitfield.pack(**self.__dict__)

    @classmethod
    def unpack_data(cls, data: bytes) -> 'Exp1Message':
        values = cls._bitfield.unpack(data)
        return cls(**values)

    def display_values(self) -> None:
        """Display the parsed values from this message."""
        print(f"    C0: min={self._bitfield.display_value('c0_min', self.c0_min)}, max={self._bitfield.display_value('c0_max', self.c0_max)} (Delta={self.c0_max - self.c0_min})")
        print(f"    C1: min={self._bitfield.display_value('c1_min', self.c1_min)}, max={self._bitfield.display_value('c1_max', self.c1_max)} (Delta={self.c1_max - self.c1_min})")
        print(f"    C2: min={self._bitfield.display_value('c2_min', self.c2_min)}, max={self._bitfield.display_value('c2_max', self.c2_max)} (Delta={self.c2_max - self.c2_min})")


@dataclass
class Exp2Message:
    c3_min: int             # 11 bits
    c3_max: int             # 10 bits
    c4_min: int             # 11 bits
    c4_max: int             # 10 bits
    c5_min: int             # 11 bits
    c5_max: int             # 10 bits

    interval_ms = FAST_INTERVAL

    _bitfield = BitField([
        ('c3_min', 11, 1.0, 'counts'),
        ('c3_max', 10, 1.0, 'counts'),
        ('c4_min', 11, 1.0, 'counts'),
        ('c4_max', 10, 1.0, 'counts'),
        ('c5_min', 11, 1.0, 'counts'),
        ('c5_max', 10, 1.0, 'counts')
    ])

    def pack_data(self) -> bytes:
        return self._bitfield.pack(**self.__dict__)

    @classmethod
    def unpack_data(cls, data: bytes) -> 'Exp2Message':
        values = cls._bitfield.unpack(data)
        return cls(**values)

    def display_values(self) -> None:
        """Display the parsed values from this message."""
        print(f"    C3: min={self._bitfield.display_value('c3_min', self.c3_min)}, max={self._bitfield.display_value('c3_max', self.c3_max)} (Delta={self.c3_max - self.c3_min})")
        print(f"    C4: min={self._bitfield.display_value('c4_min', self.c4_min)}, max={self._bitfield.display_value('c4_max', self.c4_max)} (Delta={self.c4_max - self.c4_min})")
        print(f"    C5: min={self._bitfield.display_value('c5_min', self.c5_min)}, max={self._bitfield.display_value('c5_max', self.c5_max)} (Delta={self.c5_max - self.c5_min})")


@dataclass
class ExpImuMessage:
    acc_x_max: int          # 10 bits
    acc_y_max: int          # 10 bits
    acc_z_max: int          # 10 bits
    mag_x: int              # 10 bits
    mag_y: int              # 10 bits
    mag_z: int              # 10 bits
    hi_lo_g_flag: int       # 1 bit
    reserved: int           # 3 bits

    interval_ms = FAST_INTERVAL

    _bitfield = BitField([
        ('acc_x_max', 10, 1.0, 'g'),
        ('acc_y_max', 10, 1.0, 'g'),
        ('acc_z_max', 10, 1.0, 'g'),
        ('mag_x', 10, 1.0, 'mT'),
        ('mag_y', 10, 1.0, 'mT'),
        ('mag_z', 10, 1.0, 'mT'),
        ('hi_lo_g_flag', 1, 1.0, ''),
        ('reserved', 3, 1.0, '')
    ])

    def pack_data(self) -> bytes:
        return self._bitfield.pack(**self.__dict__)

    @classmethod
    def unpack_data(cls, data: bytes) -> 'ExpImuMessage':
        values = cls._bitfield.unpack(data)
        return cls(**values)

    def display_values(self) -> None:
        """Display the parsed values from this message."""
        print(f"    Accelerometer: X={self._bitfield.display_value('acc_x_max', self.acc_x_max)}, Y={self._bitfield.display_value('acc_y_max', self.acc_y_max)}, Z={self._bitfield.display_value('acc_z_max', self.acc_z_max)}")
        print(f"    Magnetometer:  X={self._bitfield.display_value('mag_x', self.mag_x)}, Y={self._bitfield.display_value('mag_y', self.mag_y)}, Z={self._bitfield.display_value('mag_z', self.mag_z)}")
        print(f"    Hi/Lo G: {self._bitfield.display_value('hi_lo_g_flag', self.hi_lo_g_flag)}")


@dataclass
class FCSMessage:
    flight_state: int  # 8 bits - FSM_FlightPhase from WARP
    reserved: int      # 56 bits - Reserved bytes

    interval_ms = SLOW_INTERVAL

    # Flight phase states from WARP FSM
    PHASE_STARTUP = 0
    PHASE_PREFLIGHT = 1
    PHASE_LAUNCH_READY = 2
    PHASE_BOOST = 3
    PHASE_COAST = 4
    PHASE_DROGUE_DESCENT = 5
    PHASE_MAIN_DESCENT = 6
    PHASE_LANDED = 7

    PHASE_NAMES = {
        0: "STARTUP",
        1: "PREFLIGHT",
        2: "LAUNCH_READY",
        3: "BOOST",
        4: "COAST",
        5: "DROGUE_DESCENT",
        6: "MAIN_DESCENT",
        7: "LANDED"
    }

    _bitfield = BitField([
        ('flight_state', 8, 1.0, ''),
        ('reserved', 56, 1.0, '')
    ])

    def pack_data(self) -> bytes:
        return self._bitfield.pack(**self.__dict__)

    @classmethod
    def unpack_data(cls, data: bytes) -> 'FCSMessage':
        values = cls._bitfield.unpack(data)
        return cls(**values)

    def get_phase_name(self) -> str:
        """Get the human-readable name for the current flight phase."""
        return self.PHASE_NAMES.get(self.flight_state, f"UNKNOWN({self.flight_state})")

    def display_values(self) -> None:
        """Display the parsed values from this message."""
        print(f"    Flight state: {self.flight_state} ({self.get_phase_name()})")


# Message registry
MESSAGES = {
    MSG_TEC: TecMessage,
    MSG_POWER: PowerMessage,
    MSG_SYS: SysMessage,
    MSG_EXP1: Exp1Message,
    MSG_EXP2: Exp2Message,
    MSG_EXP_IMU: ExpImuMessage,
    MSG_FCS: FCSMessage
}


def create_message(msg_type: int, data: bytes):
    """Create message from type and data."""
    return MESSAGES[msg_type].unpack_data(data)


def package_message(msg_type: int, message) -> bytes:
    """Package message using packager module."""
    import packager
    return packager.package_message(msg_type, message.pack_data())
