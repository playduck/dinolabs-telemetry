import styles from './SystemStatus.module.css';
import { BsCpu, BsThermometerHalf } from 'solid-icons/bs';
import { BiSolidFlask, BiSolidCarBattery } from 'solid-icons/bi';
import ValueDisplay from './shared/ValueDisplay';
import { useSystemsState } from '../hooks/useTelemetryState';
import { SYSTEM_MODES, getStatusClass, getModeClass, getModeDisplay, isErrorState } from '../utils/systemHelpers';

function SystemCard({ type, className = '' }) {
  // Use centralized telemetry state instead of local state management
  const systemData = useSystemsState();

  const renderExperimentChambers = (chambers) => {
    return chambers.map((ready, index) => (
      <div
        class={`${styles.chamber} ${ready ? styles.chamberReady : ''} ${ready ? 'glow-blue' : ''}`}
        title={`Chamber ${index}: ${ready ? 'Ready' : 'Not Ready'}`}
      >
        {index}
      </div>
    ));
  };


  const renderCard = () => {
    switch (type) {
      case 'SYSTEM':
        return (
          <div class={`${styles.systemCard} ${isErrorState(systemData().SYSTEM.status) ? styles.systemCardError : ''} ${className}`}>
            <div class={styles.systemHeader}>
              <div class={styles.headerTitle}>
                <BsCpu size={18} class={styles.headerIcon} />
                <h3>SYS</h3>
              </div>
              <div class={styles.spacer}></div>
              <div class={getStatusClass(systemData().SYSTEM.status, styles)}>
                {systemData().SYSTEM.status}
              </div>
            </div>
            <div class={styles.systemContent}>
              <div class={styles.modeDisplay}>
                <label>Mode</label>
                <span class={getModeClass(systemData().SYSTEM.mode, styles)}>
                  {getModeDisplay(systemData().SYSTEM.mode, systemData().SYSTEM.rawModeCode)}
                </span>
              </div>
            </div>
          </div>
        );

      case 'EXPERIMENT':
        return (
          <div class={`${styles.systemCard} ${isErrorState(systemData().EXPERIMENT.status) ? styles.systemCardError : ''} ${className}`}>
            <div class={styles.systemHeader}>
              <div class={styles.headerTitle}>
                <BiSolidFlask size={18} class={styles.headerIcon} />
                <h3>EXP</h3>
              </div>
              <div class={styles.spacer}></div>
              <div class={getStatusClass(systemData().EXPERIMENT.status, styles)}>
                {systemData().EXPERIMENT.status}
              </div>
            </div>
            <div class={styles.systemContent}>
              <div class={styles.chambersContainer}>
                <label>Chambers</label>
                <div class={styles.chambers}>
                  {renderExperimentChambers(systemData().SYSTEM.ledStates)}
                </div>
              </div>
            </div>
          </div>
        );

      case 'TEMPERATURE':
        return (
          <div class={`${styles.systemCard} ${isErrorState(systemData().TEMPERATURE.status) ? styles.systemCardError : ''} ${className}`}>
            <div class={styles.systemHeader}>
              <div class={styles.headerTitle}>
                <BsThermometerHalf size={18} class={styles.headerIcon} />
                <h3>TMP</h3>
              </div>
              <div class={styles.spacer}></div>
              <div class={getStatusClass(systemData().TEMPERATURE.status, styles)}>
                {systemData().TEMPERATURE.status}
              </div>
            </div>
            <div class={styles.systemContent}>
              <ValueDisplay
                label="Cold Side"
                value={() => {
                  const temp = systemData().TEMPERATURE.coldSideTemp;
                  if (temp === null) return null;
                  return Math.abs(temp) > 100 ? temp / 1000.0 : temp;
                }}
                unit="°C"
                precision={2}
              />
            </div>
          </div>
        );

      case 'POWER':
        return (
          <div class={`${styles.systemCard} ${isErrorState(systemData().POWER.status) ? styles.systemCardError : ''} ${className}`}>
            <div class={styles.systemHeader}>
              <div class={styles.headerTitle}>
                <BiSolidCarBattery size={18} class={styles.headerIcon} />
                <h3>PWR</h3>
              </div>
              <div class={styles.spacer}></div>
              <div class={getStatusClass(systemData().POWER.status, styles)}>
                {systemData().POWER.status}
              </div>
            </div>
            <div class={styles.systemContent}>
              <ValueDisplay
                label="SoC"
                value={() => systemData().SYSTEM.soc}
                unit="%"
                precision={1}
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
