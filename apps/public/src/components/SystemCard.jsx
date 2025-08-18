import styles from './SystemStatus.module.css';
import { BsCpu, BsThermometerHalf } from 'solid-icons/bs';
import { BiSolidFlask, BiSolidCarBattery } from 'solid-icons/bi';
import ValueDisplay from './shared/ValueDisplay';
import { useSystemsState } from '../hooks/useTelemetryState';
import { SYSTEM_MODES, getStatusClass, getModeClass, getModeDisplay } from '../utils/systemHelpers';

function SystemCard({ type, className = '' }) {
  // Use centralized telemetry state instead of local state management
  const systemData = useSystemsState();

  const renderExperimentChambers = (chambers) => {
    return chambers.map((ready, index) => (
      <div
        class={`${styles.chamber} ${ready ? styles.chamberReady : ''} ${ready ? 'glow-blue' : ''}`}
        title={`Chamber ${index + 1}: ${ready ? 'Ready' : 'Not Ready'}`}
      >
        {index + 1}
      </div>
    ));
  };


  const renderCard = () => {
    switch (type) {
      case 'SYSTEM':
        return (
          <div class={`${styles.systemCard} ${className}`}>
            <div class={styles.systemHeader}>
              <div class={styles.headerTitle}>
                <BsCpu size={18} class={styles.headerIcon} />
                <h3>SYSTEM</h3>
              </div>
              <div class={styles.spacer}></div>
              <div class={getStatusClass(systemData().SYSTEM.status, styles)}>
                {systemData().SYSTEM.status}
              </div>
            </div>
            <div class={styles.systemContent}>
              <div class={styles.modeDisplay}>
                <label>Mode:</label>
                <span class={getModeClass(systemData().SYSTEM.mode, styles)}>
                  {getModeDisplay(systemData().SYSTEM.mode, systemData().SYSTEM.rawModeCode)}
                </span>
              </div>
            </div>
          </div>
        );

      case 'EXPERIMENT':
        return (
          <div class={`${styles.systemCard} ${className}`}>
            <div class={styles.systemHeader}>
              <div class={styles.headerTitle}>
                <BiSolidFlask size={18} class={styles.headerIcon} />
                <h3>EXPERIMENT</h3>
              </div>
              <div class={styles.spacer}></div>
              <div class={getStatusClass(systemData().EXPERIMENT.status, styles)}>
                {systemData().EXPERIMENT.status}
              </div>
            </div>
            <div class={styles.systemContent}>
              <div class={styles.chambersContainer}>
                <label>Chambers:</label>
                <div class={styles.chambers}>
                  {renderExperimentChambers(systemData().EXPERIMENT.chambers)}
                </div>
              </div>
            </div>
          </div>
        );

      case 'TEMPERATURE':
        return (
          <div class={`${styles.systemCard} ${className}`}>
            <div class={styles.systemHeader}>
              <div class={styles.headerTitle}>
                <BsThermometerHalf size={18} class={styles.headerIcon} />
                <h3>TEMPERATURE</h3>
              </div>
              <div class={styles.spacer}></div>
              <div class={getStatusClass(systemData().TEMPERATURE.status, styles)}>
                {systemData().TEMPERATURE.status}
              </div>
            </div>
            <div class={styles.systemContent}>
              <ValueDisplay
                label="Cold Side"
                value={() => systemData().TEMPERATURE.coldSideTemp !== null ? systemData().TEMPERATURE.coldSideTemp / 1000.0 : null}
                unit="°C"
                precision={2}
              />
            </div>
          </div>
        );

      case 'POWER':
        return (
          <div class={`${styles.systemCard} ${className}`}>
            <div class={styles.systemHeader}>
              <div class={styles.headerTitle}>
                <BiSolidCarBattery size={18} class={styles.headerIcon} />
                <h3>POWER</h3>
              </div>
              <div class={styles.spacer}></div>
              <div class={getStatusClass(systemData().POWER.status, styles)}>
                {systemData().POWER.status}
              </div>
            </div>
            <div class={styles.systemContent}>
              <ValueDisplay
                label="Battery"
                value={() => systemData().POWER.batteryVoltage !== null ? systemData().POWER.batteryVoltage / 1000.0 : null}
                unit="V"
                precision={2}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return renderCard();
}

export default SystemCard;