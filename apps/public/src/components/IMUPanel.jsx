import { createSignal, createEffect } from 'solid-js';
import styles from './IMUPanel.module.css';
import { useIMUStatus } from '../hooks/useTelemetryState';
import Panel from './shared/Panel';
import Plot from './Plot';

function IMUPanel({ className }) {
  const imuData = useIMUStatus();
  const [accelPlotRef, setAccelPlotRef] = createSignal(null);
  const [gyroPlotRef, setGyroPlotRef] = createSignal(null);
  const [magPlotRef, setMagPlotRef] = createSignal(null);

  // Color scheme for X, Y, Z axes
  const axisColors = {
    x: '#ff4444',  // Red
    y: '#44ff44',  // Green
    z: '#4444ff'   // Blue
  };

  // Accelerometer plot configuration
  const accelSeries = [
    {}, // Time axis
    { label: "X", stroke: axisColors.x, width: 2 },
    { label: "Y", stroke: axisColors.y, width: 2 },
    { label: "Z", stroke: axisColors.z, width: 2 }
  ];

  // Gyroscope plot configuration
  const gyroSeries = [
    {}, // Time axis
    { label: "X", stroke: axisColors.x, width: 2 },
    { label: "Y", stroke: axisColors.y, width: 2 },
    { label: "Z", stroke: axisColors.z, width: 2 }
  ];

  // Magnetometer plot configuration
  const magSeries = [
    {}, // Time axis
    { label: "X", stroke: axisColors.x, width: 2 },
    { label: "Y", stroke: axisColors.y, width: 2 },
    { label: "Z", stroke: axisColors.z, width: 2 }
  ];

  // Common axes configuration for all plots
  const createAxes = (unit) => [
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
      stroke: "#ffffff",
      grid: { show: true, stroke: "#444444" },
      ticks: { show: true, stroke: "#ffffff" },
      size: 60,
      gap: 8,
      labelSize: 12,
      font: "12px system-ui"
    }
  ];

  // Real-time data updates
  createEffect(() => {
    const data = imuData();
    const accelRef = accelPlotRef();
    const gyroRef = gyroPlotRef();
    const magRef = magPlotRef();

    if (data) {
      const timestamp = Date.now() / 1000;

      // Update accelerometer plot
      if (accelRef && accelRef.addDataPoint && data.accelerometer) {
        accelRef.addDataPoint(
          timestamp,
          data.accelerometer.x,
          data.accelerometer.y,
          data.accelerometer.z
        );
      }

      // Update gyroscope plot
      if (gyroRef && gyroRef.addDataPoint && data.gyroscope) {
        gyroRef.addDataPoint(
          timestamp,
          data.gyroscope.x,
          data.gyroscope.y,
          data.gyroscope.z
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
          <h4 class={styles.plotTitle}>Accelerometer (m/s²)</h4>
          <div class={styles.plotWrapper}>
            <Plot
              multiSeries={true}
              series={accelSeries}
              axes={createAxes("")}
              scales={{
                x: { time: true },
                y: { auto: true }
              }}
              maxPoints={50}
              ref={setAccelPlotRef}
            />
          </div>
        </div>

        <div class={styles.plotSection}>
          <h4 class={styles.plotTitle}>Gyroscope (rad/s)</h4>
          <div class={styles.plotWrapper}>
            <Plot
              multiSeries={true}
              series={gyroSeries}
              axes={createAxes("")}
              scales={{
                x: { time: true },
                y: { auto: true }
              }}
              maxPoints={50}
              ref={setGyroPlotRef}
            />
          </div>
        </div>

        <div class={styles.plotSection}>
          <h4 class={styles.plotTitle}>Magnetometer (µT)</h4>
          <div class={styles.plotWrapper}>
            <Plot
              multiSeries={true}
              series={magSeries}
              axes={createAxes("")}
              scales={{
                x: { time: true },
                y: { auto: true }
              }}
              maxPoints={50}
              ref={setMagPlotRef}
            />
          </div>
        </div>
      </div>
    </Panel>
  );
}

export default IMUPanel;