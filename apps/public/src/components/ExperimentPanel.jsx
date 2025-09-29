import { createMemo } from 'solid-js';
import styles from './ExperimentPanel.module.css';
import commonStyles from './shared/common.module.css';
import Panel from './shared/Panel';

function ExperimentPanel({ className }) {
  // Placeholder data - will be connected to telemetry service later
  const experimentData = createMemo(() => ({
    channels: [
      { id: 1, value: null },
      { id: 2, value: null },
      { id: 3, value: null },
      { id: 4, value: null },
      { id: 5, value: null },
      { id: 6, value: null },
    ],
  }));

  return (
    <Panel
      title="Experiment Channels"
      className={className}
      contentClass={styles.contentSection}
    >
      <div class={styles.channelsGrid}>
        {experimentData().channels.map((channel) => (
          <div class={styles.channelSection}>
            <h4 class={styles.channelTitle}>Channel {channel.id}</h4>
            <div class={styles.plotPlaceholder}>
              <span class={commonStyles.monospaceText}>Plot area</span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default ExperimentPanel;