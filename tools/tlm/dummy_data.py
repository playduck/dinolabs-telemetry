"""
Dummy Data Source

Generates realistic telemetry messages with temporal coherence for testing and demonstration.
Shows how to create messages and pack them into wire format.
"""

import random
import time
import math
from messages import *


class DummyDataSource:
    """Generates realistic telemetry data with temporal coherence for testing."""

    def __init__(self):
        self.sequence = 0
        self.start_time = time.time()

        # State tracking for temporal coherence
        self.battery_voltage = 15.5  # Start with healthy battery
        self.battery_soc = 85.0  # State of charge
        self.cold_side_temp = 20.0
        self.hot_side_temp = 40.0
        self.tec_power = 0.5  # TEC power level (0-1)
        self.cpu_load = 30.0
        self.storage_used = 45.0
        self.charge_source = 'UMB'  # Start with UMB charging

        # IMU orientation state (Euler angles in radians)
        self.roll = 0.0
        self.pitch = 0.0
        self.yaw = 0.0
        self.angular_velocity = [0.0, 0.0, 0.0]  # rad/s

        # Phase offsets for smooth variations
        self.phase_offset = random.uniform(0, 2 * math.pi)

        # Experiment channels - bioluminescence spike tracking
        # ADC range: 0-1.5V mapped to 10/11-bit values
        # Saturation voltage: 1.2V when LED is on
        self.channel_spikes = [0.0] * 6  # Current spike amplitude for each channel (in volts)
        self.channel_spike_timers = [0.0] * 6  # Time until next spike for each channel
        self.channel_baselines = [random.uniform(-0.005, 0.005) for _ in range(6)]  # Small offset per channel (±5mV)
        self.led_states_int = 0  # Current LED states

    def generate_tec_message(self) -> TecMessage:
        """Generate TEC message with realistic thermal dynamics."""
        t = time.time() - self.start_time

        # Target cold side temperature with slow variations
        target_cold = 20.0

        # Smooth temperature transitions
        self.cold_side_temp += (target_cold - self.cold_side_temp) * 0.1
        self.cold_side_temp += random.uniform(-0.1, 0.1)  # Small noise

        # TEC power varies to maintain temperature
        temp_error = target_cold - self.cold_side_temp
        self.tec_power += temp_error * 0.02
        self.tec_power = max(0.0, min(1.0, self.tec_power))

        # Hot side temperature depends on TEC power and ambient
        ambient_temp = 25.0
        self.hot_side_temp = self.cold_side_temp + 15.0 + self.tec_power * 25.0
        self.hot_side_temp += (ambient_temp - self.hot_side_temp) * 0.05

        # Fan PWM correlates with temperature differential
        temp_diff = self.hot_side_temp - self.cold_side_temp
        fan_pwm = 30.0 + temp_diff * 1.5 + random.uniform(-5.0, 5.0)
        fan_pwm = max(0.0, min(100.0, fan_pwm))

        # TEC voltage and current from power level
        tec_voltage = self.tec_power * 10.0 + random.uniform(-0.2, 0.2)
        tec_current = self.tec_power * 5.5 + random.uniform(-0.1, 0.1)

        message = TecMessage.from_real_values(
            cold_side_temp=self.cold_side_temp,
            hot_side_temp=self.hot_side_temp,
            tec_voltage=tec_voltage,
            tec_current=tec_current,
            fan_pwm=fan_pwm,
            stats_byte=0x00
        )

        # Set status flags based on actual temperature values
        # Bit 0: temperature low (cold side < 19°C)
        # Bit 1: temperature high (cold side > 21°C)
        if self.cold_side_temp < 19.0:
            message.stats_byte |= 0x01
        if self.cold_side_temp > 21.0:
            message.stats_byte |= 0x02

        return message

    def generate_power_message(self) -> PowerMessage:
        """Generate power message with realistic battery behavior."""
        t = time.time() - self.start_time

        # Slowly discharge or charge battery based on charge source
        if self.charge_source in ['USB', 'UMB']:
            # Charging - slowly increase voltage and SOC
            charge_rate = 0.002 if self.charge_source == 'USB' else 0.005
            self.battery_voltage += charge_rate
            self.battery_soc += charge_rate * 10.0
            if self.battery_voltage > 16.8:
                self.battery_voltage = 16.8
                self.battery_soc = 100.0
        else:
            # Discharging - slowly decrease voltage and SOC
            discharge_rate = 0.001
            self.battery_voltage -= discharge_rate
            self.battery_soc -= discharge_rate * 10.0
            if self.battery_voltage < 12.0:
                self.battery_voltage = 12.0
                self.battery_soc = 10.0

        # Occasionally switch charge source
        if random.random() < 0.01:  # 1% chance per call
            self.charge_source = random.choice(['NONE', 'USB', 'UMB'])

        # Add small voltage ripple
        battery_voltage = self.battery_voltage + random.uniform(-0.05, 0.05)

        # Current varies with load (CPU usage affects power draw)
        base_current = 1.5 + (self.cpu_load / 100.0) * 3.0
        battery_current = base_current + random.uniform(-0.2, 0.2)

        # Rails are stable with small noise
        rail_12v_voltage = 12.1 + random.uniform(-0.1, 0.1)
        rail_12v_current = 0.5 + (self.tec_power * 2.0) + random.uniform(-0.1, 0.1)

        rail_5v_voltage = 5.0 + random.uniform(-0.05, 0.05)
        rail_5v_current = 0.8 + (self.cpu_load / 100.0) * 1.0 + random.uniform(-0.05, 0.05)

        rail_3v3_voltage = 3.3 + random.uniform(-0.03, 0.03)
        rail_3v3_current = 0.5 + random.uniform(-0.05, 0.05)

        message = PowerMessage.from_real_values(
            battery_voltage=battery_voltage,
            battery_current=battery_current,
            rail_12v_voltage=rail_12v_voltage,
            rail_12v_current=rail_12v_current,
            rail_5v_voltage=rail_5v_voltage,
            rail_5v_current=rail_5v_current,
            rail_3v3_voltage=rail_3v3_voltage,
            rail_3v3_current=rail_3v3_current,
            status_byte=0x00
        )

        # Set status flags based on actual values
        if battery_voltage < 12.5 or battery_voltage > 17.0:
            message.status_byte |= 0x01
        if rail_12v_voltage < 11.4 or rail_12v_voltage > 12.6:
            message.status_byte |= 0x02
        if rail_5v_voltage < 4.7 or rail_5v_voltage > 5.3:
            message.status_byte |= 0x04
        if rail_3v3_voltage < 3.0 or rail_3v3_voltage > 3.6:
            message.status_byte |= 0x08

        # Set charge source flags
        if self.charge_source == 'USB':
            message.status_byte |= 0x10
        elif self.charge_source == 'UMB':
            message.status_byte |= 0x20

        return message

    def generate_sys_message(self) -> SysMessage:
        """Generate system message with realistic system behavior."""
        t = time.time() - self.start_time

        # CPU load varies smoothly with some peaks
        cpu_target = 35.0 + 25.0 * math.sin(t / 20.0 + self.phase_offset)
        cpu_target += 20.0 * math.sin(t / 5.0)  # Faster variation for bursts
        self.cpu_load += (cpu_target - self.cpu_load) * 0.15
        self.cpu_load = max(10.0, min(95.0, self.cpu_load + random.uniform(-3.0, 3.0)))

        # Storage slowly increases over time
        self.storage_used += random.uniform(0.0, 0.005)
        if self.storage_used > 85.0:
            self.storage_used = 45.0  # Reset for demo purposes

        # External fan PWM correlates with CPU load
        ext_fan_pwm = 20.0 + (self.cpu_load / 100.0) * 50.0 + random.uniform(-5.0, 5.0)
        ext_fan_pwm = max(0.0, min(100.0, ext_fan_pwm))

        # Charge voltage depends on charge source
        charge_voltage = 0.0
        if self.charge_source == 'USB':
            charge_voltage = 5.0
        elif self.charge_source == 'UMB':
            charge_voltage = 20.0

        # LED states show experiment chambers (cycle through patterns)
        led_pattern = int(t / 10.0) % 6  # Cycle through chambers
        led_states = (1 << led_pattern)
        self.led_states_int = led_states  # Store for experiment data generation

        return SysMessage.from_real_values(
            cpu_load=self.cpu_load,
            storage_capacity=self.storage_used,
            soc=self.battery_soc,
            ext_fan_pwm=ext_fan_pwm,
            epoch=int(time.time()) & 0x1FFF,
            charge_voltage=charge_voltage,
            led_states=led_states,
            status_byte=0x00  # Nominal
        )

    def _update_channel_spike(self, channel_idx, dt):
        """Update bioluminescence spike state for a channel."""
        # Check if LED is on for this channel (saturates sensor)
        led_on = bool(self.led_states_int & (1 << (5 - channel_idx)))

        if led_on:
            # LED on: sensor saturates at ~1.2V (slightly below due to amplifier limits)
            return 1.18 + random.uniform(-0.002, 0.002)

        # LED off: normal bioluminescence behavior
        # Decay existing spike
        if self.channel_spikes[channel_idx] > 0:
            decay_rate = 0.5  # V/s decay rate
            self.channel_spikes[channel_idx] -= decay_rate * dt
            if self.channel_spikes[channel_idx] < 0:
                self.channel_spikes[channel_idx] = 0

        # Check if time for new spike
        self.channel_spike_timers[channel_idx] -= dt
        if self.channel_spike_timers[channel_idx] <= 0:
            # Random chance of spike (10% per opportunity)
            if random.random() < 0.1:
                # Generate spike with random amplitude (50-400mV)
                self.channel_spikes[channel_idx] = random.uniform(0.05, 0.4)
            # Set timer for next spike opportunity (0.5-2 seconds)
            self.channel_spike_timers[channel_idx] = random.uniform(0.5, 2.0)

        # Return total signal: baseline + spike + noise
        signal = self.channel_baselines[channel_idx] + self.channel_spikes[channel_idx]
        signal += random.uniform(-0.01, 0.01)

        # low-pass filter to smooth out noise
        signal = 0.7 * (self.channel_baselines[channel_idx] + self.channel_spikes[channel_idx]) + 0.3 * signal

        return max(-0.18, signal)  # Clamp to positive

    def _voltage_to_adc(self, voltage, bits):
        """Convert voltage to ADC counts."""
        adc_max = 1.2  # 0-1.2V ADC range (absolute maximum)
        max_count = (1 << bits) - 1
        # Clamp voltage to ADC maximum range
        clamped_voltage = max(0.0, min(adc_max, voltage))
        counts = int((clamped_voltage / adc_max) * max_count)
        return max(0, min(max_count, counts))

    def generate_exp1_message(self) -> Exp1Message:
        """Generate experiment 1 message with bioluminescent algae simulation (channels 0-2)."""
        dt = 0.1  # Assume ~100ms between calls

        # Update spike states for channels 0-2
        voltages = []
        for i in range(3):
            voltages.append(self._update_channel_spike(i, dt))

        # Simulate min/max capture over measurement window
        # Add small variations around the voltage to create min/max spread
        def create_min_max(voltage):
            # Create a small spread (±1-5mV) around the current voltage
            spread = random.uniform(0.001, 0.005)
            min_v = voltage - spread
            max_v = voltage + spread
            # Ensure min < max and both are non-negative
            min_v = max(0.0, min_v)
            max_v = max(min_v + 0.0001, max_v)  # Guarantee max > min
            return min_v, max_v

        c0_min_v, c0_max_v = create_min_max(voltages[0])
        c1_min_v, c1_max_v = create_min_max(voltages[1])
        c2_min_v, c2_max_v = create_min_max(voltages[2])

        return Exp1Message(
            c0_min=self._voltage_to_adc(c0_min_v, 11),
            c0_max=self._voltage_to_adc(c0_max_v, 10),
            c1_min=self._voltage_to_adc(c1_min_v, 11),
            c1_max=self._voltage_to_adc(c1_max_v, 10),
            c2_min=self._voltage_to_adc(c2_min_v, 11),
            c2_max=self._voltage_to_adc(c2_max_v, 10)
        )

    def generate_exp2_message(self) -> Exp2Message:
        """Generate experiment 2 message with bioluminescent algae simulation (channels 3-5)."""
        dt = 0.1  # Assume ~100ms between calls

        # Update spike states for channels 3-5
        voltages = []
        for i in range(3, 6):
            voltages.append(self._update_channel_spike(i, dt))

        # Simulate min/max capture over measurement window
        # Add small variations around the voltage to create min/max spread
        def create_min_max(voltage):
            # Create a small spread (±1-5mV) around the current voltage
            spread = random.uniform(0.001, 0.005)
            min_v = voltage - spread
            max_v = voltage + spread
            # Ensure min < max and both are non-negative
            min_v = max(0.0, min_v)
            max_v = max(min_v + 0.0001, max_v)  # Guarantee max > min
            return min_v, max_v

        c3_min_v, c3_max_v = create_min_max(voltages[0])
        c4_min_v, c4_max_v = create_min_max(voltages[1])
        c5_min_v, c5_max_v = create_min_max(voltages[2])

        return Exp2Message(
            c3_min=self._voltage_to_adc(c3_min_v, 11),
            c3_max=self._voltage_to_adc(c3_max_v, 10),
            c4_min=self._voltage_to_adc(c4_min_v, 11),
            c4_max=self._voltage_to_adc(c4_max_v, 10),
            c5_min=self._voltage_to_adc(c5_min_v, 11),
            c5_max=self._voltage_to_adc(c5_max_v, 10)
        )

    def generate_exp_imu_message(self) -> ExpImuMessage:
        """Generate IMU message with realistic physics and orientation."""
        t = time.time() - self.start_time

        # Simulate slow tumbling motion
        self.roll += 0.05 * math.sin(t * 0.3)
        self.pitch += 0.03 * math.cos(t * 0.4)
        self.yaw += 0.02

        # Normalize angles
        self.roll = self.roll % (2 * math.pi)
        self.pitch = self.pitch % (2 * math.pi)
        self.yaw = self.yaw % (2 * math.pi)

        # Calculate gravity vector in body frame (accelerometer measures gravity + acceleration)
        # Simplified: assuming minimal linear acceleration, mostly gravity
        g = 1.0  # 1g Earth gravity
        acc_x = g * math.sin(self.pitch) + random.uniform(-0.05, 0.05)
        acc_y = -g * math.sin(self.roll) * math.cos(self.pitch) + random.uniform(-0.05, 0.05)
        acc_z = g * math.cos(self.roll) * math.cos(self.pitch) + random.uniform(-0.05, 0.05)

        # Magnetometer: Earth's magnetic field ~0.5 Gauss
        # Rotated by orientation
        mag_earth = 0.5  # 0.5 Gauss
        mag_x = mag_earth * math.cos(self.yaw) * math.cos(self.pitch) + random.uniform(-0.02, 0.02)
        mag_y = mag_earth * math.sin(self.yaw) * math.cos(self.pitch) + random.uniform(-0.02, 0.02)
        mag_z = mag_earth * math.sin(self.pitch) + random.uniform(-0.02, 0.02)

        # 10-bit unsigned field (0-1023), need to handle bipolar signals with offset
        # Use midpoint (512) as zero point for ±5g range
        # Accelerometer: (value + 5.12) * 100 → 0 to 1023 for -5.12g to +5.12g
        # Magnetometer: (value + 5.12) * 100 → 0 to 1023 for -5.12 to +5.12 Gauss
        offset = 512  # Midpoint of 10-bit range

        return ExpImuMessage(
            acc_x_max=max(0, min(1023, int(acc_x * 100) + offset)),
            acc_y_max=max(0, min(1023, int(acc_y * 100) + offset)),
            acc_z_max=max(0, min(1023, int(acc_z * 100) + offset)),
            mag_x=max(0, min(1023, int(mag_x * 100) + offset)),
            mag_y=max(0, min(1023, int(mag_y * 100) + offset)),
            mag_z=max(0, min(1023, int(mag_z * 100) + offset)),
            hi_lo_g_flag=0,  # Low-g mode for normal operation
            reserved=0
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
