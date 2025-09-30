import { createSignal, createEffect, createMemo } from 'solid-js';
import styles from './ExperimentPanel.module.css';
import { useExperimentStatus, useTimestampsState } from '../hooks/useTelemetryState';
import { useTheme } from '../contexts/ThemeContext';
import Panel from './shared/Panel';
import Plot from './Plot';

function ExperimentPanel({ className }) {
  const scrollback = 300;

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
        points: { show: false }
      },
      {
        label: "Max",
        stroke: colors.warrBlue1,
        points: { show: false }
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
    const ts = timestamps();
    if (!data || !data.channels || !ts || !ts.messageTimestamp) return;

    // Use server timestamp (when data was received) in seconds, not client time
    const timestamp = ts.messageTimestamp / 1000;
    const channels = data.channels;

    // Update each channel plot
    const plotRefs = [
      { ref: c0PlotRef, channel: channels.c0 },
      { ref: c1PlotRef, channel: channels.c1 },
      { ref: c2PlotRef, channel: channels.c2 },
      { ref: c3PlotRef, channel: channels.c3 },
      { ref: c4PlotRef, channel: channels.c4 },
      { ref: c5PlotRef, channel: channels.c5 }
    ];

    plotRefs.forEach(({ ref, channel }) => {
      const plotRef = ref();
      if (plotRef && plotRef.addDataPoint && channel) {
        plotRef.addDataPoint(timestamp, channel.min, channel.max);
      }
    });
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
