import { createSignal, onMount } from 'solid-js';
import styles from './Header.module.css';
import { useTelemetrySubscription } from './shared/useTelemetrySubscription';

function Header() {
  const [connectionStatus, setConnectionStatus] = createSignal({ connected: false, rtt: null });
  const [badMessageCount, setBadMessageCount] = createSignal(0);
  const [badMessageFlash, setBadMessageFlash] = createSignal(false);

  const { getConnectionStatus } = useTelemetrySubscription([
    {
      event: 'connection',
      callback: (data) => setConnectionStatus(data)
    },
    {
      event: 'rtt',
      callback: (data) => setConnectionStatus(prev => ({ ...prev, rtt: data.rtt }))
    },
    {
      event: 'bad-message',
      callback: () => {
        setBadMessageCount(prev => prev + 1);
        setBadMessageFlash(true);
        setTimeout(() => setBadMessageFlash(false), 2000);
      }
    }
  ]);

  onMount(() => {
    // Get initial connection status
    setConnectionStatus(getConnectionStatus());
  });

  const formatRtt = () => {
    const status = connectionStatus();
    if (!status.connected) {
      return '--';
    }
    if (status.rtt === null) {
      return '...';
    }
    const rttMs = Math.round(status.rtt);
    return rttMs.toString().padStart(5, ' ');
  };

  const getConnectionClass = () => {
    const status = connectionStatus();
    if (!status.connected) {
      return `${styles.infoValue} ${styles.connection} ${styles.connectionDisconnected}`;
    }
    if (status.rtt === null) {
      return `${styles.infoValue} ${styles.connection} ${styles.connectionMeasuring}`;
    }
    return `${styles.infoValue} ${styles.connection} ${styles.connectionConnected}`;
  };



  const getBadMessageClass = () => {
    return badMessageFlash()
      ? `${styles.infoValue} ${styles.badMessages} ${styles.badMessagesFlash}`
      : `${styles.infoValue} ${styles.badMessages}`;
  };
  return (
    <header class={styles.header}>
      <h1 class={styles.name}>
        <svg class={styles.logo} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 45.7">
          <defs><style>.g{'{fill:var(--color-text);}.g,.h,.i{stroke-width:0px;}.h{fill:var(--color-text);}.i{fill:var(--color-text);}'}</style></defs><g
            id="c"><path class="g"
              d="m23-.4L.2,22.3l22.8,22.8,22.8-22.8L23-.4Zm0,38.8L6.9,22.3,23,6.2l16,16.1-16,16.1Z" /><polygon
              class="i"
              points="33.8 -.4 56.6 22.3 33.8 45.1 30.5 41.7 49.9 22.3 30.5 2.9 33.8 -.4" /><polygon
              class="i" points="23 10.4 26.3 13.7 17.7 22.3 26.3 30.9 23 34.2 11 22.3 23 10.4" /><polygon
              class="h"
              points="28.4 15.8 31.7 19.1 28.6 22.3 31.7 25.5 28.4 28.8 21.9 22.3 28.4 15.8" /><polygon
              class="h" points="44.6 -.4 67.4 22.3 44.6 45.1 41.3 41.7 60.7 22.3 41.3 2.9 44.6 -.4" /></g>
        </svg>
        <span class={styles.nameText}>

        </span>
      </h1>
      <span class={styles.demoMode} style="display: none;">
        <h1>DEMO MODE</h1>
        <span>displaying dummy data</span>
      </span>
      <div class={styles.spacer}></div>
      <div class={styles.info}>
        <div>
          <label>WS RTT</label>
          <span id="connection" class={getConnectionClass()}>{formatRtt()}</span>
        </div>
        <div>
          <label>Bad Rx</label>
          <span id="bad-messages" class={getBadMessageClass()}>{badMessageCount()}</span>
        </div>
      </div>
    </header>
  );
}

export default Header;
