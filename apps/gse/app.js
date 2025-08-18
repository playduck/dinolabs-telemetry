const express = require('express');
const app = express();
const server = require('http').createServer(app);
const morgan = require("morgan");
const ip = require("ip");
const fs = require("fs");
const { spawn } = require('child_process');

const config = require("../config.json");

const tcpp = require('./tcpp');
const io = require('../common/socket');
const routes = require("../common/routes");
const DataSourceFactory = require("../common/DataSourceFactory");
const ParserFactory = require("../common/parsers/ParserFactory");

const TAG = "LOCAL";

const stream = fs.createWriteStream(`./spacelabs-${Date.now()}-gse.log`);
let frontendWatcher = null;

// Test message to verify logging is working
const testMessage = `Hello world, GSE server started at ${new Date().toISOString()}\n`;
stream.write(testMessage);
console.log(TAG, "Test message written to log file:", testMessage.trim());

// Logging middleware
app.use(morgan("dev"));

// Use routes
app.use(routes);

// Create data source and parser based on active configuration
const activeDataSourceConfig = config.data_sources[config.active_data_source];
const activeParserConfig = config.parsers[config.active_parser];

if (!activeDataSourceConfig) {
  throw new Error(`Data source '${config.active_data_source}' not found in configuration`);
}

if (!activeParserConfig) {
  throw new Error(`Parser '${config.active_parser}' not found in configuration`);
}

const dataSource = DataSourceFactory.create(
  config.active_data_source,
  activeDataSourceConfig
);

const parser = ParserFactory.create(
  config.active_parser,
  activeParserConfig
);

console.log(TAG, `Using data source: ${config.active_data_source}, parser: ${config.active_parser}`);

// Set up message handling
dataSource.on("message", (buffer) => {
  // console.log(TAG, "Received message from data source, buffer length:", buffer.length);
  const msg = parser.parseMessage(buffer);
  if(msg != undefined) {
    // console.log(TAG, "Parsed message successfully:", msg);
    const msg_json = JSON.stringify(msg);
    io.emit("message", msg_json);
    tcpp.post(msg_json);
    // stream.write(msg_json + ",\n");
    // console.log(TAG, "Message logged to file and forwarded");
  } else {
    // console.log(TAG, "Failed to parse message, sending bad-message event");
    io.emit('bad-message');
    tcpp.post(buffer);
  }
});

// Start the frontend watcher
frontendWatcher = spawn('node', ['build-frontend.js', '--watch'], {
  cwd: process.cwd(),
  stdio: 'inherit'
});

frontendWatcher.on('error', (error) => {
  console.error(TAG, 'Frontend watcher error:', error);
});

frontendWatcher.on('exit', (code) => {
  console.log(TAG, `Frontend watcher exited with code ${code}`);
});

// Start the data source
dataSource.start();

// Start the server
server.listen(config.local_server.port, () => {
  console.log(TAG, `Server is running at http://${ip.address()}:${config.local_server.port}/`);
});
io.listen(server);

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(TAG, 'Shutting down GSE server...');
  if (frontendWatcher) {
    console.log(TAG, 'Terminating frontend watcher...');
    frontendWatcher.kill();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(TAG, 'Shutting down GSE server...');
  if (frontendWatcher) {
    console.log(TAG, 'Terminating frontend watcher...');
    frontendWatcher.kill();
  }
  process.exit(0);
});
