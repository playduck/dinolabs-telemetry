// Consolidated telemetry data processing for new TLM format

// Message type constants from TlmParser.js
const MSG_TEC = 0x51;
const MSG_POWER = 0x52;
const MSG_SYS = 0x53;
const MSG_EXP1 = 0x54;
const MSG_EXP2 = 0x55;
const MSG_EXP_IMU = 0x56;
const MSG_FCS = 0x01;

const MESSAGE_TYPE_NAMES = {
  [MSG_TEC]: "TEC",
  [MSG_POWER]: "POWER",
  [MSG_SYS]: "SYSTEM",
  [MSG_EXP1]: "EXP1",
  [MSG_EXP2]: "EXP2",
  [MSG_EXP_IMU]: "EXPIMU",
  [MSG_FCS]: "FCS"
};

// Process TEC (Thermal Electric Cooling) messages
export const processTecMessage = (data, realValues, timestamp) => {
  if (!data || !realValues) return null;

  const coldSideTemp = realValues.cold_side_temp?.real;
  const hotSideTemp = realValues.hot_side_temp?.real;
  const tempStatus = determineTemperatureStatus(coldSideTemp, hotSideTemp, true); // true = already in celsius

  return {
    systems: {
      TEMPERATURE: {
        status: tempStatus,
        coldSideTemp: coldSideTemp,
        hotSideTemp: hotSideTemp,
        tecVoltage: realValues.tec_voltage?.real,
        tecCurrent: realValues.tec_current?.real,
        fanPwm: realValues.fan_pwm?.real,
        statsBytes: data.stats_byte
      },
      COOLING: {
        status: tempStatus,
        tecs: {
          voltage: realValues.tec_voltage?.real,
          current: realValues.tec_current?.real
        },
        fan: {
          pwm: realValues.fan_pwm?.real
        }
      }
    },
    timestamps: {
      lastCoolingMessage: timestamp
    }
  };
};

// Decode PowerMessage status_byte (6 bits)
// Bit layout: [unused][unused][bit3=3V3_error][bit2=5V_error][bit1=12V_error][bit0=VBAT_error]
// NOTE: Bits are set when rail voltages are OUT OF RANGE (error condition)
const decodePowerStatusByte = (statusByte) => {
  return {
    rail_vbat_ok: !(statusByte & 0x01),       // Bit 0: VBAT error (invert for OK)
    rail_12v_ok: !(statusByte & 0x02),        // Bit 1: 12V error (invert for OK)
    rail_5v_ok: !(statusByte & 0x04),         // Bit 2: 5V error (invert for OK)
    rail_3v3_ok: !(statusByte & 0x08),        // Bit 3: 3V3 error (invert for OK)
    chargeSourceUSB: !!(statusByte & 0x10), // Bit 4: USB charging source
    chargeSourceUMB: !!(statusByte & 0x20), // Bit 5: UMB charging source
  };
};

// Process POWER messages
export const processPowerMessage = (data, realValues, timestamp) => {
  if (!data || !realValues) return null;

  const batteryVoltage = realValues.battery_voltage?.real;
  const powerStatus = determinePowerStatusFromNew(realValues, data.status_byte);
  const statusFlags = decodePowerStatusByte(data.status_byte);

  let chargeSource = 'NONE';
  if (statusFlags.chargeSourceUSB) {
    chargeSource = 'USB';
  } else if (statusFlags.chargeSourceUMB) {
    chargeSource = 'UMB';
  }
  if(statusFlags.chargeSourceUSB && statusFlags.chargeSourceUMB) {
    chargeSource = 'ERROR';
  }


  return {
    systems: {
      POWER: {
        status: powerStatus,
        batteryVoltage: batteryVoltage,
        batteryCurrent: realValues.battery_current?.real,
        statusByte: data.status_byte,
        statusFlags: statusFlags,
        chargeSource: chargeSource,
        rails: {
          V_Rail_12V: realValues.rail_12v_voltage?.real,
          I_Rail_12V: realValues.rail_12v_current?.real,
          V_Rail_5V: realValues.rail_5v_voltage?.real,
          I_Rail_5V: realValues.rail_5v_current?.real,
          V_Rail_3V3: realValues.rail_3v3_voltage?.real,
          I_Rail_3V3: realValues.rail_3v3_current?.real,
          I_Battery: realValues.battery_current?.real,
          // Add status flags for individual rails
          rail_vbat_ok: statusFlags.rail_vbat_ok,
          rail_12v_ok: statusFlags.rail_12v_ok,
          rail_5v_ok: statusFlags.rail_5v_ok,
          rail_3v3_ok: statusFlags.rail_3v3_ok
        }
      }
    },
    timestamps: {
      lastPowerMessage: timestamp
    }
  };
};

