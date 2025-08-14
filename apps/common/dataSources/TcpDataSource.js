const net = require('net');
const EventEmitter = require('node:events');

class TcpDataSource extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.client = new net.Socket();
    this.TAG = "TCP_SOURCE";
    this.reconnectTimeout = 1000;
    this.retry_count = 0;
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.client.on('connect', this.onConnect.bind(this));
    this.client.on('data', this.onData.bind(this));
    this.client.on('error', this.onError.bind(this));
    this.client.on('close', this.onClose.bind(this));
  }

  onConnect() {
    console.log(this.TAG, 'Connected to the server');
    this.retry_count = 0;
  }

  onData(data) {
    this.emit('message', data);
  }

  onError(err) {
    console.error(this.TAG, 'Error occurred:', err.name);
    this.client.end();
  }

  onClose() {
    console.log(this.TAG, 'Connection closed');
    this.reconnect();
  }

  reconnect() {
    this.retry_count++;
    console.log(this.TAG, `Reconnecting to ${this.config.host}:${this.config.port} (${this.retry_count})...`);
    this.client.removeAllListeners();
    this.setupEventHandlers();
    setTimeout(() => {
      this.client.connect(this.config.port, this.config.host);
    }, this.reconnectTimeout);
  }

  start() {
    console.log(this.TAG, `Starting client connection to ${this.config.host}:${this.config.port}`);
    this.client.connect(this.config.port, this.config.host, () => {
      console.log(this.TAG, 'Connecting to the server...');
    });
  }

  stop() {
    this.client.end();
  }
}

module.exports = TcpDataSource;