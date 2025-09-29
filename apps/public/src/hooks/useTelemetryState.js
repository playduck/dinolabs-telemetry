import { createSignal, onMount, onCleanup } from 'solid-js';
import telemetryStateManager from '../services/TelemetryStateManager.js';

export function useTelemetryState(selector) {
  // Initialize with current state
  const initialState = selector ? selector(telemetryStateManager.getState()) : telemetryStateManager.getState();
  const [state, setState] = createSignal(initialState);
  
  let unsubscribe;

  onMount(() => {
    // Subscribe to state updates
    unsubscribe = telemetryStateManager.subscribe('state-update', (newState) => {
      const selectedState = selector ? selector(newState) : newState;
      setState(selectedState);
    });

    // Initialize the telemetry state manager if not already done
    // This ensures it starts listening to telemetry messages
    if (!telemetryStateManager.unsubscribeMessage) {
      telemetryStateManager.init();
    }
  });

  onCleanup(() => {
    if (unsubscribe) {
      unsubscribe();
    }
  });

  return state;
}

// Convenience hooks for common state selections
export function useSystemsState() {
  return useTelemetryState(state => state.systems);
}

export function useSystemState(systemName) {
  return useTelemetryState(state => state.systems[systemName]);
}

export function useDerivedState() {
  return useTelemetryState(state => state.derived);
}

export function useTimestampsState() {
  return useTelemetryState(state => state.timestamps);
}

// Hook to get a specific system's data
export function useSystemStatus() {
  return useSystemState('SYSTEM');
}

export function useExperimentStatus() {
  return useSystemState('EXPERIMENT');
}

export function useTemperatureStatus() {
  return useSystemState('TEMPERATURE');
}

export function usePowerStatus() {
  return useSystemState('POWER');
}

export function useCoolingStatus() {
  return useSystemState('COOLING');
}

export function useIMUStatus() {
  return useSystemState('IMU');
}