// Process SYSTEM messages
export const processSysMessage = (data, realValues, timestamp) => {
  if (!data || !realValues) return null;

  const cpuLoad = realValues.cpu_load?.real;
  const storageCapacity = realValues.storage_capacity?.real;
  const soc = realValues.soc?.real; // State of charge
  const epoch = realValues.epoch?.real;

  // Convert 6-bit LED states integer to array of booleans
  const ledStatesInt = data.led_states || 0;
  const ledStates = [
    !!(ledStatesInt & 0x20), // Bit 5 - Chamber 0
    !!(ledStatesInt & 0x10), // Bit 4 - Chamber 1
    !!(ledStatesInt & 0x08), // Bit 3 - Chamber 2
    !!(ledStatesInt & 0x04), // Bit 2 - Chamber 3
    !!(ledStatesInt & 0x02), // Bit 1 - Chamber 4
    !!(ledStatesInt & 0x01)  // Bit 0 - Chamber 5
  ];

  // Determine system status based on CPU load and storage
  let systemStatus = 'NOMINAL';
  let systemMode = 'OPERATIONAL';

  if (cpuLoad > 90) {
    systemStatus = 'HIGH_CPU';
  } else if (storageCapacity > 95) {
    systemStatus = 'STORAGE_FULL';
  }

  return {
    systems: {
      SYSTEM: {
        status: systemStatus,
        mode: systemMode,
        cpuUsage: cpuLoad,
        storageCapacity: storageCapacity,
        soc: soc,
        epoch: epoch,
        extFanPwm: realValues.ext_fan_pwm?.real,
        chargeVoltage: realValues.charge_voltage?.real,
        ledStates: ledStates,
        statusByte: data.status_byte
      }
    },
    timestamps: {
      lastSystemMessage: timestamp
    }
  };
};

// Convert ADC counts to voltage for experiment channels
// ADC range: 0-1.2V
// c*_min: 11-bit (0-2047 counts)
// c*_max: 10-bit (0-1023 counts)
const countsToVoltage = (counts, bits) => {
  if (counts === null || counts === undefined) return null;
  const maxCounts = (1 << bits) - 1;
  const adcRange = 1.2; // 0-1.2V ADC range
  return (counts / maxCounts) * adcRange;
};

// Process EXP1 messages (experiment channels 0-2)
export const processExp1Message = (data, realValues, timestamp) => {
  if (!data || !realValues) return null;

  return {
    systems: {
      EXPERIMENT: {
        status: 'NOMINAL',
        channels: {
          c0: {
            min: countsToVoltage(realValues.c0_min?.real, 11),
            max: countsToVoltage(realValues.c0_max?.real, 10)
          },
          c1: {
            min: countsToVoltage(realValues.c1_min?.real, 11),
            max: countsToVoltage(realValues.c1_max?.real, 10)
          },
          c2: {
            min: countsToVoltage(realValues.c2_min?.real, 11),
            max: countsToVoltage(realValues.c2_max?.real, 10)
          }
        }
      }
    },
    timestamps: {
      lastExperimentMessage: timestamp
    }
  };
};

