// Consolidated telemetry data processing, parsing, and validation logic

export const parseSystemStatus = (systemStatusData) => {
  if (!systemStatusData || typeof systemStatusData.currentPayloadState !== 'number') {
    return null;
  }

  const currentPayloadState = systemStatusData.currentPayloadState;

  // Parse 8-bit currentPayloadState
  const tempOffline = (currentPayloadState & 0x02) !== 0; // Bit 1
  const powerOffline = (currentPayloadState & 0x04) !== 0; // Bit 2
  const expOffline = (currentPayloadState & 0x08) !== 0; // Bit 3

  // Parse system mode from bits 5-7
  const systemModeCode = (currentPayloadState >> 5) & 0x07;
  let systemMode;
  let systemStatus;

  const armedText = 'ARMED/READY';
  const flightText = 'FLIGHT CODE';
  const errorText = 'ERROR';
  const undefinedText = 'UNDEFINED';

  switch (systemModeCode) {
    case 0:
      systemMode = armedText;
      systemStatus = 'NOMINAL';
      break;
    case 1:
      systemMode = flightText;
      systemStatus = 'NOMINAL';
      break;
    case 2:
      systemMode = errorText;
      systemStatus = 'ERROR';
      break;
    default:
      systemMode = undefinedText;
      systemStatus = 'UNKNOWN';
      break;
  }

  return {
    SYSTEM: {
      status: systemStatus,
      mode: systemMode,
      rawModeCode: systemModeCode
    },
    statusFlags: {
      tempOffline,
      powerOffline,
      expOffline
    }
  };
};

