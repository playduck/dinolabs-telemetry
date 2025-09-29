import { createSignal, onCleanup, createEffect } from 'solid-js';
import styles from './MessageHistory.module.css';
import { useTelemetrySubscription } from './shared/useTelemetrySubscription';
import commonStyles from './shared/common.module.css';
import ValueDisplay from './shared/ValueDisplay';
import Panel from './shared/Panel';

function MessageHistory({ className = '' }) {
  // Data rate bucketing (1-second buckets)
  const [dataBuckets, setDataBuckets] = createSignal([]);
  const [currentDataRate, setCurrentDataRate] = createSignal(0);
  const [connectionHealth, setConnectionHealth] = createSignal('nominal'); // nominal, degraded, stopped
  const [messageTypeBreakdown, setMessageTypeBreakdown] = createSignal({});

  // Event logging
  const [events, setEvents] = createSignal([]);

  // Legacy timing info
  const [lastMessageTime, setLastMessageTime] = createSignal(null);
  const [currentTime, setCurrentTime] = createSignal(Date.now());
  const [totalMessages, setTotalMessages] = createSignal(0);
  const [sessionStartTime] = createSignal(Date.now());

  // Configuration
  const bucketSizeMs = 1000; // 1-second buckets
  const maxHistoryBuckets = 120; // Keep 2 minutes of history
  const maxEvents = 50; // Keep last 50 significant events
  const healthyThresholdMin = 30; // msgs/sec
  const degradedThresholdMin = 10; // msgs/sec

  // Internal state
  let timeUpdateInterval;
  let currentBucketStart = null;
  let currentBucketData = { count: 0, types: {} };
  let eventIdCounter = 0;
  let lastHealthStatus = 'nominal';
  let eventListRef;

  const getCurrentBucketTimestamp = () => {
    const now = Date.now();
    return Math.floor(now / bucketSizeMs) * bucketSizeMs;
  };

  const addEvent = (type, message, data = null) => {
    const newEvent = {
      id: `event-${++eventIdCounter}`,
      timestamp: Date.now(),
      type: type,
      message: message,
      data: data
    };

    setEvents(prev => [newEvent, ...prev].slice(0, maxEvents));
  };

  const updateHealthStatus = (currentRate, timeSinceLastMessage) => {
    let newHealth = 'stopped';

    if (timeSinceLastMessage < 5000) { // Less than 5 seconds ago
      if (currentRate >= healthyThresholdMin) {
        newHealth = 'nominal';
      } else if (currentRate >= degradedThresholdMin) {
        newHealth = 'degraded';
      } else {
        newHealth = 'degraded';
      }
    }

    if (newHealth !== lastHealthStatus) {
      addEvent('health-change', `Connection status changed to ${newHealth}`, { from: lastHealthStatus, to: newHealth });
      lastHealthStatus = newHealth;
    }

    setConnectionHealth(newHealth);
  };

  const addMessage = (type, data = null) => {
    const now = Date.now();
    const bucketTimestamp = getCurrentBucketTimestamp();

    // Initialize bucket if needed
    if (currentBucketStart !== bucketTimestamp) {
      // Finalize previous bucket if exists
      if (currentBucketStart !== null && currentBucketData.count > 0) {
        finalizeBucket(currentBucketStart, currentBucketData);
      }

      // Start new bucket
      currentBucketStart = bucketTimestamp;
      currentBucketData = { count: 0, types: {}, hasErrors: false };
    }

    // Add to current bucket
    currentBucketData.count++;
    // Track errors
    if (type === 'bad-message') {
      currentBucketData.hasErrors = true;
    } else {
      // Don't track bad-message in the type breakdown
      currentBucketData.types[type] = (currentBucketData.types[type] || 0) + 1;
    }

    // Update totals
    setTotalMessages(prev => prev + 1);
    setLastMessageTime(now);

    // Update current data rate (messages in last second)
    updateCurrentDataRate();
  };

  const finalizeBucket = (timestamp, bucketData) => {
    const newBucket = {
      timestamp: timestamp,
      count: bucketData.count,
      types: { ...bucketData.types },
      rate: bucketData.count, // messages per second
      hasErrors: bucketData.hasErrors || false
    };

    setDataBuckets(prev => {
      const updated = [newBucket, ...prev].slice(0, maxHistoryBuckets);

      // Check for significant rate changes
      if (prev.length > 0) {
        const prevRate = prev[0].rate;
        const rateChange = Math.abs(newBucket.rate - prevRate);

        if (rateChange > 20) { // Significant change threshold
          addEvent('rate-change', `Data rate changed from ${prevRate} to ${newBucket.rate} msgs/sec`, {
            from: prevRate,
            to: newBucket.rate,
            change: newBucket.rate - prevRate
          });
        }
      }

      return updated;
    });

    // Update message type breakdown for current window
    setMessageTypeBreakdown(bucketData.types);
  };

  const updateCurrentDataRate = () => {
    const buckets = dataBuckets();
    const now = Date.now();

    // Calculate rate from recent buckets (last 3 seconds)
    const recentBuckets = buckets.filter(bucket => now - bucket.timestamp < 3000);
    const totalMessages = recentBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
    const timeSpanSeconds = Math.max(1, recentBuckets.length);

    const rate = Math.round(totalMessages / timeSpanSeconds);
    setCurrentDataRate(rate);
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDataRate = (rate) => {
    if (rate === 0) return '0';
    if (rate < 1000) return rate.toString();
    return `${(rate / 1000).toFixed(1)}k`;
  };

  const getHealthStatusColor = (health) => {
    switch (health) {
      case 'healthy': return 'var(--color-warrGreen)';
      case 'degraded': return 'var(--color-warrYellow)';
      case 'stopped': return 'var(--color-warrRed)';
      default: return 'var(--color-textSecondary)';
    }
  };

  const getUptimeDisplay = () => {
    const uptime = currentTime() - sessionStartTime();
    const minutes = Math.floor(uptime / 60000);
    const seconds = Math.floor((uptime % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatLastMessage = () => {
    const lastMsg = lastMessageTime();

    if (lastMsg === null) {
      return 'No MSG';
    }

    const timeSinceLastMsg = currentTime() - lastMsg;

    if (timeSinceLastMsg < 0) {
      return '0.0';
    }

    if (timeSinceLastMsg < 1000) {
      const seconds = (timeSinceLastMsg / 1000).toFixed(1);
      return seconds.padStart(3, ' ');
    } else if (timeSinceLastMsg < 60000) {
      const seconds = (timeSinceLastMsg / 1000).toFixed(1);
      return seconds.padStart(3, ' ');
    } else {
      const minutes = (timeSinceLastMsg / 60000).toFixed(1);
      return minutes.padStart(3, ' ');
    }
  };

  const getLastMessageUnit = () => {
    const lastMsg = lastMessageTime();

    if (lastMsg === null) {
      return '';
    }

    const timeSinceLastMsg = currentTime() - lastMsg;

    if (timeSinceLastMsg < 60000) {
      return 's';
    } else {
      return 'm';
    }
  };


  const getEventTypeClass = (type) => {
    switch (type) {
      case 'health-change':
        return `${styles.eventType} ${styles.eventTypeHealth}`;
      case 'rate-change':
        return `${styles.eventType} ${styles.eventTypeRate}`;
      case 'connection':
        return `${styles.eventType} ${styles.eventTypeConnection}`;
      case 'error':
        return `${styles.eventType} ${styles.eventTypeError}`;
      default:
        return `${styles.eventType} ${styles.eventTypeDefault}`;
    }
  };

  const getMiniChartData = () => {
    const buckets = dataBuckets().slice(0, 60); // Last 60 seconds
    return buckets.reverse(); // Chronological order for chart
  };

  const getMaxRate = () => {
    const buckets = dataBuckets();
    if (buckets.length === 0) return 100;

    const actualMax = Math.max(...buckets.map(b => b.rate));
    // Use actual max with some headroom (20% padding) but minimum of 10 to avoid tiny scales
    return Math.max(10, actualMax * 1.2);
  };


  // Update current time and health status regularly
  timeUpdateInterval = setInterval(() => {
    const now = Date.now();
    const bucketTimestamp = Math.floor(now / bucketSizeMs) * bucketSizeMs;
    setCurrentTime(now);

    // Always ensure we have a current bucket for this time period
    if (currentBucketStart !== bucketTimestamp) {
      // Finalize previous bucket if it exists
      if (currentBucketStart !== null) {
        finalizeBucket(currentBucketStart, currentBucketData);
      }

      // Start new bucket for current time period
      currentBucketStart = bucketTimestamp;
      currentBucketData = { count: 0, types: {}, hasErrors: false };
    }

    // Update health status
    const timeSinceLastMsg = lastMessageTime() ? now - lastMessageTime() : Infinity;
    updateHealthStatus(currentDataRate(), timeSinceLastMsg);

    // Update current data rate
    updateCurrentDataRate();
  }, 100);

  useTelemetrySubscription([
    {
      event: 'message',
      callback: (data) => {
        if (!data) return;

        // Handle new TLM format messages
        if (data.type !== undefined && data.typeName && data.data) {
          // This is a new TLM format message
          addMessage(data.typeName, {
            type: data.type,
            typeName: data.typeName,
            isValid: data.isValid,
            realValues: data.realValues,
            raw: data.raw ? data.raw.slice(0, 10) : null
          });
        } else {
          // Handle legacy format messages
          if (data.SystemStatus) {
            addMessage('SystemStatus', data.SystemStatus);
          }
          if (data.PowerState) {
            addMessage('PowerState', data.PowerState);
          }
          if (data.CoolingState) {
            addMessage('CoolingState', data.CoolingState);
          }
          if (data.ExperiementState) {
            addMessage('ExperiementState', data.ExperiementState);
          }
        }
      }
    },
    {
      event: 'bad-message',
      callback: () => {
        addMessage('bad-message');
        addEvent('error', 'Received malformed message', { timestamp: Date.now() });
      }
    }
  ]);

  // Initialize first event
  createEffect(() => {
    const messages = totalMessages();
    if (messages === 1) { // First message
      addEvent('connection', 'Data flow started', { timestamp: Date.now() });
    }
  });

  onCleanup(() => {
    if (timeUpdateInterval) clearInterval(timeUpdateInterval);
  });

  return (
    <Panel
      title="Data Flow Monitor"
      className={`${styles.dataFlowContainer} ${className}`}
      contentClass={styles.mainContent}
      headerStats={
        <div class={`${styles.healthIndicator} ${styles[connectionHealth()]}`}>
          <span class={styles.healthDot}></span>
          <span class={styles.healthText}>{connectionHealth().toUpperCase()}</span>
        </div>
      }
    >
        {/* Left Column - Main Dashboard */}
        <div class={styles.leftColumn}>
          {/* Health Stats Row */}
          <div class={styles.healthStats}>
        <div class={`${commonStyles.statBox} ${styles.statBox}`}>
          <ValueDisplay
            label="Rate"
            value={() => formatDataRate(currentDataRate())}
            unit={() => "msg/s"}
            formatFn={(val) => val}
            className={`${commonStyles.smallText} ${commonStyles.monospaceText}`}
          />
        </div>
        <div class={`${commonStyles.statBox} ${styles.statBox}`}>
          <ValueDisplay
            label="Last Rx"
            value={formatLastMessage}
            unit={getLastMessageUnit}
            formatFn={(val) => val}
            className={`${commonStyles.smallText} ${commonStyles.monospaceText}`}
          />
        </div>
        <div class={`${commonStyles.statBox} ${styles.statBox}`}>
          <ValueDisplay
            label="Total"
            value={() => totalMessages().toLocaleString()}
            unit={() => ""}
            formatFn={(val) => val}
            className={`${commonStyles.smallText} ${commonStyles.monospaceText}`}
          />
        </div>
        <div class={`${commonStyles.statBox} ${styles.statBox}`}>
          <ValueDisplay
            label="Uptime"
            value={getUptimeDisplay}
            unit={() => ""}
            formatFn={(val) => val}
            className={`${commonStyles.smallText} ${commonStyles.monospaceText}`}
          />
        </div>
      </div>

          {/* Mini Chart */}
          <div class={styles.chartSection}>
            <div class={styles.miniChart}>
              <svg viewBox="0 0 400 100" class={styles.chartSvg}>
                {getMiniChartData().map((bucket, index) => {
                  const maxRate = getMaxRate();
                  let height, fill, opacity;

                  if (bucket.rate === 0) {
                    // Show small red bars for zero-rate periods (system running but no data)
                    height = 4; // Small fixed height
                    fill = 'var(--color-warrRed)';
                    opacity = "0.6";
                  } else {
                    // Normal data bars - red if errors present, otherwise based on rate
                    height = maxRate > 0 ? (bucket.rate / maxRate) * 95 : 0;
                    if (bucket.hasErrors) {
                      fill = 'var(--color-warrRed)';
                    } else {
                      fill = bucket.rate > healthyThresholdMin ? 'var(--color-warrGreen)' :
                             bucket.rate > degradedThresholdMin ? 'var(--color-warrYellow)' : 'var(--color-warrRed)';
                    }
                    opacity = "0.8";
                  }

                  const x = (index / 60) * 400;
                  const y = bucket.rate === 0 ? 96 : (100 - height - 2); // Position small bars near bottom

                  return (
                    <rect
                      key={bucket.timestamp}
                      x={x}
                      y={y}
                      width="6"
                      height={height}
                      fill={fill}
                      opacity={opacity}
                    />
                  );
                })}
              </svg>
            </div>
          </div>
        </div>

        {/* Right Column - Sidebar */}
        <div class={styles.rightColumn}>

          {/* Message Type Breakdown */}
          <div class={styles.typeBreakdown}>
            <div class={styles.typeList}>
              {Object.entries(messageTypeBreakdown()).map(([type, count]) => (
                <div key={type} class={styles.typeItem}>
                  <span class={styles.typeName}>{type}</span>
                  <span class={styles.typeCount}>{count}/s</span>
                </div>
              ))}
              {Object.keys(messageTypeBreakdown()).length === 0 && (
                <div class={styles.emptyTypes}>No recent messages</div>
              )}
            </div>
          </div>

          {/* Event Log */}
          <div class={styles.eventSection}>
            <div class={styles.eventList} ref={eventListRef}>
              {events().slice(0, 10).map((event) => (
                <div key={event.id} class={`${commonStyles.borderedContainer} ${styles.eventEntry}`}>
                  <div class={getEventTypeClass(event.type)}>
                    {event.type}
                  </div>
                  <div class={styles.eventMessage}>
                    {event.message}
                  </div>
                  <div class={`${styles.eventTime} ${commonStyles.smallText}`}>
                    {formatTimestamp(event.timestamp)}
                  </div>
                </div>
              ))}
              {events().length === 0 && (
                <div class={styles.emptyState}>
                  No events yet...
                </div>
              )}
            </div>
          </div>
        </div>
    </Panel>
  );
}

export default MessageHistory;
