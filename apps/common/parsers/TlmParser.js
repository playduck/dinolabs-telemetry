const IParser = require('../interfaces/IParser');

// Message type definitions from Python messages.py
const MSG_TEC = 0x51;
const MSG_POWER = 0x52;
const MSG_SYS = 0x53;
const MSG_EXP1 = 0x54;
const MSG_EXP2 = 0x55;
const MSG_EXP_IMU = 0x56;
const MSG_FCS = 0x01;

const MESSAGE_TYPE_NAMES = {
    [MSG_TEC]: "TEC",
    [MSG_POWER]: "POWER",
    [MSG_SYS]: "SYSTEM",
    [MSG_EXP1]: "EXP1",
    [MSG_EXP2]: "EXP2",
    [MSG_EXP_IMU]: "EXPIMU",
    [MSG_FCS]: "FCS"
};

/**
 * Helper class for packing/unpacking bit fields
 */
class BitField {
    constructor(fields) {
        this.fields = fields; // Array of {name, width, multiplier, unit}
        this.totalBits = fields.reduce((sum, field) => sum + field.width, 0);

        if (this.totalBits > 64) {
            throw new Error(`Total bits ${this.totalBits} exceeds 64`);
        }

        // Build field info lookup
        this.fieldInfo = {};
        for (const field of fields) {
            this.fieldInfo[field.name] = {
                width: field.width,
                multiplier: field.multiplier,
                unit: field.unit,
                maxRaw: (1 << field.width) - 1
            };
        }
    }

    /**
     * Unpack 8 bytes of data into field values
     */
    unpack(data) {
        if (data.length !== 8) {
            throw new Error(`Expected 8 bytes, got ${data.length}`);
        }

        // Convert bytes to 64-bit integer (little endian)
        let packed = 0n;
        for (let i = 0; i < 8; i++) {
            packed |= BigInt(data[i]) << BigInt(i * 8);
        }

        const values = {};
        let bitPos = this.totalBits;

        for (const field of this.fields) {
            bitPos -= field.width;
            const mask = (1n << BigInt(field.width)) - 1n;
            values[field.name] = Number((packed >> BigInt(bitPos)) & mask);
        }

        return values;
    }

    /**
     * Unpack to real-world values with units
     */
    unpackRealValues(data) {
        const rawValues = this.unpack(data);
        const realValues = {};

        for (const [name, rawValue] of Object.entries(rawValues)) {
            if (name in this.fieldInfo) {
                const info = this.fieldInfo[name];
                realValues[name] = {
                    raw: rawValue,
                    real: rawValue / info.multiplier,
                    unit: info.unit
                };
            } else {
                realValues[name] = { raw: rawValue, real: rawValue, unit: '' };
            }
        }

        return realValues;
    }

    /**
     * Format a field value for display
     */
    displayValue(fieldName, rawValue) {
        if (fieldName in this.fieldInfo) {
            const info = this.fieldInfo[fieldName];
            const realValue = rawValue / info.multiplier;
            if (info.unit) {
                return `${realValue.toFixed(2)} ${info.unit}`;
            }
            return realValue.toFixed(2);
        }
        return String(rawValue);
    }
}

/**
 * Message class definitions
 */
class TecMessage {
    static bitfield = new BitField([
        {name: 'cold_side_temp', width: 16, multiplier: 100.0, unit: '°C'},
        {name: 'hot_side_temp', width: 13, multiplier: 100.0, unit: '°C'},
        {name: 'tec_voltage', width: 10, multiplier: 100.0, unit: 'V'},
        {name: 'tec_current', width: 9, multiplier: 100.0, unit: 'A'},
        {name: 'fan_pwm', width: 8, multiplier: 1.0, unit: '%'},
        {name: 'stats_byte', width: 8, multiplier: 1.0, unit: ''}
    ]);

    constructor(data) {
        const values = TecMessage.bitfield.unpack(data);
        Object.assign(this, values);
        this.messageType = MSG_TEC;
    }

    getRealValues() {
        const realValues = {};
        for (const [fieldName, value] of Object.entries(this)) {
            if (fieldName !== 'messageType' && TecMessage.bitfield.fieldInfo[fieldName]) {
                const info = TecMessage.bitfield.fieldInfo[fieldName];
                realValues[fieldName] = {
                    raw: value,
                    real: value / info.multiplier,
                    unit: info.unit
                };
            }
        }
        return realValues;
    }
}

