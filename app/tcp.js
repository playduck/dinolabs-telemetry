const config = require('./config.json');
const net = require('net');
const EventEmitter = require('node:events');

const emitter = new EventEmitter();

const client = new net.Socket();
const reconnectTimeout = 1000;  // fixed reconnect timeout
let retry_count = 0;

client.on('connect', onConnect);
client.on('data', onData);
client.on('error', onError);
client.on('close', onClose);

function onConnect() {
  console.log('Connected to the server');
  retry_count = 0;
}

function onData(data) {
  emitter.emit('message', data);
}

function onError(err) {
  console.error('Error occurred:', err);
  client.end()
}

function onClose() {
  console.log('Connection closed');
  reconnect();
}

function reconnect() {
  retry_count++;
  console.log(`Reconnecting to ${config.tcp.host}:${config.tcp.port} (${retry_count})...`);
  client.removeAllListeners();  // remove all event listeners
  client.on('connect', onConnect);
  client.on('data', onData);
  client.on('error', onError);
  client.on('close', onClose);
  setTimeout(() => {
    client.connect(config.tcp.port, config.tcp.host);
  }, reconnectTimeout);
}

console.log(`Starting client connection to ${config.tcp.host}:${config.tcp.port}`)
client.connect(config.tcp.port, config.tcp.host, () => {
    console.log('Connecting to the server...');
});

module.exports = {emitter};
