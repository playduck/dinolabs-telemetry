"""
Dummy Data Source

Generates random telemetry messages for testing and demonstration.
Shows how to create messages and pack them into wire format.
"""

import random
import time
from messages import *


class DummyDataSource:
    """Generates random telemetry data for testing."""

    def __init__(self):
        self.sequence = 0
        self.start_time = time.time()

    def generate_tec_message(self) -> TecMessage:
        """Generate random TEC message."""
        return TecMessage.from_real_values(
            cold_side_temp=random.uniform(19.0, 21.0),      # 19-21°C cold side
            hot_side_temp=random.uniform(35.0, 50.0),       # 35-50°C hot side
            tec_voltage=random.uniform(0.0, 12.0),          # 0-12V TEC voltage
            tec_current=random.uniform(0.0, 8.0),           # 0-8A TEC current
            fan_pwm=random.uniform(0.0, 100.0),             # 0-100% PWM
            stats_byte=random.randint(0, 255)               # Status flags
        )

    def generate_power_message(self) -> PowerMessage:
        """Generate random power message."""
        return PowerMessage.from_real_values(
            battery_voltage=random.uniform(12.0, 16.8),     # 12-16.8V battery
            battery_current=random.uniform(0.5, 8.5),       # 0.5-8.5A battery current
            rail_12v_voltage=random.uniform(11.5, 12.5),    # 11.5-12.5V on 12V rail
            rail_12v_current=random.uniform(0.1, 4.5),      # 0.1-4.5A on 12V rail
            rail_5v_voltage=random.uniform(4.8, 5.2),       # 4.8-5.2V on 5V rail
            rail_5v_current=random.uniform(0.1, 2.8),       # 0.1-2.8A on 5V rail
            rail_3v3_voltage=random.uniform(3.1, 3.5),      # 3.1-3.5V on 3.3V rail (nominal 3.3V)
            rail_3v3_current=random.uniform(0.1, 1.8),      # 0.1-1.8A on 3.3V rail
            status_byte=random.randint(0, 63)               # Power status
        )

    def generate_sys_message(self) -> SysMessage:
        """Generate random system message."""
        return SysMessage.from_real_values(
            cpu_load=random.uniform(10.0, 95.0),            # 10-95% CPU load
            storage_capacity=random.uniform(20.0, 85.0),    # 20-85% storage usage
            soc=random.uniform(15.0, 100.0),                # 15-100% state of charge
            ext_fan_pwm=random.uniform(0.0, 100.0),         # 0-100% PWM for external fan
            epoch=int(time.time()) & 0x7FFFF,               # Unix timestamp (19 bits)
            charge_voltage=random.choice([0.0, 5.0, 20.0, 36.0]),
            status_byte=random.randint(0, 255)              # System status
        )

    def generate_exp1_message(self) -> Exp1Message:
        """Generate random experiment 1 message."""
        return Exp1Message(
            c0_min=random.randint(100, 500),                # Channel 0 min
            c0_max=random.randint(600, 1023),               # Channel 0 max
            c1_min=random.randint(50, 300),                 # Channel 1 min
            c1_max=random.randint(400, 1023),               # Channel 1 max
            c2_min=random.randint(200, 600),                # Channel 2 min
            c2_max=random.randint(700, 1023)                # Channel 2 max
        )

    def generate_exp2_message(self) -> Exp2Message:
        """Generate random experiment 2 message."""
        return Exp2Message(
            c3_min=random.randint(80, 400),                 # Channel 3 min
            c3_max=random.randint(500, 1023),               # Channel 3 max
            c4_min=random.randint(150, 450),                # Channel 4 min
            c4_max=random.randint(550, 1023),               # Channel 4 max
            c5_min=random.randint(120, 350),                # Channel 5 min
            c5_max=random.randint(450, 1023)                # Channel 5 max
        )

    def generate_exp_imu_message(self) -> ExpImuMessage:
        """Generate random IMU message."""
        return ExpImuMessage(
            acc_x_max=random.randint(0, 1023),              # Accel X max
            acc_y_max=random.randint(0, 1023),              # Accel Y max
            acc_z_max=random.randint(0, 1023),              # Accel Z max
            mag_x=random.randint(0, 1023),                  # Magnetometer X
            mag_y=random.randint(0, 1023),                  # Magnetometer Y
            mag_z=random.randint(0, 1023),                  # Magnetometer Z
            led_states=random.randint(0, 3),                # LED state (2 bits)
            hi_lo_g_flag=random.randint(0, 1)               # G range flag
        )

    def generate_random_message(self):
        """Generate a random message of any type."""
        generators = [
            (MSG_TEC, self.generate_tec_message),
            (MSG_POWER, self.generate_power_message),
            (MSG_SYS, self.generate_sys_message),
            (MSG_EXP1, self.generate_exp1_message),
            (MSG_EXP2, self.generate_exp2_message),
            (MSG_EXP_IMU, self.generate_exp_imu_message)
        ]

        msg_type, generator = random.choice(generators)
        message = generator()
        return msg_type, message


def print_message_details(msg_type: int, message, wire_data: bytes):
    """Print detailed message information."""
    from packager import format_wire_message, format_wire_data

    type_names = {
        MSG_TEC: "TEC",
        MSG_POWER: "POWER",
        MSG_SYS: "SYSTEM",
        MSG_EXP1: "EXP1",
        MSG_EXP2: "EXP2",
        MSG_EXP_IMU: "EXP_IMU"
    }

    print(f"\n=== {type_names[msg_type]} MESSAGE (0x{msg_type:02X}) ===")
    print(f"Message: {message}")
    print(f"Wire format ({len(wire_data)} bytes): {format_wire_message(wire_data)}")
    print(f"  Type: 0x{wire_data[0]:02X}")
    print(f"  Data: {format_wire_data(wire_data[1:9])}")
    print(f"  Parity: 0x{wire_data[9]:02X}")


def main():
    """Demonstrate message generation and wire format packaging."""
    print("Telemetry Message Demo")
    print("=" * 50)

    data_source = DummyDataSource()

    # Generate and display each message type
    message_types = [
        (MSG_TEC, data_source.generate_tec_message),
        (MSG_POWER, data_source.generate_power_message),
        (MSG_SYS, data_source.generate_sys_message),
        (MSG_EXP1, data_source.generate_exp1_message),
        (MSG_EXP2, data_source.generate_exp2_message),
        (MSG_EXP_IMU, data_source.generate_exp_imu_message)
    ]

    for msg_type, generator in message_types:
        message = generator()
        wire_data = package_message(msg_type, message)
        print_message_details(msg_type, message, wire_data)

    print(f"\n{'='*50}")
    print("Random message stream:")
    print("=" * 50)

    # Generate 5 random messages
    for i in range(5):
        msg_type, message = data_source.generate_random_message()

        wire_data = package_message(msg_type, message)
        from packager import format_wire_message
        print(f"\nMessage {i+1}: {format_wire_message(wire_data)}")

        # Demonstrate unpacking
        import packager
        unpacked_type, unpacked_data, parity, is_valid = packager.unpackage_message(wire_data)

        print(f"  Unpacked - Type: 0x{unpacked_type:02X}, Valid: {is_valid}")

        # Recreate original message
        from messages import create_message
        recreated = create_message(unpacked_type, unpacked_data)
        print(f"  Recreated: {recreated}")


if __name__ == "__main__":
    main()
