import { createSignal, createEffect } from 'solid-js';
import styles from './IMUPanel.module.css';
import { useIMUStatus, useTimestampsState } from '../hooks/useTelemetryState';
import { useTheme } from '../contexts/ThemeContext';
import Panel from './shared/Panel';
import Plot from './Plot';

function IMUPanel({ className }) {
  const imuData = useIMUStatus();
  const timestamps = useTimestampsState();
  const { theme } = useTheme();
  const [accelPlotRef, setAccelPlotRef] = createSignal(null);
  const [magPlotRef, setMagPlotRef] = createSignal(null);

  // Color scheme for X, Y, Z axes using theme colors
  const axisColors = () => ({
    x: theme().colors.warrRed,     // Red
    y: theme().colors.warrGreen,   // Green
    z: theme().colors.warrBlue1    // Blue
  });

  // Accelerometer plot configuration
  const accelSeries = () => {
    const colors = axisColors();
    return [
      {}, // Time axis
      { label: "X", stroke: colors.x, width: 2 },
      { label: "Y", stroke: colors.y, width: 2 },
      { label: "Z", stroke: colors.z, width: 2 }
    ];
  };

  // Magnetometer plot configuration
  const magSeries = () => {
    const colors = axisColors();
    return [
      {}, // Time axis
      { label: "X", stroke: colors.x, width: 2 },
      { label: "Y", stroke: colors.y, width: 2 },
      { label: "Z", stroke: colors.z, width: 2 }
    ];
  };

  // Common axes configuration for all plots
  const createAxes = (unit) => {
    const colors = theme().colors;
    return [
      {
        show: true,
        stroke: 'transparent',
        grid: { show: true },
        ticks: { show: true },
        size: 0
      },
      {
        show: true,
        values: (_, vals) => vals.map(v => v.toFixed(1) + unit),
        stroke: colors.text,
        grid: { show: true, stroke: colors.grid },
        ticks: { show: true, stroke: colors.text },
        size: 60,
        gap: 8,
        labelSize: 12,
        font: "12px system-ui"
      }
    ];
  };

  // Real-time data updates
  createEffect(() => {
    const data = imuData();
    const ts = timestamps();
    const accelRef = accelPlotRef();
    const magRef = magPlotRef();

    if (data && ts && ts.messageTimestamp) {
      // Use server timestamp (when data was received) in seconds, not client time
      const timestamp = ts.messageTimestamp / 1000;

      // Update accelerometer plot
      if (accelRef && accelRef.addDataPoint && data.accelerometer) {
        accelRef.addDataPoint(
          timestamp,
          data.accelerometer.x,
          data.accelerometer.y,
          data.accelerometer.z
        );
      }

      // Update magnetometer plot
      if (magRef && magRef.addDataPoint && data.magnetometer) {
        magRef.addDataPoint(
          timestamp,
          data.magnetometer.x,
          data.magnetometer.y,
          data.magnetometer.z
        );
      }
    }
  });

  return (
    <Panel
      title="IMU Sensor Data"
      className={className}
      contentClass={styles.contentSection}
    >
      <div class={styles.plotsContainer}>
        <div class={styles.plotSection}>
          <h4 class={styles.plotTitle}>Accelerometer (g)</h4>
          <div class={styles.plotWrapper}>
            <Plot
              multiSeries={true}
              series={accelSeries()}
              axes={createAxes("")}
              scales={{
                x: { time: true },
                y: { auto: true }
              }}
              maxPoints={200}
              ref={setAccelPlotRef}
            />
          </div>
        </div>

        <div class={styles.plotSection}>
          <h4 class={styles.plotTitle}>Magnetometer (Gauss)</h4>
          <div class={styles.plotWrapper}>
            <Plot
              multiSeries={true}
              series={magSeries()}
              axes={createAxes("")}
              scales={{
                x: { time: true },
                y: { auto: true }
              }}
              maxPoints={200}
              ref={setMagPlotRef}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default IMUPanel;
