import { createSignal, onMount, createMemo, createEffect, onCleanup } from 'solid-js';
import { SolidUplot } from '@dschz/solid-uplot';
import 'uplot/dist/uPlot.min.css';
import { useTheme } from '../contexts/ThemeContext';

// Global cursor synchronization
let globalCursorPosition = null;
const plotInstances = new Set();

const syncCursor = (sourceInstance, x) => {
  globalCursorPosition = x;
  plotInstances.forEach(instance => {
    if (instance !== sourceInstance && instance.uplot && instance.uplot.setCursor) {
      // Only sync x-axis position, let each plot determine its own y position
      // Pass the x pixel position directly
      instance.uplot.setCursor({ left: x, top: null });
    }
  });
};

function Plot(props) {
  // Initialize data structure based on series configuration
  const getInitialData = () => {
    if (props.multiSeries && props.series) {
      return Array(props.series.length).fill([]);
    }
    return [[], []];
  };

  const [data, setData] = createSignal(getInitialData());
  const [plotSize, setPlotSize] = createSignal({ width: props.width || 400, height: props.height || 200 });
  const [containerRef, setContainerRef] = createSignal(null);
  const [uplotRef, setUplotRef] = createSignal(null);
  const [hasRealData, setHasRealData] = createSignal(false);
  const { theme } = useTheme();

  // Create plot instance for cursor sync
  const plotInstance = {
    id: Math.random().toString(36).substring(2, 11),
    uplot: null
  };

  // Auto-resize functionality
  createEffect(() => {
    const container = containerRef();
    if (!container) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const newSize = {
            width: Math.floor(width),
            height: Math.floor(height)
          };
          setPlotSize(newSize);

          // Resize the uPlot instance if it exists
          const uplot = uplotRef();
          if (uplot && uplot.setSize) {
            uplot.setSize(newSize);
          }
        }
      }
    });

    resizeObserver.observe(container);

    onCleanup(() => {
      resizeObserver.disconnect();
    });
  });

  onMount(() => {
    // Register this plot instance for cursor synchronization
    plotInstances.add(plotInstance);

    onCleanup(() => {
      // Unregister plot instance on cleanup
      plotInstances.delete(plotInstance);
    });

    // Initialize with dummy data at (0,0) so plots always render
    if (props.multiSeries && props.series) {
      // Initialize multi-series plots with a single point at (0,0) for each series
      const initialData = props.series.map((_, idx) => {
        return idx === 0 ? [0] : [0]; // Time at 0, values at 0
      });
      setData(initialData);
      return;
    }

    // Initialize with sample data for single-series plots
    const now = Date.now() / 1000;
    const timePoints = [];
    const values = [];

    for (let i = 0; i < 10; i++) {
      timePoints.push(now - (10 - i) * 2);
      values.push(Math.sin(i * 0.5) * 50 + 100);
    }

    setData([timePoints, values]);
  });

  const addDataPoint = (timestamp, ...values) => {
    const maxPoints = props.maxPoints || 50;

    // On first real data point, clear dummy data
    if (!hasRealData()) {
      setHasRealData(true);
      if (props.multiSeries) {
        // Reset to just this first real data point for multi-series
        setData(currentData => {
          return currentData.map((series, idx) => {
            if (idx === 0) {
              return [timestamp];
            } else if (values[idx - 1] !== undefined && values[idx - 1] !== null) {
              return [values[idx - 1]];
            } else {
              return [null];
            }
          });
        });
      } else {
        // Reset to just this first real data point for single-series
        setData([[timestamp], [values[0]]]);
      }
      return;
    }

    if (props.multiSeries) {
      // Handle multiple values for multi-series plots
      setData(currentData => {
        const newData = currentData.map((series, idx) => {
          const newSeries = [...series];
          if (idx === 0) {
            // Time series (first index)
            newSeries.push(timestamp);
          } else if (values[idx - 1] !== undefined && values[idx - 1] !== null) {
            // Data series (subsequent indices)
            newSeries.push(values[idx - 1]);
          } else {
            // Handle missing data
            newSeries.push(null);
          }

          // Keep only last maxPoints for performance
          return newSeries.slice(-maxPoints);
        });
        return newData;
      });
    } else {
      // Single-series plot (backward compatibility)
      const value = values[0];
      setData(currentData => {
        const [times, seriesValues] = currentData;
        const newTimes = [...times, timestamp];
        const newValues = [...seriesValues, value];

        // Keep only last maxPoints for performance
        if (newTimes.length > maxPoints) {
          newTimes.splice(0, newTimes.length - maxPoints);
          newValues.splice(0, newValues.length - maxPoints);
        }

        return [newTimes, newValues];
      });
    }
  };

  // Expose addDataPoint method and uplot ref to parent
  if (props.ref) {
    props.ref({
      addDataPoint,
      setUplotRef: (uplot) => setUplotRef(uplot)
    });
  }

  // Create reactive series configuration that updates with theme changes
  const series = createMemo(() => {
    const currentTheme = theme();

    if (props.multiSeries && props.series) {
      // Use provided multi-series configuration
      return props.series.map((seriesConfig, idx) => {
        if (idx === 0) return {}; // x-axis series (empty config)

        return {
          label: seriesConfig.label || `Series ${idx}`,
          stroke: seriesConfig.stroke || currentTheme.colors.primary,
          width: seriesConfig.width || 2,
          scale: seriesConfig.scale || 'y',
          dash: seriesConfig.dash || undefined,
          points: {
            show: seriesConfig.points?.show ?? true,
            size: seriesConfig.points?.size || 6,
            stroke: seriesConfig.stroke || currentTheme.colors.primary,
            fill: seriesConfig.stroke || currentTheme.colors.primary,
          },
          value: seriesConfig.value || undefined,
          ...seriesConfig
        };
      });
    }

    // Fallback to existing single-series logic
    const strokeColor = props.color || currentTheme.colors.primary;
    return [
      {}, // x-axis series (empty config)
      {
        label: props.label || "Value",
        stroke: strokeColor,
        width: 3,
        points: {
          show: true,
          size: 7,
          stroke: strokeColor,
          fill: strokeColor,
        }
      }
    ];
  });

  // Create reactive axes configuration
  const axes = createMemo(() => {
    const currentTheme = theme();

    if (props.axes) {
      // Use provided axes configuration with theme integration
      return props.axes.map((axisConfig, idx) => {
        if (idx === 0) {
          // Time axis configuration
          return {
            ...axisConfig,
            stroke: axisConfig.stroke || currentTheme.colors.text,
            grid: axisConfig.grid || { stroke: currentTheme.colors.grid },
            ticks: axisConfig.ticks || { stroke: currentTheme.colors.gridSecondary },
            size: axisConfig.size !== undefined ? axisConfig.size : 60,
            gap: axisConfig.gap || 5,
            labelSize: axisConfig.labelSize || 12,
            font: axisConfig.font || "12px system-ui"
          };
        }

        return {
          ...axisConfig,
          stroke: axisConfig.stroke || currentTheme.colors.text,
          grid: axisConfig.grid || {
            show: axisConfig.grid?.show !== false,
            stroke: currentTheme.colors.grid
          },
          ticks: axisConfig.ticks || { stroke: currentTheme.colors.gridSecondary },
          size: axisConfig.size !== undefined ? axisConfig.size : 60,
          gap: axisConfig.gap || 5,
          labelSize: axisConfig.labelSize || 12,
          font: axisConfig.font || "12px system-ui"
        };
      });
    }

    // Fallback to existing single-axis logic
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

  // Create reactive bands configuration
  const bands = createMemo(() => {
    if (props.bands) {
      return props.bands;
    }
    return undefined;
  });

  return (
    <div
      ref={setContainerRef}
      class="plot-container themed-plot"
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        "flex-direction": "column"
      }}
    >
      {props.title && (
        <h3 style={{
          color: theme().colors.text,
          fontSize: "16px",
          transition: "color 0.3s ease",
          margin: "0 0 10px 0"
        }}>
          {props.title}
        </h3>
      )}
      <div style={{ flex: "1", "min-height": "0" }}>
        <SolidUplot
          data={data()}
          width={plotSize().width}
          height={plotSize().height}
          series={series()}
          scales={props.scales || {
            x: { time: true },
            y: { auto: true }
          }}
          axes={axes()}
          bands={bands()}
          cursor={{
            show: true,
            x: true,
            y: true
          }}
          pxAlign={0}
          hooks={{
            setCursor: [
              (uplot) => {
                plotInstance.uplot = uplot;
                return (_, x, _y) => {
                  if (x !== null && x !== undefined) {
                    syncCursor(plotInstance, x);
                  }
                };
              }
            ],
            ready: [
              (uplot) => {
                plotInstance.uplot = uplot;
              }
            ]
          }}
          onMount={(uplot) => {
            setUplotRef(uplot);
            plotInstance.uplot = uplot;
          }}
        />
      </div>
    </div>
  );
}

export default Plot;
