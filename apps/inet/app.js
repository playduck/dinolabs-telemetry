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
const pb = require('../common/protobuf')

const TAG = 'INET';

// Create a log file if it does not exist
const logFile = 'server.log';
if (!fs.existsSync(logFile)) {
  fs.writeFileSync(logFile, '');
}

// Logging middleware
const logStream = fs.createWriteStream(logFile, { flags: 'a' });
app.use(morgan('dev', { stream: logStream }));

// Basic Auth middleware
const authMiddleware = (req, res, next) => {
  const credentials = auth(req);
  if (!credentials || credentials.name !== secrets.tcp_api.auth.username ||
      credentials.pass !== secrets.tcp_api.auth.password) {

    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
    return res.status(401).send('Access denied');
  }
  next();
};

app.use(bodyParser.json());
app.use(bodyParser.raw({ type: 'application/octet-stream' }));

app.post(config.tcp_api.endpoint_url, authMiddleware, (req, res) => {
  if (req.body instanceof Buffer) {
    // Parse the binary buffer with Protobuf
    const msg = pb.parseMessage(req.body);
    // Send the parsed message as JSON via Websocket
    io.emit('message', JSON.stringify(msg));
    res.status(200).send('Binary Message received and sent via Websocket');
  }
  else if (typeof req.body === 'object') {
    // Send the JSON object via Websocket
    io.emit('message', JSON.stringify(req.body));
    res.status(200).send('JSON Message received and sent via Websocket');
  }
  else {
    res.status(400).send('Invalid request body');
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
