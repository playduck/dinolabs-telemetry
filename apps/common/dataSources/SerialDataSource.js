const EventEmitter = require('node:events');

// Optional serialport dependency - install with: npm install serialport
const SerialPort = require('serialport').SerialPort;

class SerialDataSource extends EventEmitter {
    constructor(config) {
        super();
        this.config = config;
        this.TAG = "SERIAL_SOURCE";
        this.reconnectInterval = this.config.reconnectInterval || 5000;
        this.retryCount = 0;
        this.isConnected = false;
        this.isConnecting = false;
        this.reconnectTimer = null;
        this.statsTimer = null;
        this.isReconnectScheduled = false;

        this.buffer = Buffer.alloc(0);

        // Statistics tracking
        this.stats = {
            connectTime: null,
            totalConnections: 0,
            totalReconnections: 0,
            bytesReceived: 0,
            messagesReceived: 0,
            lastDataTime: null,
            connectionUptime: 0,
            totalUptime: 0
        };

        this.setupSerial();
        this.startStatsLogging();
    }

    setupSerial() {
        if (!SerialPort) {
            throw new Error('SerialPort not available. Install with: npm install serialport');
        }

        console.log(this.TAG, `Setting up serial connection to ${this.config.port} at ${this.config.baudRate || 115200} baud`);

        this.serialPort = new SerialPort({
            path: this.config.port,
            baudRate: this.config.baudRate || 115200,
            dataBits: this.config.dataBits || 8,
            parity: this.config.parity || 'none',
            stopBits: this.config.stopBits || 1,
            autoOpen: false
        });

        this.serialPort.on('open', this.onConnect.bind(this));
        this.serialPort.on('data', this.onData.bind(this));
        this.serialPort.on('error', this.onError.bind(this));
        this.serialPort.on('close', this.onClose.bind(this));
    }

    onConnect() {
        console.log(this.TAG, 'Connected to serial source');
        this.isConnected = true;
        this.isConnecting = false;
        this.isReconnectScheduled = false;

        // Update statistics
        this.stats.connectTime = Date.now();
        this.stats.totalConnections++;
        if (this.retryCount > 0) {
            this.stats.totalReconnections++;
        }
        this.retryCount = 0;

        this.emit('connected');
    }

    onData(data) {
        // Update statistics
        this.stats.bytesReceived += data.length;
        this.stats.messagesReceived++;
        this.stats.lastDataTime = Date.now();

        this.emit('data', data);
    }

    onError(err) {
        console.error(this.TAG, 'Serial error occurred:', err.message);
        this.isConnected = false;
        this.isConnecting = false;

        if (this.serialPort) {
            this.serialPort.close();
        }

        this.scheduleReconnect();
    }

    onClose() {
        console.log(this.TAG, 'Serial connection closed');

        // Update uptime statistics
        if (this.stats.connectTime) {
            const sessionUptime = Date.now() - this.stats.connectTime;
            this.stats.totalUptime += sessionUptime;
            this.stats.connectTime = null;
        }

        this.isConnected = false;
        this.isConnecting = false;
        this.emit('disconnected');
        this.scheduleReconnect();
    }

