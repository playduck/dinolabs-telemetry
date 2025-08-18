import { onMount, onCleanup } from 'solid-js';
import telemetryService from '../../services/TelemetryService';

export function useTelemetrySubscription(subscriptions) {
  const unsubscribeFunctions = [];

  onMount(() => {
    subscriptions.forEach(({ event, callback }) => {
      const unsubscribe = telemetryService.subscribe(event, callback);
      unsubscribeFunctions.push(unsubscribe);
    });
  });

  onCleanup(() => {
    unsubscribeFunctions.forEach(unsubscribe => {
      if (unsubscribe) unsubscribe();
    });
  });

  return {
    getConnectionStatus: () => telemetryService.getConnectionStatus()
  };
}