class PowerMessage {
    static bitfield = new BitField([
        {name: 'battery_voltage', width: 12, multiplier: 200.0, unit: 'V'},
        {name: 'battery_current', width: 6, multiplier: 6.4, unit: 'A'},
        {name: 'rail_12v_voltage', width: 8, multiplier: 17.0, unit: 'V'},
        {name: 'rail_12v_current', width: 5, multiplier: 6.4, unit: 'A'},
        {name: 'rail_5v_voltage', width: 7, multiplier: 21.0, unit: 'V'},
        {name: 'rail_5v_current', width: 5, multiplier: 10.0, unit: 'A'},
        {name: 'rail_3v3_voltage', width: 6, multiplier: 10.0, unit: 'V'},
        {name: 'rail_3v3_current', width: 5, multiplier: 16.0, unit: 'A'},
        {name: 'status_byte', width: 6, multiplier: 1.0, unit: ''}
    ]);

    constructor(data) {
        const values = PowerMessage.bitfield.unpack(data);
        Object.assign(this, values);
        this.messageType = MSG_POWER;
    }

    getRealValues() {
        const realValues = {};
        for (const [fieldName, value] of Object.entries(this)) {
            if (fieldName !== 'messageType' && PowerMessage.bitfield.fieldInfo[fieldName]) {
                const info = PowerMessage.bitfield.fieldInfo[fieldName];
                realValues[fieldName] = {
                    raw: value,
                    real: value / info.multiplier,
                    unit: info.unit
                };
            }
        }
        return realValues;
    }
}

class SysMessage {
    static bitfield = new BitField([
        {name: 'cpu_load', width: 7, multiplier: 1.28, unit: '%'},
        {name: 'storage_capacity', width: 7, multiplier: 1.28, unit: '%'},
        {name: 'soc', width: 7, multiplier: 1.28, unit: '%'},
        {name: 'ext_fan_pwm', width: 8, multiplier: 1.0, unit: ''},
        {name: 'epoch', width: 19, multiplier: 1.0, unit: 's'},
        {name: 'charge_voltage', width: 8, multiplier: 6.0, unit: 'V'},
        {name: 'status_byte', width: 8, multiplier: 1.0, unit: ''}
    ]);

    constructor(data) {
        const values = SysMessage.bitfield.unpack(data);
        Object.assign(this, values);
        this.messageType = MSG_SYS;
    }

    getRealValues() {
        const realValues = {};
        for (const [fieldName, value] of Object.entries(this)) {
            if (fieldName !== 'messageType' && SysMessage.bitfield.fieldInfo[fieldName]) {
                const info = SysMessage.bitfield.fieldInfo[fieldName];
                realValues[fieldName] = {
                    raw: value,
                    real: value / info.multiplier,
                    unit: info.unit
                };
            }
        }
        return realValues;
    }
}

class Exp1Message {
    static bitfield = new BitField([
        {name: 'c0_min', width: 11, multiplier: 1.0, unit: 'counts'},
        {name: 'c0_max', width: 10, multiplier: 1.0, unit: 'counts'},
        {name: 'c1_min', width: 11, multiplier: 1.0, unit: 'counts'},
        {name: 'c1_max', width: 10, multiplier: 1.0, unit: 'counts'},
        {name: 'c2_min', width: 11, multiplier: 1.0, unit: 'counts'},
        {name: 'c2_max', width: 10, multiplier: 1.0, unit: 'counts'}
    ]);

    constructor(data) {
        const values = Exp1Message.bitfield.unpack(data);
        Object.assign(this, values);
        this.messageType = MSG_EXP1;
    }

    getRealValues() {
        const realValues = {};
        for (const [fieldName, value] of Object.entries(this)) {
            if (fieldName !== 'messageType' && Exp1Message.bitfield.fieldInfo[fieldName]) {
                const info = Exp1Message.bitfield.fieldInfo[fieldName];
                realValues[fieldName] = {
                    raw: value,
                    real: value / info.multiplier,
                    unit: info.unit
                };
            }
        }
        return realValues;
    }
}