    scheduleReconnect() {
        if (this.config.autoReconnect === false) {
            console.log(this.TAG, 'Auto-reconnect disabled');
            return;
        }

        // Prevent duplicate reconnection attempts
        if (this.isReconnectScheduled) {
            return;
        }

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        this.isReconnectScheduled = true;
        this.retryCount++;
        console.log(this.TAG, `Scheduling reconnect in ${this.reconnectInterval}ms (attempt ${this.retryCount})...`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.isReconnectScheduled = false;
            this.attemptConnection();
        }, this.reconnectInterval);
    }

    attemptConnection() {
        if (this.isConnected || this.isConnecting) {
            return;
        }

        console.log(this.TAG, `Attempting connection (attempt ${this.retryCount})...`);
        this.isConnecting = true;
        this.setupSerial();

        try {
            this.serialPort.open((err) => {
                if (err) {
                    console.error(this.TAG, 'Failed to open serial port:', err.message);
                    this.isConnecting = false;
                    this.scheduleReconnect();
                }
            });
        } catch (err) {
            console.error(this.TAG, 'Failed to initiate serial connection:', err.message);
            this.isConnecting = false;
            this.scheduleReconnect();
        }
    }

    start() {
        console.log(this.TAG, 'Starting serial connection...');

        if (this.isConnected || this.isConnecting) {
            console.log(this.TAG, 'Serial connection already established or connecting');
            return;
        }

        this.retryCount = 0;
        this.attemptConnection();
    }

    stop() {
        console.log(this.TAG, 'Stopping serial connection...');

        this.config.autoReconnect = false;

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.statsTimer) {
            clearInterval(this.statsTimer);
            this.statsTimer = null;
        }

        // Final stats update
        if (this.stats.connectTime) {
            const sessionUptime = Date.now() - this.stats.connectTime;
            this.stats.totalUptime += sessionUptime;
        }

        this.logFinalStatistics();

        if (this.serialPort && this.serialPort.isOpen) {
            this.serialPort.close();
        }

        this.isConnected = false;
        this.isConnecting = false;
        this.isReconnectScheduled = false;
    }

    /**
     * Send data (for testing or bidirectional communication)
     */
    send(data) {
        if (!this.isConnected) {
            console.error(this.TAG, 'Cannot send data: not connected');
            return false;
        }

        try {
            this.serialPort.write(data);
            return true;
        } catch (error) {
            console.error(this.TAG, 'Failed to send data:', error.message);
            return false;
        }
    }

    /**
     * Start periodic statistics logging
     */
    startStatsLogging() {
        // Check if statistics are enabled
        if (this.config.statsEnabled === false) {
            return;
        }

        const interval = this.config.statsInterval || 30000; // Default 30 seconds
        if (interval > 0) {
            this.statsTimer = setInterval(() => {
                this.logStatistics();
            }, interval);
        }
    }

    /**
     * Log current statistics
     */
    logStatistics() {
        const now = Date.now();
        let currentUptime = 0;
        if (this.stats.connectTime) {
            currentUptime = now - this.stats.connectTime;
        }

        const totalUptime = this.stats.totalUptime + currentUptime;
        const timeSinceLastData = this.stats.lastDataTime ? now - this.stats.lastDataTime : null;

        console.log(`${this.TAG} Statistics:`);
        console.log(`  Status: ${this.isConnected ? 'Connected' : 'Disconnected'}`);
        console.log(`  Total connections: ${this.stats.totalConnections}`);
        console.log(`  Reconnections: ${this.stats.totalReconnections}`);
        console.log(`  Current uptime: ${this.formatDuration(currentUptime)}`);
        console.log(`  Total uptime: ${this.formatDuration(totalUptime)}`);
        console.log(`  Bytes received: ${this.stats.bytesReceived.toLocaleString()}`);
        console.log(`  Messages received: ${this.stats.messagesReceived.toLocaleString()}`);
        if (timeSinceLastData !== null) {
            console.log(`  Time since last data: ${this.formatDuration(timeSinceLastData)}`);
        }
        if (this.stats.messagesReceived > 0 && totalUptime > 0) {
            const msgRate = (this.stats.messagesReceived / (totalUptime / 1000)).toFixed(2);
            const byteRate = (this.stats.bytesReceived / (totalUptime / 1000)).toFixed(2);
            console.log(`  Message rate: ${msgRate} msg/s`);
            console.log(`  Data rate: ${byteRate} bytes/s`);
        }
    }

    /**
     * Log final statistics on shutdown
     */
    logFinalStatistics() {
        if (this.config.statsEnabled === false) {
            return;
        }

        console.log(`${this.TAG} Final Statistics:`);
        console.log(`  Total connections: ${this.stats.totalConnections}`);
        console.log(`  Total reconnections: ${this.stats.totalReconnections}`);
        console.log(`  Total uptime: ${this.formatDuration(this.stats.totalUptime)}`);
        console.log(`  Total bytes received: ${this.stats.bytesReceived.toLocaleString()}`);
        console.log(`  Total messages received: ${this.stats.messagesReceived.toLocaleString()}`);
    }

    /**
     * Format duration in milliseconds to human readable string
     */
    formatDuration(ms) {
        if (ms < 1000) return `${ms}ms`;
        if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
        if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
        return `${(ms / 3600000).toFixed(1)}h`;
    }

    /**
     * Get connection status
     */
    getStatus() {
        const now = Date.now();
        let currentUptime = 0;
        if (this.stats.connectTime) {
            currentUptime = now - this.stats.connectTime;
        }

        return {
            connected: this.isConnected,
            type: 'serial',
            retryCount: this.retryCount,
            bufferSize: this.buffer.length,
            config: { port: this.config.port, baudRate: this.config.baudRate },
            stats: {
                ...this.stats,
                currentUptime,
                totalUptime: this.stats.totalUptime + currentUptime
            }
        };
    }
}

module.exports = SerialDataSource;
