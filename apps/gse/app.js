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
dataSource.on("data", (buffer) => {
  // Log raw bytes with timestamp - much more compact than JSON
  const timestamp = new Date().toISOString();
  const hexBytes = Array.from(buffer).map(b => b.toString(16).padStart(2, '0')).join(' ');
  stream.write(`${timestamp} RAW[${buffer.length}]: ${hexBytes}\n`);

  const parsed = parser.parseMessage(buffer);
  if(parsed != undefined) {
    // Handle both single messages and arrays of messages
    const messages = Array.isArray(parsed) ? parsed : [parsed];

    for (const msg of messages) {
      // console.log(TAG, `Parsed ${msg.typeName} message successfully:`, {
      //   type: msg.typeName,
      //   timestamp: new Date(msg.timestamp).toISOString(),
      //   isValid: msg.isValid
      // });

      const msg_json = JSON.stringify(msg);

      // Send via websocket
      io.emit("message", msg_json);

      // Forward to inet server
      tcpp.post(msg_json);
    }

    // console.log(TAG, `Processed ${messages.length} message(s) from buffer`);
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

  // Flush any remaining batched messages
  tcpp.shutdown();

  // Stop data source and parser
  if (dataSource && typeof dataSource.stop === 'function') {
    dataSource.stop();
  }
  if (parser && typeof parser.stop === 'function') {
    parser.stop();
  }

  if (frontendWatcher) {
    console.log(TAG, 'Terminating frontend watcher...');
    frontendWatcher.kill();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(TAG, 'Shutting down GSE server...');

  // Flush any remaining batched messages
  tcpp.shutdown();

  // Stop data source and parser
  if (dataSource && typeof dataSource.stop === 'function') {
    dataSource.stop();
  }
  if (parser && typeof parser.stop === 'function') {
    parser.stop();
  }

  if (frontendWatcher) {
    console.log(TAG, 'Terminating frontend watcher...');
    frontendWatcher.kill();
  }
  process.exit(0);
});