class Exp2Message {
    static bitfield = new BitField([
        {name: 'c3_min', width: 11, multiplier: 1.0, unit: 'counts'},
        {name: 'c3_max', width: 10, multiplier: 1.0, unit: 'counts'},
        {name: 'c4_min', width: 11, multiplier: 1.0, unit: 'counts'},
        {name: 'c4_max', width: 10, multiplier: 1.0, unit: 'counts'},
        {name: 'c5_min', width: 11, multiplier: 1.0, unit: 'counts'},
        {name: 'c5_max', width: 10, multiplier: 1.0, unit: 'counts'}
    ]);

    constructor(data) {
        const values = Exp2Message.bitfield.unpack(data);
        Object.assign(this, values);
        this.messageType = MSG_EXP2;
    }

    getRealValues() {
        const realValues = {};
        for (const [fieldName, value] of Object.entries(this)) {
            if (fieldName !== 'messageType' && Exp2Message.bitfield.fieldInfo[fieldName]) {
                const info = Exp2Message.bitfield.fieldInfo[fieldName];
                realValues[fieldName] = {
                    raw: value,
                    real: value / info.multiplier,
                    unit: info.unit
                };
            }
        }
        return realValues;
    }
}

class ExpImuMessage {
    static bitfield = new BitField([
        {name: 'acc_x_max', width: 10, multiplier: 1.0, unit: 'g'},
        {name: 'acc_y_max', width: 10, multiplier: 1.0, unit: 'g'},
        {name: 'acc_z_max', width: 10, multiplier: 1.0, unit: 'g'},
        {name: 'mag_x', width: 10, multiplier: 1.0, unit: 'mT'},
        {name: 'mag_y', width: 10, multiplier: 1.0, unit: 'mT'},
        {name: 'mag_z', width: 10, multiplier: 1.0, unit: 'mT'},
        {name: 'led_states', width: 2, multiplier: 1.0, unit: ''},
        {name: 'hi_lo_g_flag', width: 1, multiplier: 1.0, unit: ''}
    ]);

    constructor(data) {
        const values = ExpImuMessage.bitfield.unpack(data);
        Object.assign(this, values);
        this.messageType = MSG_EXP_IMU;
    }

    getRealValues() {
        const realValues = {};
        for (const [fieldName, value] of Object.entries(this)) {
            if (fieldName !== 'messageType' && ExpImuMessage.bitfield.fieldInfo[fieldName]) {
                const info = ExpImuMessage.bitfield.fieldInfo[fieldName];
                realValues[fieldName] = {
                    raw: value,
                    real: value / info.multiplier,
                    unit: info.unit
                };
            }
        }
        return realValues;
    }
}

class FCSMessage {
    static bitfield = new BitField([
        {name: 'fcs_state', width: 8, multiplier: 1.0, unit: ''}
    ]);

    constructor(data) {
        const values = FCSMessage.bitfield.unpack(data);
        Object.assign(this, values);
        this.messageType = MSG_FCS;
    }

    getRealValues() {
        const realValues = {};
        for (const [fieldName, value] of Object.entries(this)) {
            if (fieldName !== 'messageType' && FCSMessage.bitfield.fieldInfo[fieldName]) {
                const info = FCSMessage.bitfield.fieldInfo[fieldName];
                realValues[fieldName] = {
                    raw: value,
                    real: value / info.multiplier,
                    unit: info.unit
                };
            }
        }
        return realValues;
    }
}

// Message registry
const MESSAGES = {
    [MSG_TEC]: TecMessage,
    [MSG_POWER]: PowerMessage,
    [MSG_SYS]: SysMessage,
    [MSG_EXP1]: Exp1Message,
    [MSG_EXP2]: Exp2Message,
    [MSG_EXP_IMU]: ExpImuMessage,
    [MSG_FCS]: FCSMessage
};

/**
 * TLM Parser for the new telemetry interface
 */
