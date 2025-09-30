import { createSignal } from 'solid-js';
import telemetryService from './TelemetryService.js';
import {
  processMessage,
  calculateDerivedValues,
  createOfflineState
} from './TelemetryDataProcessor.js';

class TelemetryStateManager {
  constructor() {
    this.subscribers = new Map();
    this.lastMessageTime = null;
    this.timeoutInterval = null;
    this.unsubscribeMessage = null;

    // Initialize the centralized state with support for new TLM format
    const [state, setState] = createSignal({
      systems: {
        SYSTEM: {
          status: 'OFFLINE',
          mode: 'STANDBY',
          rawModeCode: null,
          cpuUsage: null,
          storageCapacity: null,
          soc: null, // State of charge
          epoch: null,
          extFanPwm: null,
          chargeVoltage: null,
          ledStates: [false, false, false, false, false, false],
          fcsState: null
        },
        EXPERIMENT: {
          status: 'OFFLINE',
          channels: {}, // EXP1/EXP2 channel data
          imu: null // EXP_IMU data
        },
        TEMPERATURE: {
          status: 'OFFLINE',
          coldSideTemp: null,
          hotSideTemp: null,
          tecVoltage: null,
          tecCurrent: null,
          fanPwm: null,
          statsBytes: null
        },
        POWER: {
          status: 'OFFLINE',
          batteryVoltage: null,
          batteryCurrent: null,
          powerState: null,
          statusByte: null,
          rails: {}
        },
        COOLING: {
          status: 'OFFLINE',
          tecs: {},
          fan: {}
        }
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
        lastExperimentMessage: null,
        messageTimestamp: null  // Server timestamp for current message (for plotting)
      }
    });

    this.state = state;
    this.setState = setState;
  }

  init() {
    // Subscribe to telemetry messages
    this.unsubscribeMessage = telemetryService.subscribe('message', (data) => {
      this.processMessage(data);
    });

    // Start timeout checking
    this.timeoutInterval = setInterval(() => {
      this.checkMessageTimeout();
    }, 1000);
  }

  processMessage(data) {
    if (!data) return;

    const now = Date.now();
    this.lastMessageTime = now;

    // Process the message using the data processor
    const processedData = processMessage(data);
    if (!processedData) return;

    this.setState(prevState => {
      const newState = { ...prevState };

      // Update timestamps
      newState.timestamps = { ...prevState.timestamps, ...processedData.timestamps };

      // Update systems - deep merge for new TLM format
      newState.systems = { ...prevState.systems };
      Object.keys(processedData.systems).forEach(systemKey => {
        if (systemKey === 'EXPERIMENT' && processedData.systems[systemKey].channels) {
          // Special handling for experiment channels - merge instead of replace
          newState.systems[systemKey] = {
            ...prevState.systems[systemKey],
            ...processedData.systems[systemKey],
            channels: {
              ...prevState.systems[systemKey].channels,
              ...processedData.systems[systemKey].channels
            }
          };
        } else {
          // Standard merge for other systems
          newState.systems[systemKey] = {
            ...prevState.systems[systemKey],
            ...processedData.systems[systemKey]
          };
        }
      });

      // Calculate and merge derived values
      const derivedValues = calculateDerivedValues(data, prevState.derived);
      if (processedData.derived) {
        newState.derived = { ...derivedValues, ...processedData.derived };
      } else {
        newState.derived = derivedValues;
      }

      return newState;
    });

    // Notify subscribers
    this.notifySubscribers('state-update', this.state());
  }


  checkMessageTimeout() {
    if (this.lastMessageTime && (Date.now() - this.lastMessageTime) > 5000) {
      // No message for 5 seconds - mark all systems as offline
      this.setState(createOfflineState());
      this.notifySubscribers('state-update', this.state());
      console.log('Telemetry timeout - marked systems as offline');
    }
  }

  subscribe(event, callback) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event).add(callback);

    // Return unsubscribe function
    return () => {
      const eventSubscribers = this.subscribers.get(event);
      if (eventSubscribers) {
        eventSubscribers.delete(callback);
      }
    };
  }

  notifySubscribers(event, data) {
    const eventSubscribers = this.subscribers.get(event);
    if (eventSubscribers) {
      eventSubscribers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in state subscriber callback:', error);
        }
      });
    }
  }

  getState() {
    return this.state();
  }

  destroy() {
    if (this.unsubscribeMessage) {
      this.unsubscribeMessage();
    }
    if (this.timeoutInterval) {
      clearInterval(this.timeoutInterval);
    }
    this.subscribers.clear();
  }
}

// Create singleton instance
const telemetryStateManager = new TelemetryStateManager();

export default telemetryStateManager;
