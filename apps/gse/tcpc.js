const config = require('../config.json');
const net = require('net');
const EventEmitter = require('node:events');

const emitter = new EventEmitter();

const client = new net.Socket();
const TAG = "TCPC";
const reconnectTimeout = 1000;  // fixed reconnect timeout
let retry_count = 0;

client.on('connect', onConnect);
client.on('data', onData);
client.on('error', onError);
client.on('close', onClose);

function onConnect() {
  console.log(TAG, 'Connected to the server');
  retry_count = 0;
}

function onData(data) {
  emitter.emit('message', data);
}

function onError(err) {
  console.error(TAG, 'Error occurred:', err.name);
  client.end()
}

function onClose() {
  console.log(TAG, 'Connection closed');
  reconnect();
}

function reconnect() {
  retry_count++;
  console.log(TAG, `Reconnecting to ${config.tcpc.host}:${config.tcpc.port} (${retry_count})...`);
  client.removeAllListeners();  // remove all event listeners
  client.on('connect', onConnect);
  client.on('data', onData);
  client.on('error', onError);
  client.on('close', onClose);
  setTimeout(() => {
    client.connect(config.tcpc.port, config.tcpc.host);
  }, reconnectTimeout);
}

console.log(TAG, `Starting client connection to ${config.tcpc.host}:${config.tcpc.port}`)
client.connect(config.tcpc.port, config.tcpc.host, () => {
    console.log(TAG, 'Connecting to the server...');
});

module.exports = {emitter};
