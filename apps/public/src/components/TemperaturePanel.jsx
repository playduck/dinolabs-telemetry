import { createSignal, onMount, onCleanup, createEffect, createMemo } from 'solid-js';
import styles from './TemperaturePanel.module.css';
import commonStyles from './shared/common.module.css';
import { useTemperatureStatus } from '../hooks/useTelemetryState';
import ValueDisplay from './shared/ValueDisplay';
import Panel from './shared/Panel';

function TemperaturePanel({ className }) {
  const temperatureData = useTemperatureStatus();

  // Helper function to format temperature values
  const formatTemperature = (temp) => {
    if (temp === null || temp === undefined) return '--.-';
    return `${temp.toFixed(1)}`;
  };

  // Helper function to format voltage values
  const formatVoltage = (voltage) => {
    if (voltage === null || voltage === undefined) return '--.-';
    return `${voltage.toFixed(2)}`;
  };

  // Helper function to format current values
  const formatCurrent = (current) => {
    if (current === null || current === undefined) return '--.-';
    return `${current.toFixed(3)}`;
  };

  // Helper function to format PWM percentage
  const formatPwm = (pwm) => {
    if (pwm === null || pwm === undefined) return '--';
    return `${Math.round(pwm)}`;
  };

  // Decode status byte to get TEC mode information
  const decodeTecStatus = (statusByte) => {
    if (statusByte === null || statusByte === undefined) {
      return { mode: 'UNKNOWN', description: 'No status data' };
    }

    // Decode based on status byte bits (this may need adjustment based on actual implementation)
    const temperatureLow = !!(statusByte & 0x01);
    const temperatureHigh = !!(statusByte & 0x02);
    const constantTemperature = !!(statusByte & 0x04);
    const constantCurrent = !!(statusByte & 0x08);

    // Check for error condition: both temperature high and low set simultaneously
    if (temperatureLow && temperatureHigh) {
      return { mode: 'ERROR', description: 'Temperature Error (High & Low)' };
    }

    if (constantTemperature) {
      return { mode: 'CT', description: 'Constant Temperature Mode' };
    } else if (constantCurrent) {
      return { mode: 'CC', description: 'Constant Current Mode' };
    } else if (temperatureLow) {
      return { mode: 'TL', description: 'Temperature Low' };
    } else if (temperatureHigh) {
      return { mode: 'TH', description: 'Temperature High' };
    } else {
      return { mode: 'UNKNOWN', description: 'Unknown' };
    }
  };

  // Get current TEC mode
  const currentMode = createMemo(() => {
    const data = temperatureData();
    return decodeTecStatus(data?.statsBytes);
  });

  // Determine coldside temperature status relative to target
  const getColdSideStatus = () => {
    const data = temperatureData();
    if (!data || data.status === 'OFFLINE') return 'offline';

    const target = 20.0;
    const tolerance = 0.5;
    const temp = data.coldSideTemp;

    if (temp === null || temp === undefined) return 'unknown';

    if (Math.abs(temp - target) <= tolerance) return 'nominal';
    if (temp < target - tolerance) return 'cold';
    if (temp > target + tolerance) return 'hot';

    return 'unknown';
  };

  // Determine TEC power status
  const getTecPowerStatus = () => {
    const data = temperatureData();
    if (!data || data.status === 'OFFLINE') return 'offline';

    const voltage = data.tecVoltage;
    const current = data.tecCurrent;

    if (voltage === null || current === null) return 'unknown';

    const power = Math.abs(voltage * current);
    if (power < 0.1) return 'idle';
    if (power < 3) return 'low';
    if (power < 6) return 'medium';
    return 'high';
  };

  const [rotation, setRotation] = createSignal(0);
  const [targetSpeed, setTargetSpeed] = createSignal(0);
  const [currentSpeed, setCurrentSpeed] = createSignal(0);
  let animationFrameId;
  let lastTime = 0;

  const updateFanSpeed = () => {
    const data = temperatureData();
    const pwm = data?.fanPwm;
    const maxSpeed = 360 * 3; // degrees per second at 100% PWM
    // Convert PWM to rotation speed (degrees per second)
    const newTargetSpeed = pwm && pwm > 10 ? (pwm / 100) * maxSpeed : 0;
    setTargetSpeed(newTargetSpeed);
  };

  const animate = (timestamp) => {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = (timestamp - lastTime) / 1000; // Convert to seconds
    lastTime = timestamp;

    // Smoothly interpolate current speed toward target speed
    const speedDiff = targetSpeed() - currentSpeed();
    const acceleration = speedDiff * 5; // Adjust this value for responsiveness
    setCurrentSpeed(prev => prev + acceleration * deltaTime);

    // Update rotation based on current speed
    setRotation(prev => (prev + currentSpeed() * deltaTime) % 360);

    animationFrameId = requestAnimationFrame(animate);
  };

    onMount(() => {
    animationFrameId = requestAnimationFrame(animate);
  });

  onCleanup(() => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
  });

  // Update target speed when PWM changes
  createEffect(updateFanSpeed);


  return (
    <Panel
      title="Temperature Subsystem"
      className={className}
      contentClass={styles.contentSection}
      headerStats={
        <div class={`${commonStyles.statBox} ${styles.tecMode}`}>
          <ValueDisplay
            label="Mode"
            value={() => currentMode().mode}
            className={`${commonStyles.smallText} ${commonStyles.monospaceText}`}
          />
        </div>
      }
    >
        {/* <div class={styles.valuesSection}>
          <div class={styles.valueGrid}>
            <div class={styles.valueItem}>
              <ValueDisplay
                label="Control"
                value={() => temperatureData()?.coldSideTemp}
                unit="°C"
                formatFn={formatTemperature}
                className={`${commonStyles.monospaceText} ${commonStyles.smallText}`}
              />
            </div>
            <div class={styles.valueItem}>
              <ValueDisplay
                label="Hotside"
                value={() => temperatureData()?.hotSideTemp}
                unit="°C"
                formatFn={formatTemperature}
                className={`${commonStyles.monospaceText} ${commonStyles.smallText}`}
              />
            </div>
            <div class={styles.valueItem}>
              <ValueDisplay
                label="Fan"
                value={() => temperatureData()?.fanPwm}
                unit="%"
                formatFn={formatPwm}
                className={`${commonStyles.monospaceText} ${commonStyles.smallText}`}
              />
            </div>
            <div class={styles.valueItem}>
              <ValueDisplay
                label="TEC V"
                value={() => temperatureData()?.tecVoltage}
                unit="V"
                formatFn={formatVoltage}
                className={`${commonStyles.monospaceText} ${commonStyles.smallText}`}
              />
            </div>
            <div class={styles.valueItem}>
              <ValueDisplay
                label="TEC C"
                value={() => temperatureData()?.tecCurrent}
                unit="A"
                formatFn={formatCurrent}
                className={`${commonStyles.monospaceText} ${commonStyles.smallText}`}
              />
            </div>
            <div class={styles.valueItem}>
              <ValueDisplay
                label="TEC P"
                value={() => {
                  const data = temperatureData();
                  if (!data || data.tecVoltage === null || data.tecCurrent === null) return null;
                  return Math.abs(data.tecVoltage * data.tecCurrent);
                }}
                unit="W"
                formatFn={(power) => power !== null ? power.toFixed(2) : '--.-'}
                className={`${commonStyles.monospaceText} ${commonStyles.smallText}`}
              />
            </div>
        </div>
      </div> */}

      <div class={styles.diagramSection}>
          <svg class={styles.temperatureDiagram} viewBox="60 0 330 250" preserveAspectRatio="xMidYMid meet">
            {/* Define gradients for temperature visualization */}
            <defs>
              <linearGradient id="coldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" class={styles.coldGradientStart} />
                <stop offset="100%" class={styles.coldGradientEnd} />
              </linearGradient>
              <linearGradient id="hotGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" class={styles.hotGradientStart} />
                <stop offset="100%" class={styles.hotGradientEnd} />
              </linearGradient>
              <linearGradient id="tecGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" class={styles.tecGradientHot} />
                <stop offset="50%" class={styles.tecGradientMid} />
                <stop offset="100%" class={styles.tecGradientCold} />
              </linearGradient>
            </defs>

            {/* Fan - Top (cooling the hotside heatsink) */}
            <g class={styles.fan}>
              {/* Fan housing */}
              <circle cx="225" cy="35" r="25"
                      fill="none"
                      stroke="var(--color-textSecondary)"
                      stroke-width="1" />

              {/* Fan blades with smooth rotation */}
              <g class={styles.fanBlades} style={`transform: rotate(${rotation()}deg)`}>
                <path d="M 225 15
                        C 230 18, 230 25, 225 28
                        C 220 25, 220 18, 225 15 Z"
                      fill="var(--color-text)"
                      transform="rotate(0, 225, 35)" />
                <path d="M 225 15
                        C 230 18, 230 25, 225 28
                        C 220 25, 220 18, 225 15 Z"
                      fill="var(--color-text)"
                      transform="rotate(120, 225, 35)" />
                <path d="M 225 15
                        C 230 18, 230 25, 225 28
                        C 220 25, 220 18, 225 15 Z"
                      fill="var(--color-text)"
                      transform="rotate(240, 225, 35)" />
                {/* Center hub */}
                <circle cx="225" cy="35" r="4"
                        fill="var(--color-textSecondary)"
                        stroke="var(--color-border)"
                        stroke-width="0.5" />
              </g>
            </g>
            <text x="100" y="40" class={`${styles.componentText} ${styles.fanText}`}>Fan {formatPwm(temperatureData()?.fanPwm)}%</text>

            {/* Hotside Heatsink - Top */}
            <rect x="80" y="70" width="290" height="30"
                  class={`${styles.componentBox} ${styles.hotside}`}
                  fill="url(#hotGradient)" />
            <text x="95" y="90" class={`${styles.componentText} ${styles.darkText}`}>Hotside Heatsink</text>
            <text x="355" y="92" class={`${styles.componentText} ${styles.value} ${styles.darkText} ${styles.rightAlign}`}>
              {formatTemperature(temperatureData()?.hotSideTemp)}°C
            </text>

            {/* TEC Module - Center */}
            <rect x="120" y="120" width="210" height="40"
                  class={`${styles.componentBox} ${styles.tec} ${getTecPowerStatus() === 'high' ? styles.high : getTecPowerStatus() === 'medium' ? styles.medium : getTecPowerStatus() === 'low' ? styles.low : styles.idle}`}
                  fill="url(#tecGradient)" />
            <text x="225" y="137" class={`${styles.componentText} ${styles.center} ${styles.darkText}`}>TEC Module</text>
            <text x="225" y="152" class={`${styles.componentText} ${styles.center} ${styles.darkText}`}>
              {formatVoltage(temperatureData()?.tecVoltage)}V @ {formatCurrent(temperatureData()?.tecCurrent)}A
            </text>

            {/* Coldside Heatspreader - Bottom */}
            <rect x="100" y="180" width="250" height="30"
                  class={`${styles.componentBox} ${styles.coldside} ${getColdSideStatus() === 'nominal' ? styles.nominal : getColdSideStatus() === 'cold' ? styles.cold : getColdSideStatus() === 'hot' ? styles.hot : styles.offline}`}
                  fill="url(#coldGradient)" />
            <text x="115" y="201" class={`${styles.componentText} ${styles.darkText}`}>Controlside</text>
            <text x="335" y="201" class={`${styles.componentText} ${styles.value} ${styles.darkText} ${styles.rightAlign}`}>
              {formatTemperature(temperatureData()?.coldSideTemp)}°C
            </text>

            {/* Airflow arrows */}
            <defs>
              <marker id="airflow-arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--color-text)" />
              </marker>
            </defs>

            <line x1="270" y1="15" x2="288" y2="15" class={`${temperatureData()?.fanPwm > 75 ? '' : styles.hiddenAirflow} ${styles.airflowLine}`} marker-end="url(#airflow-arrow)" />
            <line x1="270" y1="25" x2="290" y2="25" class={`${temperatureData()?.fanPwm > 50 ? '' : styles.hiddenAirflow} ${styles.airflowLine}`} marker-end="url(#airflow-arrow)" />
            <line x1="270" y1="35" x2="292" y2="35" class={`${temperatureData()?.fanPwm > 10 ? '' : styles.hiddenAirflow} ${styles.airflowLine}`} marker-end="url(#airflow-arrow)" />
            <line x1="270" y1="45" x2="290" y2="45" class={`${temperatureData()?.fanPwm > 50 ? '' : styles.hiddenAirflow} ${styles.airflowLine}`} marker-end="url(#airflow-arrow)" />
            <line x1="270" y1="55" x2="288" y2="55" class={`${temperatureData()?.fanPwm > 75 ? '' : styles.hiddenAirflow} ${styles.airflowLine}`} marker-end="url(#airflow-arrow)" />
          </svg>
        </div>
    </Panel>
  );
}

export default TemperaturePanel;
