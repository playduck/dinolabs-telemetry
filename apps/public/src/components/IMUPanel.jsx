import { createSignal, createEffect } from 'solid-js';
import styles from './IMUPanel.module.css';
import { useIMUStatus, useTimestampsState } from '../hooks/useTelemetryState';
import { useTheme } from '../contexts/ThemeContext';
import Panel from './shared/Panel';
import Plot from './Plot';

function IMUPanel({ className }) {
  const scrollback = 100;

  const imuData = useIMUStatus();
  const timestamps = useTimestampsState();
  const { theme } = useTheme();
  const [accelPlotRef, setAccelPlotRef] = createSignal(null);
  const [magPlotRef, setMagPlotRef] = createSignal(null);

  // Track last seen IMU data to prevent duplicate updates
  const [lastImuData, setLastImuData] = createSignal(null);

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
      { label: "X", stroke: colors.x, width: 1.0, points: { show: false } },
      { label: "Y", stroke: colors.y, width: 1.0, points: { show: false } },
      { label: "Z", stroke: colors.z, width: 1.0, points: { show: false } }
    ];
  };

  // Magnetometer plot configuration
  const magSeries = () => {
    const colors = axisColors();
    return [
      {}, // Time axis
      { label: "X", stroke: colors.x, width: 1.0, points: { show: false } },
      { label: "Y", stroke: colors.y, width: 1.0, points: { show: false } },
      { label: "Z", stroke: colors.z, width: 1.0, points: { show: false } }
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
    if (!data) return;

    const accelRef = accelPlotRef();
    const magRef = magPlotRef();
    const lastData = lastImuData();

    // Check if IMU data has actually changed
    const accelChanged = !lastData ||
      !lastData.accelerometer ||
      lastData.accelerometer.x !== data.accelerometer?.x ||
      lastData.accelerometer.y !== data.accelerometer?.y ||
      lastData.accelerometer.z !== data.accelerometer?.z;

    const magChanged = !lastData ||
      !lastData.magnetometer ||
      lastData.magnetometer.x !== data.magnetometer?.x ||
      lastData.magnetometer.y !== data.magnetometer?.y ||
      lastData.magnetometer.z !== data.magnetometer?.z;

    // Only update if data has changed
    if (accelChanged || magChanged) {
      // Use the lastExperimentMessage timestamp (EXPIMU messages update this)
      const ts = timestamps();
      if (!ts || !ts.lastExperimentMessage) return;
      const timestamp = ts.lastExperimentMessage / 1000;

      // Update accelerometer plot if data changed
      if (accelChanged && accelRef && accelRef.addDataPoint && data.accelerometer) {
        accelRef.addDataPoint(
          timestamp,
          data.accelerometer.x,
          data.accelerometer.y,
          data.accelerometer.z
        );
      }

      // Update magnetometer plot if data changed
      if (magChanged && magRef && magRef.addDataPoint && data.magnetometer) {
        magRef.addDataPoint(
          timestamp,
          data.magnetometer.x,
          data.magnetometer.y,
          data.magnetometer.z
        );
      }

      // Update last seen data
      setLastImuData({
        accelerometer: data.accelerometer ? { ...data.accelerometer } : null,
        magnetometer: data.magnetometer ? { ...data.magnetometer } : null
      });
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
              maxPoints={scrollback}
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
              maxPoints={scrollback}
              ref={setMagPlotRef}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default IMUPanel;
