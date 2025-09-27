"""
Message Scheduler Module

Manages periodic message transmission with different intervals.
Ensures fair distribution of messages based on their transmission rates.
"""

import time
from typing import List, Tuple, Callable
from dataclasses import dataclass
from messages import *
from dummy_data import DummyDataSource

from colors import Colors
from packager import format_wire_message

BATCH_INTERVAL_MS = 100
INTERMESSAGE_DELAY_MS = 1  # Delay between individual messages in a batch

@dataclass
class MessageScheduleEntry:
    """Represents a scheduled message type with timing information."""
    msg_type: int
    message_class: type
    interval_ms: int
    generator: Callable
    last_sent_ms: int = 0

    def is_due(self, current_time_ms: int) -> bool:
        """Check if this message is due to be sent."""
        return (current_time_ms - self.last_sent_ms) >= self.interval_ms

    def mark_sent(self, current_time_ms: int):
        """Mark this message as sent at the current time."""
        self.last_sent_ms = current_time_ms


class MessageScheduler:
    """
    Schedules periodic message transmission based on intervals.
    Accumulates messages and sends them out in batches every second.
    """

    def __init__(self, data_source: DummyDataSource = None, batch_interval_ms: int = BATCH_INTERVAL_MS, intermessage_delay_ms: int = INTERMESSAGE_DELAY_MS):
        self.data_source = data_source or DummyDataSource()
        self.schedule = self._create_schedule()
        self.message_counts = {entry.msg_type: 0 for entry in self.schedule}

        # Batching configuration
        self.batch_interval_ms = batch_interval_ms
        self.intermessage_delay_ms = intermessage_delay_ms
        self.last_batch_sent_ms = 0
        self.message_buffer = []

    def _create_schedule(self) -> List[MessageScheduleEntry]:
        """Create the message schedule with intervals and generators."""
        return [
            MessageScheduleEntry(MSG_TEC, TecMessage, TecMessage.interval_ms,
                               self.data_source.generate_tec_message),
            MessageScheduleEntry(MSG_POWER, PowerMessage, PowerMessage.interval_ms,
                               self.data_source.generate_power_message),
            MessageScheduleEntry(MSG_SYS, SysMessage, SysMessage.interval_ms,
                               self.data_source.generate_sys_message),
            MessageScheduleEntry(MSG_EXP1, Exp1Message, Exp1Message.interval_ms,
                               self.data_source.generate_exp1_message),
            MessageScheduleEntry(MSG_EXP2, Exp2Message, Exp2Message.interval_ms,
                               self.data_source.generate_exp2_message),
            MessageScheduleEntry(MSG_EXP_IMU, ExpImuMessage, ExpImuMessage.interval_ms,
                               self.data_source.generate_exp_imu_message),
        ]

    def _accumulate_messages(self):
        """Generate messages that are due and add them to the buffer."""
        current_time_ms = int(time.time() * 1000)

        for entry in self.schedule:
            if entry.is_due(current_time_ms):
                try:
                    message = entry.generator()
                    wire_data = package_message(entry.msg_type, message)
                    self.message_buffer.append(wire_data)
                    entry.mark_sent(current_time_ms)
                    self.message_counts[entry.msg_type] += 1

                except Exception as e:
                    print(f"Error generating message type {entry.msg_type:02X}: {e}")
                    pass

    def get_batch_if_ready(self) -> Tuple[bool, List[bytes]]:
        """
        Returns (is_batch_ready, batch_data).
        is_batch_ready: True if it's time to send a batch
        batch_data: List of wire data (may be empty if no messages were ready)
        Each item in batch_data is a 10-byte wire format message.
        """
        current_time_ms = int(time.time() * 1000)

        # Always accumulate new messages
        self._accumulate_messages()

        # Check if it's time to send the batch
        if (current_time_ms - self.last_batch_sent_ms) >= self.batch_interval_ms:
            batch = self.message_buffer.copy()
            self.message_buffer.clear()
            self.last_batch_sent_ms = current_time_ms
            return True, batch  # Batch ready (may be empty)

        return False, []  # Not time for batch yet

    def get_due_messages(self) -> List[Tuple[int, object, bytes]]:
        """Legacy method - now returns empty list as batching is preferred."""
        return []

    def get_intervals(self) -> List[Tuple[int, int]]:
        """Get message types and their intervals."""
        return [(entry.msg_type, entry.interval_ms) for entry in self.schedule]

    def get_buffer_status(self) -> Tuple[int, int]:
        """Get current buffer status: (messages_in_buffer, time_until_next_batch_ms)."""
        current_time_ms = int(time.time() * 1000)
        time_until_batch = max(0, self.batch_interval_ms - (current_time_ms - self.last_batch_sent_ms))
        return len(self.message_buffer), time_until_batch




def main():
    """Demonstrate the message scheduler with batching."""
    print("Message Scheduler Demo (Batching Mode)")
    print("=" * 50)

    scheduler = MessageScheduler(batch_interval_ms=BATCH_INTERVAL_MS)

    print("Message intervals:")

    for msg_type, interval_ms in scheduler.get_intervals():
        name = MESSAGE_TYPE_NAMES[msg_type]
        print(f"  {name:8s}: {interval_ms:4d}ms ({1000/interval_ms:4.1f}/s)")

    print(f"\nBatch interval: {scheduler.batch_interval_ms}ms")
    print(f"\n{Colors.BOLD}Wire format legend:{Colors.RESET}")
    print(f"  {Colors.YELLOW}[NAME   ]{Colors.RESET} [{Colors.RED}TT{Colors.RESET}] [{Colors.GREEN}DD DD DD DD DD DD DD DD{Colors.RESET}] [{Colors.BLUE}PP{Colors.RESET}]")
    print(f"  Where: {Colors.RED}TT{Colors.RESET}=Type, {Colors.GREEN}DD{Colors.RESET}=Data (8 bytes), {Colors.BLUE}PP{Colors.RESET}=Parity")

    start_time = time.time()
    batch_count = 0

    while True:
        is_ready, batch = scheduler.get_batch_if_ready()
        if is_ready:  # Time for a batch (may be empty)
            batch_count += 1
            elapsed = (time.time() - start_time) * 1000  # Convert to ms
            if len(batch) == 0:
                print(f"{Colors.BOLD}[BATCH {batch_count:2d}] at {elapsed:6.1f}ms - {Colors.YELLOW}EMPTY{Colors.RESET}")
            else:
                print(f"{Colors.BOLD}[BATCH {batch_count:2d}] at {elapsed:6.1f}ms - {len(batch)} messages:{Colors.RESET}")
                for wire_data in batch:
                    msg_type = wire_data[0]
                    name = MESSAGE_TYPE_NAMES.get(msg_type, f"{msg_type:02X}")
                    colored_msg = format_wire_message(wire_data, name)
                    print(f"  {colored_msg}")

        time.sleep(0.001)  # 1ms polling to match batch interval


if __name__ == "__main__":
    main()
