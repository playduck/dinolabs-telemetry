const express = require('express');
const app = express();
const server = require('http').createServer(app);
const morgan = require('morgan');
const ip = require('ip');
const auth = require('basic-auth');
const bodyParser = require('body-parser');
const fs = require('fs');

const config = require('../config.json');
const secrets = require('../secrets.json');

const io = require('../common/socket');
const routes = require('../common/routes');
const pb = require('../common/protobuf');

const TAG = 'INET';

const stream = fs.createWriteStream(`./spacelabs-${Date.now()}-server.log`);

// Logging middleware
app.use(morgan('dev'));

// Basic Auth middleware
const authMiddleware = (req, res, next) => {
  const credentials = auth(req);
  if (!credentials || credentials.name !== secrets.tcp_api.auth.username ||
      credentials.pass !== secrets.tcp_api.auth.password) {

    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
    return res.status(401).send('Access denied. Invalid Username or Password');
  }
  next();
};

app.use(bodyParser.json());
app.use(bodyParser.raw({ type: 'application/octet-stream' }));

app.post("/" + config.tcp_api.endpoint_url, authMiddleware, (req, res) => {
  if (req.body instanceof Buffer) {
    // Parse the binary buffer with Protobuf
    const msg = pb.parseMessage(req.body);
    // Send the parsed message as JSON via Websocket
    if(msg != undefined)  {
      const msg_json = JSON.stringify(msg);
      io.emit('message', msg_json);
      // Log compact: timestamp + message type only
      const timestamp = new Date().toISOString();
      stream.write(`${timestamp} MSG: ${req.body.typeName || 'unknown'}\n`);
      console.log(TAG, "Binary message received, parsed and forwarded via websocket");
      res.status(200).send(`Binary Message received and sent via Websocket`);
    } else  {
      io.emit('bad-message');
      console.error(TAG, "Failed to parse binary protobuf message");
      res.status(400).send(`Could not parse binary protobuf: ${msg}`)
    }
  }
  else if (typeof req.body === 'object') {
    // Send the JSON object via Websocket (TLM messages come this way from GSE)
    const msg_json = JSON.stringify(req.body);
    io.emit('message', msg_json);
    // Log compact: timestamp + message type only
    const timestamp = new Date().toISOString();
    stream.write(`${timestamp} MSG: ${req.body.typeName || 'unknown'}\n`);
    console.log(TAG, "JSON message received and forwarded via websocket:", req.body.typeName || 'unknown');
    res.status(200).send('JSON Message received and sent via Websocket');
  }
  else {
    console.error(TAG, "Invalid request body type:", typeof req.body);
    res.status(400).send(`Invalid request body type: ${typeof req.body}`);
  }
});

// Use routes
app.use(routes);

// Start the server
server.listen(config.public_server.port, () => {
  console.log(
      TAG,
      `Server is running at ${config.tcp_api.protocol}://${ip.address()}:${
          config.public_server.port}/`);
});
io.listen(server);