// Process EXP2 messages (experiment channels 3-5)
export const processExp2Message = (data, realValues, timestamp) => {
  if (!data || !realValues) return null;

  return {
    systems: {
      EXPERIMENT: {
        status: 'NOMINAL',
        channels: {
          c3: {
            min: countsToVoltage(realValues.c3_min?.real, 11),
            max: countsToVoltage(realValues.c3_max?.real, 10)
          },
          c4: {
            min: countsToVoltage(realValues.c4_min?.real, 11),
            max: countsToVoltage(realValues.c4_max?.real, 10)
          },
          c5: {
            min: countsToVoltage(realValues.c5_min?.real, 11),
            max: countsToVoltage(realValues.c5_max?.real, 10)
          }
        }
      }
    },
    timestamps: {
      lastExperimentMessage: timestamp
    }
  };
};

// Process EXP_IMU messages
export const processExpImuMessage = (data, realValues, timestamp) => {
  if (!data || !realValues) return null;

  // BitField scale factor is 1.0, so raw values pass through as-is
  // Values are stored with offset 512 (midpoint) representing zero
  // Subtract offset then divide by 100 to get physical units
  const offset = 512;
  const accX = realValues.acc_x_max?.real != null ? (realValues.acc_x_max.real - offset) / 100.0 : null;
  const accY = realValues.acc_y_max?.real != null ? (realValues.acc_y_max.real - offset) / 100.0 : null;
  const accZ = realValues.acc_z_max?.real != null ? (realValues.acc_z_max.real - offset) / 100.0 : null;

  const magX = realValues.mag_x?.real != null ? (realValues.mag_x.real - offset) / 100.0 : null;
  const magY = realValues.mag_y?.real != null ? (realValues.mag_y.real - offset) / 100.0 : null;
  const magZ = realValues.mag_z?.real != null ? (realValues.mag_z.real - offset) / 100.0 : null;

  return {
    systems: {
      EXPERIMENT: {
        status: 'NOMINAL',
        imu: {
          accelerometer: {
            x: accX,
            y: accY,
            z: accZ
          },
          magnetometer: {
            x: magX,
            y: magY,
            z: magZ
          },
          hiLoGFlag: data.hi_lo_g_flag
        }
      }
    },
    derived: {
      accelerometerMagnitude: (accX && accY && accZ) ? Math.sqrt(accX * accX + accY * accY + accZ * accZ) : null
    },
    timestamps: {
      lastExperimentMessage: timestamp
    }
  };
};

// Process FCS (Flight Control System) messages
export const processFcsMessage = (data, realValues, timestamp) => {
  if (!data || !realValues) return null;

  const fcsState = data.fcs_state;
  let systemMode = 'UNKNOWN';
  let systemStatus = 'UNKNOWN';

  // Map FCS state to system mode
  switch (fcsState) {
    case 0:
      systemMode = 'STANDBY';
      systemStatus = 'NOMINAL';
      break;
    case 1:
      systemMode = 'ARMED';
      systemStatus = 'NOMINAL';
      break;
    case 2:
      systemMode = 'FLIGHT';
      systemStatus = 'NOMINAL';
      break;
    default:
      systemMode = 'UNDEFINED';
      systemStatus = 'ERROR';
      break;
  }

  return {
    systems: {
      SYSTEM: {
        status: systemStatus,
        mode: systemMode,
        rawModeCode: fcsState,
        fcsState: fcsState
      }
    },
    timestamps: {
      lastSystemMessage: timestamp
    }
  };
};

