import styles from './PowerPanel.module.css';
import commonStyles from './shared/common.module.css';
import { usePowerStatus } from '../hooks/useTelemetryState';
import ValueDisplay from './shared/ValueDisplay';

function PowerPanel({ className }) {
  const powerData = usePowerStatus();

  // Helper function to format voltage values (convert from mV to V)
  const formatVoltage = (voltage) => {
    if (voltage === null || voltage === undefined) return '--.-V';
    return `${(voltage / 1000.0).toFixed(2)}V`;
  };

  // Helper function to format current values (convert from mA to A)
  const formatCurrent = (current) => {
    if (current === null || current === undefined) return '-.--A';
    return `${(current / 1000.0).toFixed(2)}A`;
  };

  // Helper function to format power values (U*I in watts)
  const formatPower = (voltage, current) => {
    if (voltage === null || voltage === undefined || current === null || current === undefined) return '-.-W';
    const volts = voltage / 1000.0;
    const amps = current / 1000.0;
    const watts = volts * amps;
    return `${watts.toFixed(1)}W`;
  };

  // Determine charge source styling and connection status
  const getChargeSourceStatus = (source) => {
    const data = powerData();
    if (!data || data.status === 'OFFLINE') return 'disconnected';
    return source === data.chargeSource ? 'active' : 'disconnected';
  };

  // Check if a rail has errors (failed or out of range)
  const isRailError = (railName) => {
    const data = powerData();
    if (!data || !data.rails) return false;

    const failedKey = `rail_${railName}_failed`;
    const inRangeKey = `rail_${railName}_inrange`;

    return data.rails[failedKey] || !data.rails[inRangeKey];
  };
  return (
    <div class={`${commonStyles.componentPanel} ${className || ''}`}>
      <div class={commonStyles.componentHeader}>
        <h3>Power Subsystem</h3>
        <div class={commonStyles.headerStats}>
          <div class={`${commonStyles.statBox} ${styles.batteryVoltage}`}>
            <ValueDisplay
              label="Battery"
              value={() => powerData()?.batteryVoltage ? (powerData().batteryVoltage / 1000.0).toFixed(2) : null}
              unit="V"
              className={`${commonStyles.smallText} ${commonStyles.monospaceText}`}
            />
          </div>
          <div class={`${commonStyles.statBox} ${styles.chargeSource}`}>
            <ValueDisplay
              label="Source"
              value={() => powerData()?.chargeSource || 'UNKNOWN'}
              className={`${commonStyles.smallText} ${commonStyles.monospaceText}`}
            />
          </div>
        </div>
      </div>
      <div class={styles.contentSection}>
        <div class={styles.diagramSection}>
          <div class={styles.diagramContainer}>
            <svg class={styles.powerDiagram} viewBox="30 40 340 210" preserveAspectRatio="xMidYMid meet">
            {/* Arrow markers for power flow direction */}
            <defs>
              <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="var(--color-text)" />
              </marker>
              <marker id="arrowhead-bi" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="var(--color-text)" />
              </marker>
              <marker id="arrowhead-bi-back" markerWidth="6" markerHeight="4" refX="1" refY="2" orient="auto">
                <polygon points="6 0, 0 2, 6 4" fill="var(--color-text)" />
              </marker>
              <marker id="arrowhead-white" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="var(--color-text)" />
              </marker>
              <marker id="arrowhead-gray" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                <polygon points="0 0, 6 2, 0 4" fill="var(--color-textSecondary)" />
              </marker>
            </defs>
            {/* Input Sources - Left Column */}
            {/* Battery - Car battery shape with two terminal posts on top
                 Path explanation:
                 - Main body: 80x40 rectangle from (30,50) to (110,90)
                 - Equal spacing pattern: 14 units flat, 19 units terminal, 14 units flat, 19 units terminal, 14 units flat
                 - Left terminal: 19x7 rectangle from (44,43) to (63,50)
                 - Right terminal: 19x7 rectangle from (77,43) to (96,50)
                 - All three flat spaces are equal (14 units each)
                 Path coordinates: Start bottom-left → bottom-right → top-right → around right terminal → between terminals → around left terminal → close */}
            <path d="M 30 50 L 30 90 L 110 90 L 110 50 L 96 50 L 96 43 L 77 43 L 77 50 L 63 50 L 63 43 L 44 43 L 44 50 Z"
                  class={`${styles.componentBox} ${styles.battery}`} />
            <text x="70" y="30" class={styles.componentText}>Battery</text>
            <text x="70" y="70" class={`${styles.componentText} ${styles.value}`}>
              {formatVoltage(powerData()?.batteryVoltage)}
            </text>

            <text x="70" y="125" class={styles.componentText}>Sources</text>
            {/* UMB */}
            <rect x="30" y="140" width="80" height="40" class={`${styles.componentBox} ${getChargeSourceStatus('UMB') === 'active' ? styles.active : styles.disconnected}`} />
            <text x="70" y="156" class={`${styles.componentText} ${getChargeSourceStatus('UMB') === 'disconnected' ? styles.disconnected : ''}`}>UMB</text>
            <text x="70" y="168" class={`${styles.componentText} ${styles.small} ${getChargeSourceStatus('UMB') === 'disconnected' ? styles.disconnected : ''}`}>
              {getChargeSourceStatus('UMB') === 'active' ? formatVoltage(powerData()?.rails?.V_Charge_Input) : '--'}
            </text>

            {/* USB PD */}
            <rect x="30" y="200" width="80" height="40" class={`${styles.componentBox} ${getChargeSourceStatus('USB') === 'active' ? styles.active : styles.disconnected}`} />
            <text x="70" y="216" class={`${styles.componentText} ${getChargeSourceStatus('USB') === 'disconnected' ? styles.disconnected : ''}`}>USB PD</text>
            <text x="70" y="228" class={`${styles.componentText} ${styles.small} ${getChargeSourceStatus('USB') === 'disconnected' ? styles.disconnected : ''}`}>
              {getChargeSourceStatus('USB') === 'active' ? formatVoltage(powerData()?.rails?.V_Charge_Input) : '--'}
            </text>

            {/* BMS Central Block - Full height to match input/output stacks */}
            <rect x="160" y="50" width="80" height="190" class={`${styles.componentBox} ${styles.bms}`} />
            <text x="200" y="140" class={styles.componentText}>BMS</text>
            <text x="200" y="158" class={`${styles.componentText} ${styles.small}`}>
              {powerData()?.status === 'OFFLINE' ? 'OFFLINE' : 'NOMINAL'}
            </text>

            {/* Output Rails - Right Column */}
            <text x="330" y="30" class={styles.componentText}>Output Rails</text>
            {/* VBat */}
            <rect x="290" y="50" width="80" height="40" class={`${styles.componentBox} ${styles.rail} ${isRailError('vbat') ? styles.error : ''}`} />
            <text x="330" y="66" class={styles.componentText}>
              {formatVoltage(powerData()?.batteryVoltage)}
            </text>
            <text x="330" y="78" class={`${styles.componentText} ${styles.small}`}>
              {formatPower(powerData()?.batteryVoltage, powerData()?.rails?.I_Battery)}
            </text>

            {/* +12V */}
            <rect x="290" y="100" width="80" height="40" class={`${styles.componentBox} ${styles.rail} ${isRailError('12v') ? styles.error : ''}`} />
            <text x="330" y="116" class={styles.componentText}>
              {formatVoltage(powerData()?.rails?.V_Rail_12V)}
            </text>
            <text x="330" y="128" class={`${styles.componentText} ${styles.small}`}>
              {formatPower(powerData()?.rails?.V_Rail_12V, powerData()?.rails?.I_Rail_12V)}
            </text>

            {/* +5V */}
            <rect x="290" y="150" width="80" height="40" class={`${styles.componentBox} ${styles.rail} ${isRailError('5v') ? styles.error : ''}`} />
            <text x="330" y="166" class={styles.componentText}>
              {formatVoltage(powerData()?.rails?.V_Rail_5V)}
            </text>
            <text x="330" y="178" class={`${styles.componentText} ${styles.small}`}>
              {formatPower(powerData()?.rails?.V_Rail_5V, powerData()?.rails?.I_Rail_5V)}
            </text>

            {/* +3V3 */}
            <rect x="290" y="200" width="80" height="40" class={`${styles.componentBox} ${styles.rail} ${isRailError('3v3') ? styles.error : ''}`} />
            <text x="330" y="216" class={styles.componentText}>
              {formatVoltage(powerData()?.rails?.V_Rail_3V3)}
            </text>
            <text x="330" y="228" class={`${styles.componentText} ${styles.small}`}>
              {formatPower(powerData()?.rails?.V_Rail_3V3, powerData()?.rails?.I_Rail_3V3)}
            </text>

            {/* Connection Lines */}
            {/* Battery to BMS - bi-directional */}
            <line x1="110" y1="70" x2="160" y2="70" class={`${styles.connectionLine} ${styles.active}`}
                  marker-start="url(#arrowhead-bi-back)" marker-end="url(#arrowhead-bi)" />
            <text x="135" y="58" class={`${styles.componentText} ${styles.small}`}>
              {formatCurrent(powerData()?.rails?.I_Battery)}
            </text>

            {/* UMB to BMS - input direction */}
            <line x1="110" y1="160" x2="160" y2="160" class={`${styles.connectionLine} ${getChargeSourceStatus('UMB') === 'disconnected' ? styles.disconnected : styles.active}`}
                  marker-end={`url(${getChargeSourceStatus('UMB') === 'disconnected' ? '#arrowhead-gray' : '#arrowhead-white'})`} />

            {/* Input charge current - positioned between UMB and USB lines */}
            <text x="135" y="190" class={`${styles.componentText} ${styles.small}`}>
              {formatCurrent(powerData()?.rails?.I_Charge_Input)}
            </text>

            {/* USB PD to BMS - input direction */}
            <line x1="110" y1="220" x2="160" y2="220" class={`${styles.connectionLine} ${getChargeSourceStatus('USB') === 'disconnected' ? styles.disconnected : styles.active}`}
                  marker-end={`url(${getChargeSourceStatus('USB') === 'disconnected' ? '#arrowhead-gray' : '#arrowhead-white'})`} />

            {/* BMS to Rails - show current values on connection lines */}
            <line x1="240" y1="70" x2="290" y2="70" class={`${styles.connectionLine} ${styles.active}`}
                  marker-end="url(#arrowhead)" />
            <text x="265" y="58" class={`${styles.componentText} ${styles.small}`}>
              {formatCurrent(powerData()?.rails?.I_Battery)}
            </text>

            <line x1="240" y1="120" x2="290" y2="120" class={`${styles.connectionLine} ${styles.active}`}
                  marker-end="url(#arrowhead)" />
            <text x="265" y="108" class={`${styles.componentText} ${styles.small}`}>
              {formatCurrent(powerData()?.rails?.I_Rail_12V)}
            </text>

            <line x1="240" y1="170" x2="290" y2="170" class={`${styles.connectionLine} ${styles.active}`}
                  marker-end="url(#arrowhead)" />
            <text x="265" y="158" class={`${styles.componentText} ${styles.small}`}>
              {formatCurrent(powerData()?.rails?.I_Rail_5V)}
            </text>

            <line x1="240" y1="220" x2="290" y2="220" class={`${styles.connectionLine} ${styles.active}`}
                  marker-end="url(#arrowhead)" />
            <text x="265" y="208" class={`${styles.componentText} ${styles.small}`}>
              {formatCurrent(powerData()?.rails?.I_Rail_3V3)}
            </text>
          </svg>
          </div>
        </div>

        <div class={styles.plotSection}>
        <div class={styles.plotPlaceholder}>
          <h4>Dual-Axis Plot</h4>
          <p>Voltage (V) & Current (A)</p>
          <p>All Rail Voltages and Currents</p>
          <p style="margin-top: 1rem; font-size: 0.8rem;">
            📊 Plot implementation coming soon...
          </p>
        </div>
        </div>
      </div>
    </div>
  );
}

export default PowerPanel;
