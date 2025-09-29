import { createSignal, createEffect } from 'solid-js';
import styles from './PowerPanel.module.css';
import commonStyles from './shared/common.module.css';
import { usePowerStatus } from '../hooks/useTelemetryState';
import ValueDisplay from './shared/ValueDisplay';
import Plot from './Plot';

function PowerPanel({ className }) {
  const powerData = usePowerStatus();
  const [voltageePlotRef, setVoltagePlotRef] = createSignal(null);
  const [currentPlotRef, setCurrentPlotRef] = createSignal(null);
  const [lastProcessedData, setLastProcessedData] = createSignal(null);

  // Helper function to check if power data has meaningfully changed
  const hasDataChanged = (newData, lastData) => {
    if (!lastData || !newData) return true;

    // Compare key power values to detect meaningful changes
    const voltageChanged = newData.batteryVoltage !== lastData.batteryVoltage;
    const railsChanged = (
      newData.rails?.V_Rail_12V !== lastData.rails?.V_Rail_12V ||
      newData.rails?.V_Rail_5V !== lastData.rails?.V_Rail_5V ||
      newData.rails?.V_Rail_3V3 !== lastData.rails?.V_Rail_3V3 ||
      newData.rails?.I_Battery !== lastData.rails?.I_Battery ||
      newData.rails?.I_Rail_12V !== lastData.rails?.I_Rail_12V ||
      newData.rails?.I_Rail_5V !== lastData.rails?.I_Rail_5V ||
      newData.rails?.I_Rail_3V3 !== lastData.rails?.I_Rail_3V3
    );

    return voltageChanged || railsChanged;
  };

  // Helper function to format voltage values (smart detection of unit)
  const formatVoltage = (voltage) => {
    if (voltage === null || voltage === undefined) return '--.-V';
    // If voltage is large (>50), assume it's in millivolts and convert to volts
    // If voltage is small (<=50), assume it's already in volts
    const volts = voltage > 50 ? voltage / 1000.0 : voltage;
    return `${volts.toFixed(2)}V`;
  };

  // Helper function to format current values (smart detection of unit)
  const formatCurrent = (current) => {
    if (current === null || current === undefined) return '-.--A';
    // If current is large (>10), assume it's in milliamps and convert to amps
    // If current is small (<=10), assume it's already in amps
    const amps = Math.abs(current) > 10 ? current / 1000.0 : current;
    return `${amps.toFixed(2)}A`;
  };

  // Helper function to format power values (U*I in watts)
  const formatPower = (voltage, current) => {
    if (voltage === null || voltage === undefined || current === null || current === undefined) return '-.-W';
    // Smart unit detection for both voltage and current
    const volts = voltage > 50 ? voltage / 1000.0 : voltage;
    const amps = Math.abs(current) > 10 ? current / 1000.0 : current;
    const watts = volts * amps;
    return `${watts.toFixed(1)}W`;
  };

  // Determine charge source styling and connection status
  const getChargeSourceStatus = (source) => {
    const data = powerData();
    if (!data || data.status === 'OFFLINE') return 'disconnected';
    return source === data.chargeSource ? 'active' : 'disconnected';
  };

  // Check if a rail has errors using status_byte from PowerMessage
  const isRailError = (railName) => {
    const data = powerData();
    if (!data || !data.rails) return true;

    // Map rail names to actual status flag names in the data
    const railStatusMap = {
      'vbat': 'rail_vbat_ok',
      '12v': 'rail_12v_ok',
      '5v': 'rail_5v_ok',
      '3v3': 'rail_3v3_ok'
    };

    const statusKey = railStatusMap[railName];
    if (!statusKey) return true;

    // Check status flags from PowerMessage status_byte (error = NOT ok)
    const statusValue = data.rails[statusKey];

    // Debug: Only show errors for truly bad values, ignore status byte for now
    // until we confirm the backend status byte generation is working correctly
    if (statusValue === undefined || statusValue === null) {
      return true; // No status data available, assume Bad
    }

    return statusValue === false;
  };

  const colors = {
    'vbat': '#00bfff',
    '12v': '#ffa500',
    '5v': '#9370db',
    '3v3': '#20b2aa'
  }

  // Voltage plot configuration
  const voltageSeries = [
    {}, // Time axis
    { label: "VBat", stroke: `${colors['vbat']}`, width: 1 },
    { label: "+12V", stroke: `${colors['12v']}`, width: 1 },
    { label: "+5V", stroke: `${colors['5v']}`, width: 1 },
    { label: "+3V3", stroke: `${colors['3v3']}`, width: 1 }
  ];

  const getRailColor = (railName) => {
    switch (railName) {
      case 'vbat':
        return colors['vbat'];
      case '12v':
        return colors['12v'];
      case '5v':
        return colors['5v'];
      case '3v3':
        return colors['3v3'];
      default:
        return 'var(--color-textSecondary)';
    }
  };

  const voltageAxes = [
    {
      show: true, // Show entire x-axis
      stroke: 'transparent',
      grid: { show: true },
      ticks: { show: true },
      size: 0
    },
    {
      show: true, // Ensure y-axis is visible
      values: (_, vals) => vals.map(v => Math.round(v) + "V"),
      stroke: "#ffffff",
      grid: { show: true, stroke: "#444444" },
      ticks: { show: true, stroke: "#ffffff" },
      size: 60,
      gap: 8,
      labelSize: 12,
      font: "12px system-ui"
    }
  ];

  // Current plot configuration
  const currentSeries = [
    {}, // Time axis
    { label: "VBat", stroke: "#00bfff", width: 1, dash: [5, 5] },
    { label: "+12V", stroke: "#ffa500", width: 1, dash: [5, 5] },
    { label: "+5V", stroke: "#9370db", width: 1, dash: [5, 5] },
    { label: "+3V3", stroke: "#20b2aa", width: 1, dash: [5, 5] }
  ];

  const currentAxes = [
    {
      show: true, // Show entire x-axis
      stroke: "transparent",
      grid: { show: true },
      ticks: { show: true },
      size: 0
    },
    {
      show: true, // Ensure y-axis is visible
      values: (_, vals) => vals.map(v => Math.round(v) + "A"),
      stroke: "#ffffff",
      grid: { show: true, stroke: "#444444" },
      ticks: { show: true, stroke: "#ffffff" },
      size: 60,
      gap: 8,
      labelSize: 12,
      font: "12px system-ui"
    }
  ];

  // Real-time data updates with deduplication
  createEffect(() => {
    const data = powerData();
    const voltageRef = voltageePlotRef();
    const currentRef = currentPlotRef();
    const lastData = lastProcessedData();

    // Only process data if it has meaningfully changed
    if (data && hasDataChanged(data, lastData)) {
      const timestamp = Date.now() / 1000;

      // Update voltage plot (smart unit detection)
      if (voltageRef && voltageRef.addDataPoint) {
        const convertVoltage = (v) => v ? (v > 50 ? v / 1000 : v) : null;
        voltageRef.addDataPoint(
          timestamp,
          convertVoltage(data.batteryVoltage),
          convertVoltage(data.rails?.V_Rail_12V),
          convertVoltage(data.rails?.V_Rail_5V),
          convertVoltage(data.rails?.V_Rail_3V3)
        );
      }

      // Update current plot (smart unit detection)
      if (currentRef && currentRef.addDataPoint) {
        const convertCurrent = (c) => c ? (Math.abs(c) > 10 ? c / 1000 : c) : null;
        currentRef.addDataPoint(
          timestamp,
          convertCurrent(data.rails?.I_Battery),
          convertCurrent(data.rails?.I_Rail_12V),
          convertCurrent(data.rails?.I_Rail_5V),
          convertCurrent(data.rails?.I_Rail_3V3)
        );
      }

      // Update the last processed data to prevent future duplicates
      setLastProcessedData(data);
    }
  });

  return (
    <div class={`${commonStyles.componentPanel} ${className || ''}`}>
      <div class={commonStyles.componentHeader}>
        <h3>Power Subsystem</h3>
        <div class={commonStyles.headerStats}>
          <div class={`${commonStyles.statBox} ${styles.batteryVoltage}`}>
            <ValueDisplay
              label="Battery"
              value={() => {
                const voltage = powerData()?.batteryVoltage;
                if (!voltage) return null;
                // Smart unit detection: if voltage > 50, assume millivolts, else volts
                return voltage > 50 ? (voltage / 1000.0).toFixed(2) : voltage.toFixed(2);
              }}
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
            <text x="70" y="105" class={styles.componentText}>Battery</text>
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
            <text x="200" y="140" class={styles.componentText}>PWRPCB</text>
            <text x="200" y="158" class={`${styles.componentText} ${styles.small}`}>
              {powerData()?.status === 'OFFLINE' ? 'OFFLINE' : 'NOMINAL'}
            </text>

            {/* Output Rails - Right Column */}
            {/* <text x="330" y="30" class={styles.componentText}>Output Rails</text> */}
            {/* VBat */}
            <rect x="290" y="50" width="80" height="40" class={`${styles.componentBox} ${styles.rail} ${isRailError('vbat') ? styles.error : styles.active}`} />
            <text x="330" y="66" class={styles.componentText}>
              {formatVoltage(powerData()?.batteryVoltage)}
            </text>
            <text x="330" y="78" class={`${styles.componentText} ${styles.small}`}>
              {formatPower(powerData()?.batteryVoltage, powerData()?.rails?.I_Battery)}
            </text>
            <rect x="293" y="53" width="74" height="35" class={`${styles.railColorOverlay} ${isRailError('vbat') ? styles.error : ''}`} style={{ stroke: getRailColor('vbat') }} />

            {/* +12V */}
            <rect x="290" y="100" width="80" height="40" class={`${styles.componentBox} ${styles.rail} ${isRailError('12v') ? styles.error : styles.active}`} />
            <text x="330" y="116" class={styles.componentText}>
              {formatVoltage(powerData()?.rails?.V_Rail_12V)}
            </text>
            <text x="330" y="128" class={`${styles.componentText} ${styles.small}`}>
              {formatPower(powerData()?.rails?.V_Rail_12V, powerData()?.rails?.I_Rail_12V)}
            </text>
            <rect x="293" y="103" width="74" height="35" class={`${styles.railColorOverlay} ${isRailError('12v') ? styles.error : ''}`} style={{ stroke: getRailColor('12v') }} />

            {/* +5V */}
            <rect x="290" y="150" width="80" height="40" class={`${styles.componentBox} ${styles.rail} ${isRailError('5v') ? styles.error : styles.active}`} />
            <text x="330" y="166" class={styles.componentText}>
              {formatVoltage(powerData()?.rails?.V_Rail_5V)}
            </text>
            <text x="330" y="178" class={`${styles.componentText} ${styles.small}`}>
              {formatPower(powerData()?.rails?.V_Rail_5V, powerData()?.rails?.I_Rail_5V)}
            </text>
            <rect x="293" y="153" width="74" height="35" class={`${styles.railColorOverlay} ${isRailError('5v') ? styles.error : ''}`} style={{ stroke: getRailColor('5v') }} />

            {/* +3V3 */}
            <rect x="290" y="200" width="80" height="40" class={`${styles.componentBox} ${styles.rail} ${isRailError('3v3') ? styles.error : styles.active}`} />
            <text x="330" y="216" class={styles.componentText}>
              {formatVoltage(powerData()?.rails?.V_Rail_3V3)}
            </text>
            <text x="330" y="228" class={`${styles.componentText} ${styles.small}`}>
              {formatPower(powerData()?.rails?.V_Rail_3V3, powerData()?.rails?.I_Rail_3V3)}
            </text>
            <rect x="293" y="203" width="74" height="35" class={`${styles.railColorOverlay} ${isRailError('3v3') ? styles.error : ''}`} style={{ stroke: getRailColor('3v3') }} />

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
          <div class={styles.voltageplot}>
            <Plot
              multiSeries={true}
              series={voltageSeries}
              axes={voltageAxes}
              scales={{
                x: { time: true },
                y: { auto: false, min: 0, max: 17 }
              }}
              maxPoints={30}
              ref={setVoltagePlotRef}
            />
          </div>
          <div class={styles.currentPlot}>
            <Plot
              multiSeries={true}
              series={currentSeries}
              axes={currentAxes}
              scales={{
                x: { time: true },
                y: { auto: false, min: 0, max: 4 }
              }}
              maxPoints={30}
              ref={setCurrentPlotRef}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default PowerPanel;
