import { createSignal, onMount, createMemo } from 'solid-js';
import { SolidUplot } from '@dschz/solid-uplot';
import 'uplot/dist/uPlot.min.css';
import { useTheme } from '../contexts/ThemeContext';

function Plot(props) {
  const [data, setData] = createSignal([[], []]);
  const { theme } = useTheme();

  onMount(() => {
    // Initialize with sample data following the correct format
    const now = Date.now() / 1000;
    const timePoints = [];
    const values = [];
    
    for (let i = 0; i < 10; i++) {
      timePoints.push(now - (10 - i) * 2);
      values.push(Math.sin(i * 0.5) * 50 + 100);
    }
    
    setData([timePoints, values]);
    console.log(`Plot ${props.title}: Initialized with sample data`, [timePoints, values]);
  });

  const addDataPoint = (timestamp, value) => {
    console.log(`Plot ${props.title}: Adding data point`, { timestamp, value });
    setData(currentData => {
      const [times, values] = currentData;
      const newTimes = [...times, timestamp];
      const newValues = [...values, value];
      
      // Keep only last 50 points for performance
      const maxPoints = props.maxPoints || 50;
      if (newTimes.length > maxPoints) {
        newTimes.splice(0, newTimes.length - maxPoints);
        newValues.splice(0, newValues.length - maxPoints);
      }
      
      console.log(`Plot ${props.title}: Updated data points: ${newTimes.length}`);
      return [newTimes, newValues];
    });
  };

  // Expose addDataPoint method to parent
  if (props.ref) {
    props.ref({ addDataPoint });
  }

  // Create reactive series configuration that updates with theme changes
  const series = createMemo(() => {
    const currentTheme = theme();
    const strokeColor = props.color || currentTheme.colors.primary;
    return [
      {}, // x-axis series (empty config)
      {
        label: props.label || "Value",
        stroke: strokeColor,
        width: 3,
        points: {
          show: true,
          size: 6,
          stroke: strokeColor,
          fill: strokeColor,
        }
      }
    ];
  });

  // Create reactive axes configuration
  const axes = createMemo(() => {
    const currentTheme = theme();
    return [
      {
        stroke: currentTheme.colors.text,
        grid: { stroke: currentTheme.colors.grid },
        ticks: { stroke: currentTheme.colors.gridSecondary },
        size: 60,
        gap: 5,
        labelSize: 12,
        font: "12px system-ui"
      },
      {
        stroke: currentTheme.colors.text,
        grid: { stroke: currentTheme.colors.grid },
        ticks: { stroke: currentTheme.colors.gridSecondary },
        size: 60,
        gap: 5,
        labelSize: 12,
        font: "12px system-ui"
      }
    ];
  });

  return (
    <div class="plot-container themed-plot" style={{ margin: "20px 0" }}>
      <h3 style={{ 
        color: theme().colors.text, 
        margin: "10px 0", 
        fontSize: "16px",
        transition: "color 0.3s ease"
      }}>
        {props.title}
      </h3>
      <SolidUplot
        data={data()}
        width={props.width || 800}
        height={props.height || 400}
        series={series()}
        scales={{
          x: { time: true },
          y: { auto: true }
        }}
        axes={axes()}
      />
    </div>
  );
}

export default Plot;