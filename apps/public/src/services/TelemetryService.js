class TelemetryService {
  constructor() {
    this.socket = null;
    this.subscribers = new Map();
    this.isConnected = false;
    this.rtt = null;
    this.internalRtt = null;
    this.rttSampleCount = 0;
    this.rttSamplesRequired = 10; // Number of samples before propagating RTT
    this.heartbeatRequestTime = null;
    this.rttLowpass = 0.1;
    this.heartbeatIntervalMs = 250;
  }

  connect(port = 8083) {
    if (this.socket) {
      return;
    }

    try {
      // Import socket.io client dynamically
      import('socket.io-client').then(({ io }) => {
        // this.socket = io(`ws://localhost:${port}`);
        const protocol = (location.protocol === 'https:') ? 'wss://' : 'ws://';
        const url = `${protocol}${location.host}`;
        console.log('Connecting to telemetry service at', url);
        this.socket = io(url);

        this.socket.on('connect', () => {
          console.log('Connected to telemetry socket');
          this.isConnected = true;
          this.startHeartbeatInterval();
          this.notifySubscribers('connection', { connected: true, rtt: this.rtt });
        });

        this.socket.on('disconnect', () => {
          console.log('Disconnected from telemetry socket');
          this.isConnected = false;
          this.rtt = null;
          this.internalRtt = null;
          this.rttSampleCount = 0; // Reset sample counter
          this.stopHeartbeatInterval();
          this.notifySubscribers('connection', { connected: false, rtt: null });
        });

        this.socket.on('message', (data) => {
          try {
            const parsedData = JSON.parse(data);
            // console.log(parsedData)
            this.notifySubscribers('message', parsedData);
          } catch (error) {
            console.error('Failed to parse telemetry message:', error);
          }
        });

        this.socket.on('bad-message', () => {
          this.notifySubscribers('bad-message', { error: 'Bad message received' });
        });

        this.socket.on('heartbeat-response', (heartbeatResponseTime) => {
          if (this.heartbeatRequestTime) {
            // Calculate RTT using client-side timing only
            const receiveTime = Date.now();
            const delta = receiveTime - this.heartbeatRequestTime;

            // Validate RTT - must be positive and reasonable (< 10 seconds)
            // if (delta < 0) {
            //   console.warn(`Invalid negative RTT: ${delta}ms - skipping sample`);
            //   return;
            // }

            // if (delta > 10000) {
            //   console.warn(`Suspiciously high RTT: ${delta}ms - skipping sample`);
            //   return;
            // }

            // Update internal RTT with lowpass filter
            if (this.internalRtt !== null) {
              // Simple 1 pole lowpass filter
              this.internalRtt = ((1 - this.rttLowpass) * this.internalRtt) + (this.rttLowpass * delta);
            } else {
              this.internalRtt = delta;
            }

            // Increment sample counter
            this.rttSampleCount++;

            // Only propagate RTT after enough samples for lowpass to settle
            if (this.rttSampleCount >= this.rttSamplesRequired) {
              this.rtt = this.internalRtt;
              this.notifySubscribers('rtt', { rtt: this.rtt });
            }
          }
        });
      }).catch(error => {
        console.error('Failed to load socket.io client:', error);
      });
    } catch (error) {
      console.error('Failed to connect to telemetry service:', error);
    }
  }

  subscribe(event, callback) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event).add(callback);

    // Return unsubscribe function
    return () => {
      const eventSubscribers = this.subscribers.get(event);
      if (eventSubscribers) {
        eventSubscribers.delete(callback);
      }
    };
  }

  notifySubscribers(event, data) {
    const eventSubscribers = this.subscribers.get(event);
    if (eventSubscribers) {
      eventSubscribers.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in subscriber callback:', error);
        }
      });
    }
  }

  requestHeartbeat() {
    if (this.socket && this.isConnected) {
      this.heartbeatRequestTime = Date.now();
      this.socket.emit('heartbeat-request', this.heartbeatRequestTime);
    }
  }

  startHeartbeatInterval() {
    if (this.heartbeatInterval) {
      return;
    }

    // Send initial heartbeat
    this.requestHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      this.requestHeartbeat();
    }, this.heartbeatIntervalMs);
  }

  stopHeartbeatInterval() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected,
      rtt: this.rtt
    };
  }

  disconnect() {
    if (this.socket) {
      this.stopHeartbeatInterval();
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      this.rtt = null;
      this.internalRtt = null;
      this.rttSampleCount = 0; // Reset sample counter
    }
  }
}

// Create singleton instance
const telemetryService = new TelemetryService();

export default telemetryService;
