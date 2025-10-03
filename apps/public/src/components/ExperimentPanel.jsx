import { createSignal, createEffect, createMemo } from 'solid-js';
import styles from './ExperimentPanel.module.css';
import { useExperimentStatus, useTimestampsState } from '../hooks/useTelemetryState';
import { useTheme } from '../contexts/ThemeContext';
import Panel from './shared/Panel';
import Plot from './Plot';

function ExperimentPanel({ className }) {
  const scrollback = 100;

  const experimentData = useExperimentStatus();
  const timestamps = useTimestampsState();
  const { theme } = useTheme();

  // Create refs for all 6 channel plots
  const [c0PlotRef, setC0PlotRef] = createSignal(null);
  const [c1PlotRef, setC1PlotRef] = createSignal(null);
  const [c2PlotRef, setC2PlotRef] = createSignal(null);
  const [c3PlotRef, setC3PlotRef] = createSignal(null);
  const [c4PlotRef, setC4PlotRef] = createSignal(null);
  const [c5PlotRef, setC5PlotRef] = createSignal(null);

  // Track last seen data for each channel to prevent duplicate updates
  const [lastChannelData, setLastChannelData] = createSignal({
    c0: null, c1: null, c2: null, c3: null, c4: null, c5: null
  });

  // Helper function to convert hex to rgba
  const hexToRgba = (hex, alpha) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  // Series configuration for min/max plots (reactive)
  const channelSeries = createMemo(() => {
    const colors = theme().colors;
    return [
      {}, // Time axis
      {
        label: "Min",
        stroke: colors.warrBlue2,
        points: { show: false },
        width:1.0,
      },
      {
        label: "Max",
        stroke: colors.warrBlue1,
        points: { show: false },
        width:1.0,
      }
    ];
  });

  // Bands configuration - fill between min and max (reactive)
  const bandsConfig = createMemo(() => {
    const colors = theme().colors;
    return [
      {
        series: [1, 2], // Fill between Min (series 1) and Max (series 2)
        dir: 1,
        fill: hexToRgba(colors.warrBlue1, 0.5)
      }
    ];
  });

  // Axes configuration (reactive)
  const axesConfig = createMemo(() => {
    const colors = theme().colors;
    return [
      {
        show: true,
        stroke: 'transparent',
        grid: { show: true },
        ticks: { show: false },
        size: 0
      },
      {
        show: true,
        stroke: colors.text,
        grid: { show: true, stroke: colors.grid },
        ticks: { show: true, stroke: colors.text },
        size: 35,
        gap: 3,
        labelSize: 9,
        font: "9px system-ui",
        values: (_, vals) => {
          // Dynamically choose V or mV based on the range of values
          const maxVal = Math.max(...vals.map(Math.abs));

          if (maxVal < 0.1) {
            // Use mV for small values (< 100mV)
            return vals.map(v => (v * 1000).toFixed(0) + 'mV');
          } else {
            // Use V for larger values
            return vals.map(v => v.toFixed(2) + 'V');
          }
        }
      }
    ];
  });

  // Real-time data updates
  createEffect(() => {
    const data = experimentData();
    if (!data || !data.channels) return;

    const channels = data.channels;
    const lastData = lastChannelData();

    // Use the lastExperimentMessage timestamp, not messageTimestamp
    // This ensures we use the timestamp from EXP messages only, not from other system messages
    const ts = timestamps();
    if (!ts || !ts.lastExperimentMessage) return;
    const timestamp = ts.lastExperimentMessage / 1000;

    // Update each channel plot
    const plotRefs = [
      { ref: c0PlotRef, channel: channels.c0, name: 'c0' },
      { ref: c1PlotRef, channel: channels.c1, name: 'c1' },
      { ref: c2PlotRef, channel: channels.c2, name: 'c2' },
      { ref: c3PlotRef, channel: channels.c3, name: 'c3' },
      { ref: c4PlotRef, channel: channels.c4, name: 'c4' },
      { ref: c5PlotRef, channel: channels.c5, name: 'c5' }
    ];

    const newLastData = { ...lastData };
    let hasUpdate = false;

    plotRefs.forEach(({ ref, channel, name }) => {
      const plotRef = ref();
      if (plotRef && plotRef.addDataPoint && channel) {
        // Check if this channel's data has actually changed
        const lastChannel = lastData[name];
        const hasChanged = !lastChannel ||
          lastChannel.min !== channel.min ||
          lastChannel.max !== channel.max;

        if (hasChanged) {
          plotRef.addDataPoint(timestamp, channel.min, channel.max);
          newLastData[name] = { min: channel.min, max: channel.max };
          hasUpdate = true;
        }
      }
    });

    // Update last seen data if any channel changed
    if (hasUpdate) {
      setLastChannelData(newLastData);
    }
  });

  return (
    <Panel
      title="Experiment Channels"
      className={className}
      contentClass={styles.contentSection}
    >
      <div class={styles.channelsGrid}>
        <div class={styles.channelSection}>
          <h4 class={styles.channelTitle}>Channel 0</h4>
          <div class={styles.plotWrapper}>
            <Plot
              multiSeries={true}
              series={channelSeries()}
              axes={axesConfig()}
              bands={bandsConfig()}
              scales={{
                x: { time: true },
                y: { auto: true }
              }}
              maxPoints={scrollback}
              ref={setC0PlotRef}
            />
          </div>
        </div>

        <div class={styles.channelSection}>
          <h4 class={styles.channelTitle}>Channel 1</h4>
          <div class={styles.plotWrapper}>
            <Plot
              multiSeries={true}
              series={channelSeries()}
              axes={axesConfig()}
              bands={bandsConfig()}
              scales={{
                x: { time: true },
                y: { auto: true }
              }}
              maxPoints={scrollback}
              ref={setC1PlotRef}
            />
          </div>
        </div>

        <div class={styles.channelSection}>
          <h4 class={styles.channelTitle}>Channel 2</h4>
          <div class={styles.plotWrapper}>
            <Plot
              multiSeries={true}
              series={channelSeries()}
              axes={axesConfig()}
              bands={bandsConfig()}
              scales={{
                x: { time: true },
                y: { auto: true }
              }}
              maxPoints={scrollback}
              ref={setC2PlotRef}
            />
          </div>
        </div>

        <div class={styles.channelSection}>
          <h4 class={styles.channelTitle}>Channel 3</h4>
          <div class={styles.plotWrapper}>
            <Plot
              multiSeries={true}
              series={channelSeries()}
              axes={axesConfig()}
              bands={bandsConfig()}
              scales={{
                x: { time: true },
                y: { auto: true }
              }}
              maxPoints={scrollback}
              ref={setC3PlotRef}
            />
          </div>
        </div>

        <div class={styles.channelSection}>
          <h4 class={styles.channelTitle}>Channel 4</h4>
          <div class={styles.plotWrapper}>
            <Plot
              multiSeries={true}
              series={channelSeries()}
              axes={axesConfig()}
              bands={bandsConfig()}
              scales={{
                x: { time: true },
                y: { auto: true }
              }}
              maxPoints={scrollback}
              ref={setC4PlotRef}
            />
          </div>
        </div>

        <div class={styles.channelSection}>
          <h4 class={styles.channelTitle}>Channel 5</h4>
          <div class={styles.plotWrapper}>
            <Plot
              multiSeries={true}
              series={channelSeries()}
              axes={axesConfig()}
              bands={bandsConfig()}
              scales={{
                x: { time: true },
                y: { auto: true }
              }}
              maxPoints={scrollback}
              ref={setC5PlotRef}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default ExperimentPanel;
