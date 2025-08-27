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

    // Initialize the centralized state
    const [state, setState] = createSignal({
      systems: {
        SYSTEM: { status: 'OFFLINE', mode: 'STANDBY', rawModeCode: null, cpuUsage: null, storageCapacity: null },
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

      // Update systems
      newState.systems = { ...prevState.systems };
      Object.keys(processedData.systems).forEach(systemKey => {
        newState.systems[systemKey] = {
          ...prevState.systems[systemKey],
          ...processedData.systems[systemKey]
        };
      });

      // Handle status flags from SystemStatus messages
      if (processedData.statusFlags) {
        // Update subsystem statuses based on status flags
        newState.systems.EXPERIMENT = {
          ...newState.systems.EXPERIMENT,
          status: processedData.statusFlags.expOffline ? 'OFFLINE' : newState.systems.EXPERIMENT.status
        };
        newState.systems.TEMPERATURE = {
          ...newState.systems.TEMPERATURE,
          status: processedData.statusFlags.tempOffline ? 'OFFLINE' : newState.systems.TEMPERATURE.status
        };
        newState.systems.POWER = {
          ...newState.systems.POWER,
          status: processedData.statusFlags.powerOffline ? 'OFFLINE' : newState.systems.POWER.status
        };
      }

      // Calculate derived values
      newState.derived = calculateDerivedValues(data, prevState.derived);

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