class TlmParser extends IParser {
    constructor(config) {
        super();
        this.config = config;
        this.TAG = "TLM_PARSER";

        // Buffer for handling partial messages
        this.buffer = Buffer.alloc(0);
        this.statsTimer = null;

        // Statistics tracking
        this.stats = {
            totalMessages: 0,
            validMessages: 0,
            invalidMessages: 0,
            parityErrors: 0,
            unknownMessageTypes: 0,
            bytesProcessed: 0,
            messageTypeCounts: {},
            lastMessageTime: null,
            startTime: Date.now()
        };

        // Initialize message type counters
        for (const [msgType, typeName] of Object.entries(MESSAGE_TYPE_NAMES)) {
            this.stats.messageTypeCounts[typeName] = 0;
        }
        this.stats.messageTypeCounts['UNKNOWN'] = 0;

        this.startStatsLogging();
    }

    /**
     * Calculate parity for data validation
     */
    _calculateParity(data) {
        let parity = 0;
        for (const byte of data) {
            const bitCount = byte.toString(2).split('1').length - 1;
            parity += bitCount;
        }
        return parity;
    }

    /**
     * Parse a single 10-byte TLM wire format message
     * Format: [TYPE][8-BYTE DATA][PARITY]
     */
    _parseSingleMessage(buffer) {
        try {
            this.stats.totalMessages++;
            this.stats.lastMessageTime = Date.now();

            if (buffer.length !== 10) {
                this.stats.invalidMessages++;
                return undefined;
            }

            const msgType = buffer[0];
            const data = buffer.slice(1, 9);
            const receivedParity = buffer[9];

            // Validate parity
            const expectedParity = this._calculateParity(buffer.slice(0, 9));
            const isValid = (receivedParity === expectedParity);

            if (!isValid) {
                this.stats.parityErrors++;
                this.stats.invalidMessages++;
                console.error(this.TAG, `Parity check failed for message type 0x${msgType.toString(16).toUpperCase()}`);
                return undefined;
            }

            this.stats.validMessages++;

            // Get message name
            const messageName = MESSAGE_TYPE_NAMES[msgType] || `UNKNOWN_0x${msgType.toString(16).toUpperCase()}`;

            // Update message type statistics
            if (msgType in MESSAGE_TYPE_NAMES) {
                this.stats.messageTypeCounts[messageName]++;
            } else {
                this.stats.unknownMessageTypes++;
                this.stats.messageTypeCounts['UNKNOWN']++;
            }

            // Parse message data
            if (msgType in MESSAGES) {
                const MessageClass = MESSAGES[msgType];
                const message = new MessageClass(data);
                const realValues = message.getRealValues ? message.getRealValues() : {};

                return {
                    type: msgType,
                    typeName: messageName,
                    data: message,
                    realValues: realValues,
                    raw: Array.from(buffer),
                    isValid: isValid,
                    timestamp: Date.now()
                };
            } else {
                console.warn(this.TAG, `Unknown message type: 0x${msgType.toString(16).toUpperCase()}`);
                return {
                    type: msgType,
                    typeName: messageName,
                    data: Array.from(data),
                    realValues: {},
                    raw: Array.from(buffer),
                    isValid: isValid,
                    timestamp: Date.now()
                };
            }
        } catch (error) {
            this.stats.invalidMessages++;
            console.error(this.TAG, "Failed to parse single TLM message:", error);
            return undefined;
        }
    }

