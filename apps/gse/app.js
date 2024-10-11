const express = require('express');
const app = express();
const server = require('http').createServer(app);
const morgan = require("morgan");
const ip = require("ip");

const config = require("../config.json");

const tcpp = require('./tcpp');
const tcpc = require('./tcpc');
const io = require('../common/socket');
const routes = require("../common/routes");
const pb = require("../common/protobuf")

const TAG = "LOCAL";

// Logging middleware
app.use(morgan("dev"));

// Use routes
app.use(routes);

tcpc.emitter.on("message", (buffer) => {
  const msg = pb.parseMessage(buffer);
  if(msg != undefined)  {
    const msg_json = JSON.stringify(msg);
    io.emit("message", msg_json)
    tcpp.post(msg_json);
    console.log(msg_json)
  } else  {
    io.emit('bad-message');
    tcpp.post(buffer);
  }
})

// Start the server
server.listen(config.local_server.port, () => {
  console.log(TAG, `Server is running at http://${ip.address()}:${config.local_server.port}/`);
});
io.listen(server);
