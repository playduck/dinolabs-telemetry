// Business logic for telemetry data processing and status determination

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

export const determinePowerStatus = (powerData) => {
  // TODO: Implement power system status determination
  // Add logic for battery voltage ranges, rail voltages, etc.
  return 'NOMINAL';
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

// Helper function to create offline state structure
export const createOfflineState = () => ({
  systems: {
    SYSTEM: { status: 'OFFLINE', mode: 'OFFLINE', rawModeCode: null },
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