export const determineTemperatureStatus = (coldSideTemp, hotSideTemp) => {
  let tempStatus = 'NOMINAL';

  if (coldSideTemp !== null || hotSideTemp !== null) {
    // Cold side should be 20°C ± 1°C (19-21°C range)
    // Hot side should be below 50°C
    // Convert from millidegrees to degrees for comparison
    const coldSideDegC = coldSideTemp !== null ? coldSideTemp / 1000 : null;
    const hotSideDegC = hotSideTemp !== null ? hotSideTemp / 1000 : null;

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

const checkVoltageRange = (name, voltage, high, low) => {
  if (voltage > high) {
    return `${name} HIGH`;
  }
  if (voltage < low) {
    return `${name} LOW`;
  }
  return null;
};

const getSingleErrorOrMultiple = (errors, multipleErrorStatus = 'ERROR') => {
  const activeErrors = errors.filter(error => error !== null);
  
  if (activeErrors.length === 0) {
    return null;
  } else if (activeErrors.length === 1) {
    return activeErrors[0];
  } else {
    return multipleErrorStatus;
  }
};

const calculateRailFailures = (powerState) => {
  return {
    rail_vbat_failed: !!(powerState & 0b00001000),
    rail_12v_failed: !!(powerState & 0b00010000),
    rail_5v_failed: !!(powerState & 0b00100000),
    rail_3v3_failed: !!(powerState & 0b01000000)
  };
};

const calculateRailInRange = (powerStateData) => {
  return {
    rail_vbat_inrange: (powerStateData.V_Battery >= 12000 && powerStateData.V_Battery <= 18000),
    rail_12v_inrange: (powerStateData.V_Rail_12V >= 11400 && powerStateData.V_Rail_12V <= 12600),
    rail_5v_inrange: (powerStateData.V_Rail_5V >= 4600 && powerStateData.V_Rail_5V <= 5400),
    rail_3v3_inrange: (powerStateData.V_Rail_3V3 >= 2900 && powerStateData.V_Rail_3V3 <= 3400)
  };
};

export const determinePowerStatus = (powerStateData) => {
  let status = 'NOMINAL';

  const railFailureFlags = calculateRailFailures(powerStateData.powerState);

  // Check rail failure flags
  const railFailures = [
    railFailureFlags.rail_vbat_failed ? 'VBAT FAILED' : null,
    railFailureFlags.rail_12v_failed ? '12V FAILED' : null,
    railFailureFlags.rail_5v_failed ? '5V FAILED' : null,
    railFailureFlags.rail_3v3_failed ? '3V3 FAILED' : null
  ];

  // Check voltage range errors
  const voltageErrors = [
    checkVoltageRange('VBAT', powerStateData.V_Battery, 18000, 12000),
    checkVoltageRange('12V', powerStateData.V_Rail_12V, 12600, 11400),
    checkVoltageRange('5V', powerStateData.V_Rail_5V, 5400, 4600),
    checkVoltageRange('3V3', powerStateData.V_Rail_3V3, 3400, 2900)
  ];

  // Priority: rail failures override voltage range errors
  const railFailureStatus = getSingleErrorOrMultiple(railFailures);
  const voltageErrorStatus = getSingleErrorOrMultiple(voltageErrors);

  if (railFailureStatus) {
    status = railFailureStatus;
  } else if (voltageErrorStatus) {
    status = voltageErrorStatus;
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

  // Calculate accelerometer magnitude if IMU data is available
  if (data.SystemStatus?.IMU) {
    const { accX, accY, accZ } = data.SystemStatus.IMU;
    if (accX !== undefined && accY !== undefined && accZ !== undefined) {
      derived.accelerometerMagnitude = Math.sqrt(accX * accX + accY * accY + accZ * accZ);
    }
  }

  // Add more derived calculations here as needed
  // Examples:
  // - Total power consumption
  // - Temperature differentials
  // - System health scores

  return derived;
};

export const createOfflineState = () => ({
  systems: {
    SYSTEM: { status: 'OFFLINE', mode: 'OFFLINE', rawModeCode: null, cpuUsage: null, storageCapacity: null },
    EXPERIMENT: { status: 'OFFLINE', chambers: [false, false, false, false, false, false] },
    TEMPERATURE: { status: 'OFFLINE', coldSideTemp: null, hotSideTemp: null },
    POWER: { status: 'OFFLINE', batteryVoltage: null, powerState: null, rails: {} },
    COOLING: { status: 'OFFLINE', tecs: {}, fan: {} }
  },
  derived: {
    accelerometerMagnitude: null
  },
  timestamps: {
    lastMessage: null,
    lastSystemMessage: null,
    lastPowerMessage: null,
    lastCoolingMessage: null,
    lastExperimentMessage: null
  }
});

export const processSystemStatusMessage = (systemStatusData, timestamp) => {
  const systemData = parseSystemStatus(systemStatusData);
  if (!systemData) return null;

  return {
    systems: {
      SYSTEM: {
        ...systemData.SYSTEM,
        cpuUsage: systemStatusData.cpuUsage ?? null,
        storageCapacity: systemStatusData.storageCapacity ?? null,
        bootCount: systemStatusData.bootCount ?? null
      }
    },
    statusFlags: systemData.statusFlags,
    timestamps: {
      lastSystemMessage: timestamp
    }
  };
};

export const processPowerStateMessage = (powerStateData, timestamp) => {
  if (!powerStateData) return null;

  let chargeSource = 'UNKNOWN';
  if (powerStateData.powerState & 0b00000001) {
    chargeSource = 'USB';
  } else if (powerStateData.powerState & 0b00000010) {
    chargeSource = 'UMB';
  } else if ((powerStateData.powerState & 0b00000011) == false) {
    chargeSource = 'NONE';
  }

  const railFailureFlags = calculateRailFailures(powerStateData.powerState);
  const railInRangeFlags = calculateRailInRange(powerStateData);
  const powerStatus = determinePowerStatus(powerStateData);

  return {
    systems: {
      POWER: {
        status: powerStatus,
        batteryVoltage: powerStateData.V_Battery ?? null,
        powerState: powerStateData.powerState ?? null,
        chargeSource: chargeSource,
        rails: {
          V_Rail_12V: powerStateData.V_Rail_12V,
          I_Rail_12V: powerStateData.I_Rail_12V,
          V_Rail_5V: powerStateData.V_Rail_5V,
          I_Rail_5V: powerStateData.I_Rail_5V,
          V_Rail_3V3: powerStateData.V_Rail_3V3,
          I_Rail_3V3: powerStateData.I_Rail_3V3,
          V_Charge_Input: powerStateData.V_Charge_Input,
          I_Charge_Input: powerStateData.I_Charge_Input,
          I_Battery: powerStateData.I_Battery,

          ...railFailureFlags,
          ...railInRangeFlags
        }
      }
    },
    timestamps: {
      lastPowerMessage: timestamp
    }
  };
};

export const processCoolingStateMessage = (coolingStateData, timestamp) => {
  if (!coolingStateData) return null;

  const coldSideTemp = coolingStateData.Temp_Bottom_Cool_Side ?? null;
  const hotSideTemp = coolingStateData.Temp_Hot_Side ?? null;
  const tempStatus = determineTemperatureStatus(coldSideTemp, hotSideTemp);

  return {
    systems: {
      TEMPERATURE: {
        status: tempStatus,
        coldSideTemp: coldSideTemp,
        hotSideTemp: hotSideTemp,
        tecs: {
          TopTEC: {
            TECVoltage: coolingStateData.TopTEC?.TECVoltage,
            TECCurrent: coolingStateData.TopTEC?.TECCurrent
          },
          BottomTEC: {
            TECVoltage: coolingStateData.BottomTEC?.TECVoltage,
            TECCurrent: coolingStateData.BottomTEC?.TECCurrent
          }
        },
        fan: {
          FanPWM: coolingStateData.fan?.FanPWM
        }
      }
    },
    timestamps: {
      lastCoolingMessage: timestamp
    }
  };
};

export const processExperimentStateMessage = (experimentStateData, timestamp) => {
  if (!experimentStateData) return null;

  const experimentStatus = determineExperimentStatus(experimentStateData);

  return {
    systems: {
      EXPERIMENT: {
        status: experimentStatus,
        chambers: [true, true, true, true, true, true], // All chambers ready
        sensors: experimentStateData.sensors || [],
        boardId: experimentStateData.boardId
      }
    },
    timestamps: {
      lastExperimentMessage: timestamp
    }
  };
};

export const processMessage = (data) => {
  if (!data) return null;

  const timestamp = Date.now();
  let result = {
    systems: {},
    statusFlags: null,
    derived: null,
    timestamps: {
      lastMessage: timestamp
    }
  };

  // Process SystemStatus messages
  if (data.SystemStatus) {
    const systemResult = processSystemStatusMessage(data.SystemStatus, timestamp);
    if (systemResult) {
      result.systems = { ...result.systems, ...systemResult.systems };
      result.statusFlags = systemResult.statusFlags;
      result.timestamps = { ...result.timestamps, ...systemResult.timestamps };
    }
  }

  // Process PowerState messages
  if (data.PowerState) {
    const powerResult = processPowerStateMessage(data.PowerState, timestamp);
    if (powerResult) {
      result.systems = { ...result.systems, ...powerResult.systems };
      result.timestamps = { ...result.timestamps, ...powerResult.timestamps };
    }
  }

  // Process CoolingState messages
  if (data.CoolingState) {
    const coolingResult = processCoolingStateMessage(data.CoolingState, timestamp);
    if (coolingResult) {
      result.systems = { ...result.systems, ...coolingResult.systems };
      result.timestamps = { ...result.timestamps, ...coolingResult.timestamps };
    }
  }

  // Process ExperimentState messages (note the typo in original: "ExperiementState")
  if (data.ExperiementState) {
    const experimentResult = processExperimentStateMessage(data.ExperiementState, timestamp);
    if (experimentResult) {
      result.systems = { ...result.systems, ...experimentResult.systems };
      result.timestamps = { ...result.timestamps, ...experimentResult.timestamps };
    }
  }

  return result;
};