export const determineTemperatureStatus = (coldSideTemp, hotSideTemp, isAlreadyCelsius = false) => {
  let tempStatus = 'NOMINAL';

  if (coldSideTemp !== null || hotSideTemp !== null) {
    // Cold side should be 20°C ± 1°C (19-21°C range)
    // Hot side should be below 50°C
    // Convert from millidegrees to degrees for comparison if needed
    const coldSideDegC = coldSideTemp !== null ?
      (isAlreadyCelsius ? coldSideTemp : coldSideTemp / 1000) : null;
    const hotSideDegC = hotSideTemp !== null ?
      (isAlreadyCelsius ? hotSideTemp : hotSideTemp / 1000) : null;

    const coldSideTolerance = 1; // ±1°C tolerance
    const coldSideTarget = 20;

    const tooLow = coldSideDegC !== null && coldSideDegC < coldSideTarget - coldSideTolerance;
    const tooHigh = coldSideDegC !== null && coldSideDegC > coldSideTarget + coldSideTolerance;
    const hotOvertemp = hotSideDegC !== null && hotSideDegC >= 49;

    if (tooLow) {
      tempStatus = 'COLD';
    }
    if (tooHigh) {
      tempStatus = 'HOT';
    }
    if (hotOvertemp) {
      tempStatus = 'OVERHEAT';
    }

    // if two or more are true
    if ((tooLow && tooHigh) || (tooLow && hotOvertemp) || (tooHigh && hotOvertemp)) {
      tempStatus = 'ERROR';
    }
  }

  return tempStatus;
};

// New power status determination for new format
export const determinePowerStatusFromNew = (realValues, statusByte = null) => {
  let status = 'NOMINAL';

  if (!realValues) return status;

  // First check hardware status flags if available
  if (statusByte !== null && statusByte !== undefined) {
    const statusFlags = decodePowerStatusByte(statusByte);

    // Check individual rail status flags (error = NOT in range)
    const railErrors = [];
    if (!statusFlags.rail_vbat_ok) railErrors.push('VBAT FAIL');
    if (!statusFlags.rail_12v_ok) railErrors.push('12V FAIL');
    if (!statusFlags.rail_5v_ok) railErrors.push('5V FAIL');
    if (!statusFlags.rail_3v3_ok) railErrors.push('3V3 FAIL');

    if (railErrors.length === 1) {
      status = railErrors[0];
    } else if (railErrors.length > 1) {
      status = 'MULTI_RAIL_FAIL';
    }
  }

  // If hardware reports everything OK, do secondary voltage range checks
  if (status === 'NOMINAL') {
    const batteryVoltage = realValues.battery_voltage?.real;
    const rail12V = realValues.rail_12v_voltage?.real;
    const rail5V = realValues.rail_5v_voltage?.real;
    const rail3V3 = realValues.rail_3v3_voltage?.real;

    const voltageErrors = [];

    // Check voltage ranges (values are already in proper units from realValues)
    if (batteryVoltage !== null && batteryVoltage !== undefined) {
      if (batteryVoltage > 18) voltageErrors.push('VBAT HIGH');
      if (batteryVoltage < 12) voltageErrors.push('VBAT LOW');
    }

    if (rail12V !== null && rail12V !== undefined) {
      if (rail12V > 12.6) voltageErrors.push('12V HIGH');
      if (rail12V < 11.4) voltageErrors.push('12V LOW');
    }

    if (rail5V !== null && rail5V !== undefined) {
      if (rail5V > 5.4) voltageErrors.push('5V HIGH');
      if (rail5V < 4.6) voltageErrors.push('5V LOW');
    }

    if (rail3V3 !== null && rail3V3 !== undefined) {
      if (rail3V3 > 3.4) voltageErrors.push('3V3 HIGH');
      if (rail3V3 < 2.9) voltageErrors.push('3V3 LOW');
    }

    if (voltageErrors.length === 1) {
      status = voltageErrors[0];
    } else if (voltageErrors.length > 1) {
      status = 'VOLTAGE_ERROR';
    }
  }

  return status;
};

export const determineExperimentStatus = (experimentData) => {
  // TODO: Implement experiment system status determination
  // Add logic for sensor readings, chamber status, etc.
  return 'NOMINAL';
};

