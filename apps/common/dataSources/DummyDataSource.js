const EventEmitter = require('node:events');

class DummyDataSource extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.TAG = "DUMMY_SOURCE";
    this.interval = null;
    this.messageCounter = 0;
    this.expBoardState = 0;
  }

  map(x, in_low, in_high, out_low, out_high) {
    const mapped = (x - in_low) * (out_high - out_low) / (in_high - in_low) + out_low;
    return Math.min(Math.max(mapped, out_low), out_high);
  }

  debugUniform(low, high) {
    const SCALING_FACTOR = 1000.0;
    // return Math.round(((Math.random() * (high - low)) + low) * SCALING_FACTOR);
    const random = Math.random() * Math.random() // triangular distribution
    return this.map(random, 0, 1, low * SCALING_FACTOR, high * SCALING_FACTOR);
  }

  generateDummyPayload() {
    const timestamp = Date.now();
    const payloadTypes = ['PowerState', 'ExperiementState', 'CoolingState', 'SystemStatus'];
    const selectedType = payloadTypes[this.messageCounter % payloadTypes.length];

    let payload = {
      crc32: Math.floor(Math.random() * 0xFFFFFFFF),
      timestamp: timestamp
    };

    switch(selectedType) {
      case 'PowerState':
        payload.PowerState = {
          V_Battery: this.debugUniform(14, 16.5),
          I_Battery: this.debugUniform(1.2, 3),
          V_Charge_Input: this.debugUniform(19.1, 31.2),
          I_Charge_Input: this.debugUniform(0, 0.5),
          V_Rail_12V: this.debugUniform(11.5, 12.2),
          I_Rail_12V: this.debugUniform(0.8, 1),
          V_Rail_5V: this.debugUniform(4.7, 5.2),
          I_Rail_5V: this.debugUniform(1.0, 2.0),
          V_Rail_3V3: this.debugUniform(3.18, 3.45),
          I_Rail_3V3: this.debugUniform(0.7, 1.2),
          powerState: 0b00000110
        };
        break;

      case 'ExperiementState':
        payload.ExperiementState = {
          chambers: [
            {
              led: true,
              averageRawOpticalPower: this.debugUniform(0, 20),
              photodiodeVoltage: this.debugUniform(0, 0.256)
            },
            {
              led: true,
              averageRawOpticalPower: this.debugUniform(0, 20),
              photodiodeVoltage: this.debugUniform(0, 0.256)
            },
            {
              led: true,
              averageRawOpticalPower: this.debugUniform(0, 20),
              photodiodeVoltage: this.debugUniform(0, 0.256)
            },
            {
              led: true,
              averageRawOpticalPower: this.debugUniform(0, 20),
              photodiodeVoltage: this.debugUniform(0, 0.256)
            },
            {
              led: true,
              averageRawOpticalPower: this.debugUniform(0, 20),
              photodiodeVoltage: this.debugUniform(0, 0.256)
            },
            {
              led: true,
              averageRawOpticalPower: this.debugUniform(0, 20),
              photodiodeVoltage: this.debugUniform(0, 0.256)
            }
          ]
        };
        break;

      case 'CoolingState':
        const time = timestamp;
        payload.CoolingState = {
          TopTEC: {
            TECVoltage: Math.round((6 + 2 * Math.sin(time / 5000.0)) * 1000),
            TECCurrent: this.debugUniform(0.7, 2.5)
          },
          BottomTEC: {
            TECVoltage: Math.round((5 + 3 * Math.cos(time / 5000.0)) * 1000),
            TECCurrent: this.debugUniform(0.7, 2.5)
          },
          fan: {
            FanPWM: this.debugUniform(0, 1024)
          },
          Temp_Top_Cool_Side: this.debugUniform(18.5, 21.5),
          Temp_Bottom_Cool_Side: this.debugUniform(18.5, 21.5),
          Temp_Hot_Side: this.debugUniform(35, 50)
        };
        break;

      case 'SystemStatus':
        payload.SystemStatus = {
          currentPayloadState: 0x01,
          lastFCSState: 0x05,
          rawErrorCount: 0,
          cpuUsage: this.debugUniform(0, 100),
          storageCapacity: 63242,
          bootCount: 42, // Simulated boot/reset counter
          IMU: {
            accX: Math.round(0.0 * 1000),
            accY: Math.round(1.0 * 1000),
            accZ: Math.round(0.0 * 1000),
            gyroX: Math.round(0.0 * 1000),
            gyroY: Math.round(0.0 * 1000),
            gyroZ: Math.round(0.0 * 1000),
            magX: Math.round(0.0 * 1000),
            magY: Math.round(0.0 * 1000),
            magZ: Math.round(0.0 * 1000)
          }
        };
        break;
    }

    this.messageCounter++;
    return JSON.stringify(payload);
  }

  scheduleNextMessage() {
    const baseInterval = this.config.interval || 1000;
    const jitterPercent = this.config.jitter || 0.1; // 10% jitter by default
    const jitter = (Math.random() - 0.5) * 2 * jitterPercent * baseInterval;
    const nextInterval = Math.max(baseInterval + jitter, 1); // Ensure at least 1ms

    this.interval = setTimeout(() => {
      const dummyMessage = this.generateDummyPayload();
      this.emit('message', dummyMessage);
      this.scheduleNextMessage(); // Schedule the next message
    }, nextInterval);
  }

  start() {
    console.log(this.TAG, `Starting dummy data source with interval ${this.config.interval}ms and jitter ${(this.config.jitter || 0.1) * 100}%`);
    this.scheduleNextMessage();
    console.log(this.TAG, "Dummy data source started");
  }

  stop() {
    if (this.interval) {
      clearTimeout(this.interval);
      this.interval = null;
      console.log(this.TAG, "Dummy data source stopped");
    }
  }
}

module.exports = DummyDataSource;
