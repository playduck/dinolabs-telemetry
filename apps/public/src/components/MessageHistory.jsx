import { createSignal, onCleanup, createEffect } from 'solid-js';
import styles from './MessageHistory.module.css';
import { useTelemetrySubscription } from './shared/useTelemetrySubscription';
import commonStyles from './shared/common.module.css';
import ValueDisplay from './shared/ValueDisplay';

function MessageHistory({ className = '' }) {
  const [messages, setMessages] = createSignal([]);
  const [avgDeltaT, setAvgDeltaT] = createSignal(null);
  const [lastMessageTime, setLastMessageTime] = createSignal(null);
  const [currentTime, setCurrentTime] = createSignal(Date.now());
  const [showBackToTop, setShowBackToTop] = createSignal(false);
  const maxHistorySize = 100; // Keep only last 100 messages
  const lowpassAlpha = 0.1; // First-order low-pass filter coefficient

  let internalLastMessageTime = null;
  let currentAvgDeltaT = null;
  let timeUpdateInterval;
  let messageIdCounter = 0;
  let messageListRef;
  let preserveScrollPosition = false;
  let scrollTopBefore = 0;
  let wasAtCapacity = false;
  let isScrollingToTop = false;

  const handleScroll = () => {
    if (messageListRef) {
      const isAtTop = messageListRef.scrollTop < 50;
      setShowBackToTop(!isAtTop);
    }
  };

  const scrollToTop = () => {
    if (messageListRef) {
      isScrollingToTop = true;
      messageListRef.scrollTo({ top: 0, behavior: 'smooth' });

      // Reset flag after scroll animation completes
      setTimeout(() => {
        isScrollingToTop = false;
      }, 1000); // Generous timeout for smooth scroll animation
    }
  };

  const addMessage = (type, data = null) => {
    const now = Date.now();
    const deltaTime = internalLastMessageTime ? now - internalLastMessageTime : 0;

    // Determine color class based on current average (fix it at message creation)
    let deltaColorClass = 'default';
    const currentAvg = avgDeltaT();
    if (currentAvg !== null && deltaTime > 0) {
      const tolerance = Math.max(5, currentAvg * 0.05); // Minimum 5ms tolerance or 5% of average

      if (deltaTime > currentAvg + tolerance) {
        deltaColorClass = 'above';
      } else if (deltaTime < currentAvg - tolerance) {
        deltaColorClass = 'below';
      } else {
        deltaColorClass = 'equal';
      }
    }

    const newMessage = {
      id: `msg-${++messageIdCounter}`,
      timestamp: now,
      type: type,
      deltaTime: deltaTime,
      deltaColorClass: deltaColorClass,
      data: data
    };

    setMessages(prev => {
      const messageList = messageListRef;
      const wasAtTop = !messageList || messageList.scrollTop < 10;

      // Store current scroll position and capacity status if user is not at top
      // But don't preserve position if we're actively scrolling to top
      if (!wasAtTop && messageList && !isScrollingToTop) {
        preserveScrollPosition = true;
        scrollTopBefore = messageList.scrollTop;
        wasAtCapacity = prev.length >= maxHistorySize;
      } else {
        preserveScrollPosition = false;
      }

      const updated = [newMessage, ...prev];
      return updated.slice(0, maxHistorySize);
    });

    // Update average deltaT using first-order low-pass filter
    if (deltaTime > 0) { // Only update for non-zero deltas
      if (currentAvgDeltaT === null) {
        currentAvgDeltaT = deltaTime; // Initialize with first delta
      } else {
        // Low-pass filter: y[n] = α * x[n] + (1 - α) * y[n-1]
        currentAvgDeltaT = lowpassAlpha * deltaTime + (1 - lowpassAlpha) * currentAvgDeltaT;
      }
      setAvgDeltaT(currentAvgDeltaT);
    }

    internalLastMessageTime = now;
    setLastMessageTime(now);
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const formatDeltaTime = (deltaTime) => {
    if (deltaTime === 0) return '---';

    if (deltaTime < 1000) {
      return `${deltaTime}ms`;
    } else if (deltaTime < 60000) {
      return `${(deltaTime / 1000).toFixed(1)}s`;
    } else {
      return `${(deltaTime / 60000).toFixed(1)}m`;
    }
  };

  const getAvgDeltaTValue = () => {
    const avg = avgDeltaT();
    if (avg === null) return null;

    if (avg < 1000) {
      return Math.round(avg);
    } else if (avg < 60000) {
      return (avg / 1000).toFixed(1);
    } else {
      return (avg / 60000).toFixed(1);
    }
  };

  const getAvgDeltaTUnit = () => {
    const avg = avgDeltaT();
    if (avg === null) return '';

    if (avg < 1000) {
      return 'ms';
    } else if (avg < 60000) {
      return 's';
    } else {
      return 'm';
    }
  };

  const formatLastMessage = () => {
    const lastMsg = lastMessageTime();

    // If no message has been received yet
    if (lastMsg === null) {
      return 'No MSG';
    }

    const timeSinceLastMsg = currentTime() - lastMsg;

    // Ensure we never show negative values
    if (timeSinceLastMsg < 0) {
      return '0.0';
    }

    if (timeSinceLastMsg < 1000) {
      // Less than 1 second - show as 0.x seconds
      const seconds = (timeSinceLastMsg / 1000).toFixed(1);
      return seconds.padStart(3, ' ');
    } else if (timeSinceLastMsg < 60000) {
      // Less than 1 minute - show in seconds with 1 decimal
      const seconds = (timeSinceLastMsg / 1000).toFixed(1);
      return seconds.padStart(3, ' ');
    } else {
      // 1 minute or more - show in minutes with 1 decimal
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

  const getMessageTypeClass = (type) => {
    switch (type) {
      case 'bad-message':
        return `${styles.messageType} ${styles.messageTypeBad}`;
      case 'SystemStatus':
        return `${styles.messageType} ${styles.messageTypeSystem}`;
      case 'PowerState':
        return `${styles.messageType} ${styles.messageTypePower}`;
      case 'CoolingState':
        return `${styles.messageType} ${styles.messageTypeTemperature}`;
      case 'ExperiementState':
        return `${styles.messageType} ${styles.messageTypeExperiment}`;
      default:
        return `${styles.messageType} ${styles.messageTypeDefault}`;
    }
  };

  const getDeltaColorClass = (message) => {
    const baseClass = `${styles.messageDelta} ${commonStyles.smallText} ${commonStyles.monospaceText}`;

    switch (message.deltaColorClass) {
      case 'above':
        return `${baseClass} ${styles.deltaAboveAvg}`;
      case 'below':
        return `${baseClass} ${styles.deltaBelowAvg}`;
      case 'equal':
        return `${baseClass} ${styles.deltaEqualAvg}`;
      default:
        return baseClass;
    }
  };


  // Update current time every 100ms for last message calculation
  timeUpdateInterval = setInterval(() => {
    setCurrentTime(Date.now());
  }, 50);

  useTelemetrySubscription([
    {
      event: 'message',
      callback: (data) => {
      if (!data) return;

      // Log each message type separately
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
    },
    {
      event: 'bad-message',
      callback: () => {
        addMessage('bad-message');
      }
    }
  ]);

  // Effect to restore scroll position after messages update
  createEffect(() => {
    // Access the messages signal to trigger this effect when messages change
    messages();

    if (preserveScrollPosition && messageListRef) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        if (messageListRef) {
          if (wasAtCapacity) {
            // When at capacity: one added to top, one removed from bottom
            // Estimate height of one message to adjust scroll position
            const firstChild = messageListRef.firstElementChild;
            const messageHeight = firstChild ? firstChild.offsetHeight + 4 : 50; // +4 for gap

            // Compensate for the new message added at the top
            messageListRef.scrollTop = scrollTopBefore + messageHeight;
          } else {
            // When not at capacity: just one added to top
            const firstChild = messageListRef.firstElementChild;
            const messageHeight = firstChild ? firstChild.offsetHeight + 4 : 50;

            // Compensate for the new message added at the top
            messageListRef.scrollTop = scrollTopBefore + messageHeight;
          }

          preserveScrollPosition = false;
        }
      });
    }
  });

  onCleanup(() => {
    if (timeUpdateInterval) clearInterval(timeUpdateInterval);
  });

  return (
    <div class={`${commonStyles.componentPanel} ${styles.messageHistoryContainer} ${className}`}>
      <div class={commonStyles.componentHeader}>
        <h3>Message History</h3>
        <div class={commonStyles.headerStats}>
          <div class={`${commonStyles.statBox} ${styles.lastMessage}`}>
            <ValueDisplay
              label="Last Rx"
              value={formatLastMessage}
              unit={getLastMessageUnit}
              formatFn={(val) => val}
              className={`${commonStyles.smallText} ${commonStyles.monospaceText}`}
            />
          </div>
          <div class={`${commonStyles.statBox} ${styles.avgDeltaT}`}>
            <ValueDisplay
              label="Avg Δ"
              value={getAvgDeltaTValue}
              unit={getAvgDeltaTUnit}
              formatFn={(val) => val}
              className={`${commonStyles.smallText} ${commonStyles.monospaceText}`}
            />
          </div>
        </div>
      </div>
      <div class={styles.messageList} ref={messageListRef} onScroll={handleScroll}>
        {messages().map((message) => (
          <div key={message.id} class={`${commonStyles.borderedContainer} ${styles.messageEntry}`}>
            <div class={`${getMessageTypeClass(message.type)} ${commonStyles.smallText} ${commonStyles.monospaceText}`}>
              {message.type}
            </div>
            <div class={`${styles.messageTime} ${commonStyles.smallText} ${commonStyles.monospaceText}`}>
              {formatTimestamp(message.timestamp)}
            </div>
            <div class={getDeltaColorClass(message)}>
              Δ{formatDeltaTime(message.deltaTime)}
            </div>
          </div>
        ))}
        {messages().length === 0 && (
          <div class={styles.emptyState}>
            No messages received yet...
          </div>
        )}
      </div>
      {showBackToTop() && (
        <button
          class={styles.backToTopButton}
          onClick={scrollToTop}
          title="Return to top"
        >
          <span class={styles.buttonIcon}>↑</span>
          <span class={styles.buttonText}>Return to Top</span>
        </button>
      )}
    </div>
  );
}

export default MessageHistory;