export const calculateDerivedValues = (data, prevDerived) => {
  const derived = { ...prevDerived };

  // Handle new TLM format IMU data
  if (data.type === MSG_EXP_IMU && data.realValues) {
    const accX = data.realValues.acc_x_max?.real;
    const accY = data.realValues.acc_y_max?.real;
    const accZ = data.realValues.acc_z_max?.real;
    if (accX !== undefined && accY !== undefined && accZ !== undefined) {
      derived.accelerometerMagnitude = Math.sqrt(accX * accX + accY * accY + accZ * accZ);
    }
  }

  // Add power consumption calculation for new format
  if (data.type === MSG_POWER && data.realValues) {
    const batteryCurrent = data.realValues.battery_current?.real;
    const batteryVoltage = data.realValues.battery_voltage?.real;
    if (batteryCurrent !== undefined && batteryVoltage !== undefined) {
      derived.totalPowerConsumption = Math.abs(batteryCurrent * batteryVoltage);
    }
  }

  // Add temperature differential calculation for new format
  if (data.type === MSG_TEC && data.realValues) {
    const coldSide = data.realValues.cold_side_temp?.real;
    const hotSide = data.realValues.hot_side_temp?.real;
    if (coldSide !== undefined && hotSide !== undefined) {
      derived.temperatureDifferential = hotSide - coldSide;
    }
  }

  return derived;
};

export const createOfflineState = () => ({
  systems: {
    SYSTEM: { status: 'OFFLINE', mode: 'OFFLINE', rawModeCode: null, cpuUsage: null, storageCapacity: null, soc: null, epoch: null, ledStates: [false, false, false, false, false, false] },
    EXPERIMENT: {
      status: 'OFFLINE',
      channels: {},
      imu: null
    },
    TEMPERATURE: { status: 'OFFLINE', coldSideTemp: null, hotSideTemp: null, tecVoltage: null, tecCurrent: null, fanPwm: null },
    POWER: { status: 'OFFLINE', batteryVoltage: null, batteryCurrent: null, powerState: null, rails: {} },
    COOLING: { status: 'OFFLINE', tecs: {}, fan: {} }
  },
  derived: {
    accelerometerMagnitude: null,
    totalPowerConsumption: null,
    temperatureDifferential: null
  },
  timestamps: {
    lastMessage: null,
    lastSystemMessage: null,
    lastPowerMessage: null,
    lastCoolingMessage: null,
    lastExperimentMessage: null
  }
});

export const processMessage = (data) => {
  if (!data) return null;

  // Use timestamp from server (when data was received), not client time
  // This is critical for batched messages and accurate time-series data
  const timestamp = data.timestamp || Date.now();
  let result = {
    systems: {},
    statusFlags: null,
    derived: {},
    timestamps: {
      lastMessage: timestamp,
      messageTimestamp: timestamp  // Store for plotting
    }
  };

  // Handle new TLM format messages
  if (data.type !== undefined && data.typeName && data.data && data.realValues) {
    // This is a new TLM format message
    let messageResult = null;

    switch (data.type) {
      case MSG_TEC:
        messageResult = processTecMessage(data.data, data.realValues, timestamp);
        break;
      case MSG_POWER:
        messageResult = processPowerMessage(data.data, data.realValues, timestamp);
        break;
      case MSG_SYS:
        messageResult = processSysMessage(data.data, data.realValues, timestamp);
        break;
      case MSG_EXP1:
        messageResult = processExp1Message(data.data, data.realValues, timestamp);
        break;
      case MSG_EXP2:
        messageResult = processExp2Message(data.data, data.realValues, timestamp);
        break;
      case MSG_EXP_IMU:
        messageResult = processExpImuMessage(data.data, data.realValues, timestamp);
        break;
      case MSG_FCS:
        messageResult = processFcsMessage(data.data, data.realValues, timestamp);
        break;
      default:
        console.warn(`Unknown message type: ${data.type} (${data.typeName})`);
        return null;
    }

    if (messageResult) {
      result.systems = { ...result.systems, ...messageResult.systems };
      result.timestamps = { ...result.timestamps, ...messageResult.timestamps };
      if (messageResult.derived) {
        result.derived = { ...result.derived, ...messageResult.derived };
      }
      if (messageResult.statusFlags) {
        result.statusFlags = messageResult.statusFlags;
      }
    }

    return result;
  }

  return null;
};
