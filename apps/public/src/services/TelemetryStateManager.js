import { createSignal } from 'solid-js';
import telemetryService from './TelemetryService.js';
import {
  parseSystemStatus,
  determineTemperatureStatus,
  determinePowerStatus,
  determineExperimentStatus,
  calculateDerivedValues,
  createOfflineState
} from './TelemetryBusinessLogic.js';

class TelemetryStateManager {
  constructor() {
    this.subscribers = new Map();
    this.lastMessageTime = null;
    this.timeoutInterval = null;
    this.unsubscribeMessage = null;

    // Initialize the centralized state
    const [state, setState] = createSignal({
      systems: {
        SYSTEM: { status: 'OFFLINE', mode: 'STANDBY', rawModeCode: null },
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

    this.setState(prevState => {
      const newState = { ...prevState };
      newState.timestamps = { ...prevState.timestamps, lastMessage: now };

      // Process SystemStatus messages
      if (data.SystemStatus) {
        const systemData = parseSystemStatus(data.SystemStatus);
        if (systemData) {
          newState.systems = { ...prevState.systems };
          newState.systems.SYSTEM = systemData.SYSTEM;

          // Update subsystem statuses based on status flags
          newState.systems.EXPERIMENT = {
            ...prevState.systems.EXPERIMENT,
            status: systemData.statusFlags.expOffline ? 'OFFLINE' : prevState.systems.EXPERIMENT.status
          };
          newState.systems.TEMPERATURE = {
            ...prevState.systems.TEMPERATURE,
            status: systemData.statusFlags.tempOffline ? 'OFFLINE' : prevState.systems.TEMPERATURE.status
          };
          newState.systems.POWER = {
            ...prevState.systems.POWER,
            status: systemData.statusFlags.powerOffline ? 'OFFLINE' : prevState.systems.POWER.status
          };

          newState.timestamps.lastSystemMessage = now;
        }
      }

      // Process PowerState messages
      if (data.PowerState) {
        newState.systems = { ...prevState.systems };
        const powerStatus = determinePowerStatus(data.PowerState);
        newState.systems.POWER = {
          status: powerStatus,
          batteryVoltage: data.PowerState.V_Battery ?? null,
          powerState: data.PowerState.powerState ?? null,
          rails: {
            V_Rail_12V: data.PowerState.V_Rail_12V,
            I_Rail_12V: data.PowerState.I_Rail_12V,
            V_Rail_5V: data.PowerState.V_Rail_5V,
            I_Rail_5V: data.PowerState.I_Rail_5V,
            V_Rail_3V3: data.PowerState.V_Rail_3V3,
            I_Rail_3V3: data.PowerState.I_Rail_3V3,
            V_Charge_Input: data.PowerState.V_Charge_Input,
            I_Charge_Battery: data.PowerState.I_Charge_Battery,
            I_Battery: data.PowerState.I_Battery
          }
        };
        newState.timestamps.lastPowerMessage = now;
      }

      // Process CoolingState messages
      if (data.CoolingState) {
        newState.systems = { ...prevState.systems };
        const coldSideTemp = data.CoolingState.Temp_Bottom_Cool_Side ?? null;
        const hotSideTemp = data.CoolingState.Temp_Hot_Side ?? null;

        const tempStatus = determineTemperatureStatus(coldSideTemp, hotSideTemp);

        newState.systems.TEMPERATURE = {
          status: tempStatus,
          coldSideTemp: coldSideTemp,
          hotSideTemp: hotSideTemp,
          tecs: {
            TopTEC: {
              TECVoltage: data.CoolingState.TopTEC?.TECVoltage,
              TECCurrent: data.CoolingState.TopTEC?.TECCurrent
            },
            BottomTEC: {
              TECVoltage: data.CoolingState.BottomTEC?.TECVoltage,
              TECCurrent: data.CoolingState.BottomTEC?.TECCurrent
            }
          },
          fan: {
            FanPWM: data.CoolingState.fan?.FanPWM
          }
        };
        newState.timestamps.lastCoolingMessage = now;
      }

      // Process ExperimentState messages
      if (data.ExperiementState) {
        newState.systems = { ...prevState.systems };
        const experimentStatus = determineExperimentStatus(data.ExperiementState);
        newState.systems.EXPERIMENT = {
          status: experimentStatus,
          chambers: [true, true, true, true, true, true], // All chambers ready
          sensors: data.ExperiementState.sensors || [],
          boardId: data.ExperiementState.boardId
        };
        newState.timestamps.lastExperimentMessage = now;
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