    /**
     * Parse TLM buffer that may contain multiple 10-byte messages
     * Handles buffering and message boundary detection
     */
    parseMessage(buffer) {
        try {
            // Track bytes processed
            this.stats.bytesProcessed += buffer.length;

            // Add new data to buffer
            this.buffer = Buffer.concat([this.buffer, buffer]);

            const messages = [];

            // Process complete 10-byte messages
            while (this.buffer.length >= 10) {
                const messageBuffer = this.buffer.slice(0, 10);
                this.buffer = this.buffer.slice(10);

                const parsed = this._parseSingleMessage(messageBuffer);
                if (parsed) {
                    messages.push(parsed);
                }
            }

            // Return array of parsed messages or undefined if no complete messages
            if (messages.length === 0) {
                return undefined;
            } else if (messages.length === 1) {
                return messages[0]; // Maintain backward compatibility
            } else {
                // Return array for multiple messages
                return messages;
            }
        } catch (error) {
            console.error(this.TAG, "Failed to parse TLM buffer:", error);
            return undefined;
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
     * Log current parsing statistics
     */
    logStatistics() {
        const now = Date.now();
        const runtimeMs = now - this.stats.startTime;
        const timeSinceLastMessage = this.stats.lastMessageTime ? now - this.stats.lastMessageTime : null;

        console.log(`${this.TAG} Statistics:`);
        console.log(`  Runtime: ${this.formatDuration(runtimeMs)}`);
        console.log(`  Total messages processed: ${this.stats.totalMessages.toLocaleString()}`);
        console.log(`  Valid messages: ${this.stats.validMessages.toLocaleString()}`);
        console.log(`  Invalid messages: ${this.stats.invalidMessages.toLocaleString()}`);
        console.log(`  Parity errors: ${this.stats.parityErrors.toLocaleString()}`);
        console.log(`  Unknown message types: ${this.stats.unknownMessageTypes.toLocaleString()}`);
        console.log(`  Bytes processed: ${this.stats.bytesProcessed.toLocaleString()}`);
        console.log(`  Buffer size: ${this.buffer.length} bytes`);

        if (this.stats.totalMessages > 0) {
            const successRate = ((this.stats.validMessages / this.stats.totalMessages) * 100).toFixed(1);
            console.log(`  Success rate: ${successRate}%`);
            const errorRate = ((this.stats.invalidMessages / this.stats.totalMessages) * 100).toFixed(1);
            console.log(`  Error rate: ${errorRate}%`);
        }

        if (timeSinceLastMessage !== null) {
            console.log(`  Time since last message: ${this.formatDuration(timeSinceLastMessage)}`);
        }

        if (this.stats.validMessages > 0 && runtimeMs > 0) {
            const msgRate = (this.stats.validMessages / (runtimeMs / 1000)).toFixed(2);
            const byteRate = (this.stats.bytesProcessed / (runtimeMs / 1000)).toFixed(2);
            console.log(`  Message rate: ${msgRate} msg/s`);
            console.log(`  Data rate: ${byteRate} bytes/s`);
        }

        // Message type breakdown
        console.log(`  Message type breakdown:`);
        for (const [typeName, count] of Object.entries(this.stats.messageTypeCounts)) {
            if (count > 0) {
                const percentage = this.stats.validMessages > 0 ?
                    ((count / this.stats.validMessages) * 100).toFixed(1) : '0.0';
                console.log(`    ${typeName}: ${count.toLocaleString()} (${percentage}%)`);
            }
        }
    }

    /**
     * Log final statistics on shutdown
     */
    logFinalStatistics() {
        if (this.config.statsEnabled === false) {
            return;
        }

        const runtimeMs = Date.now() - this.stats.startTime;

        console.log(`${this.TAG} Final Statistics:`);
        console.log(`  Total runtime: ${this.formatDuration(runtimeMs)}`);
        console.log(`  Total messages processed: ${this.stats.totalMessages.toLocaleString()}`);
        console.log(`  Valid messages: ${this.stats.validMessages.toLocaleString()}`);
        console.log(`  Invalid messages: ${this.stats.invalidMessages.toLocaleString()}`);
        console.log(`  Parity errors: ${this.stats.parityErrors.toLocaleString()}`);
        console.log(`  Unknown message types: ${this.stats.unknownMessageTypes.toLocaleString()}`);
        console.log(`  Total bytes processed: ${this.stats.bytesProcessed.toLocaleString()}`);

        if (this.stats.totalMessages > 0) {
            const successRate = ((this.stats.validMessages / this.stats.totalMessages) * 100).toFixed(1);
            console.log(`  Overall success rate: ${successRate}%`);
        }

        // Final message type breakdown
        console.log(`  Final message type counts:`);
        for (const [typeName, count] of Object.entries(this.stats.messageTypeCounts)) {
            if (count > 0) {
                console.log(`    ${typeName}: ${count.toLocaleString()}`);
            }
        }
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
     * Stop statistics logging and print final stats
     */
    stop() {
        if (this.statsTimer) {
            clearInterval(this.statsTimer);
            this.statsTimer = null;
        }
        this.logFinalStatistics();
    }

    /**
     * Get supported message types
     */
    getSupportedTypes() {
        return MESSAGE_TYPE_NAMES;
    }
}

module.exports = TlmParser;
