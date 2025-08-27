// Shared utilities for system status components

export const SYSTEM_MODES = {
  ARMED: 'ARMED/READY',
  FLIGHT: 'FLIGHT',
  ERROR: 'ERROR', 
  UNDEFINED: 'UNDEFINED'
};

export const getStatusClass = (status, styles) => {
  switch (status.toUpperCase()) {
    case 'NOMINAL': return `${styles.status} ${styles.statusOnline} `;
    case 'ERROR': return `${styles.status} ${styles.statusError} `;
    case 'UNKNOWN': return `${styles.status} ${styles.statusError} `;
    case 'COLD': return `${styles.status} ${styles.statusError} `;
    case 'HOT': return `${styles.status} ${styles.statusError} `;
    case 'OVERHEAT': return `${styles.status} ${styles.statusError} `;
    default: return `${styles.status} ${styles.statusOffline} `;
  }
};

export const getModeClass = (mode, styles) => {
  switch (mode) {
    case SYSTEM_MODES.ERROR: return `${styles.modeValue} ${styles.modeError}`;
    case SYSTEM_MODES.ARMED: return `${styles.modeValue} ${styles.modeArmed}`;
    case SYSTEM_MODES.FLIGHT: return `${styles.modeValue} ${styles.modeFlight}`;
    default: return styles.modeValue;
  }
};

export const getModeDisplay = (mode, systemModeCode) => {
  if (mode === SYSTEM_MODES.UNDEFINED && typeof systemModeCode === 'number') {
    return `${mode} (0x${systemModeCode.toString(16).toUpperCase()})`;
  }
  return mode;
};

export const isErrorState = (status) => {
  // Only NOMINAL is considered a non-error state, everything else is an error
  return status.toUpperCase() !== 'NOMINAL';
};