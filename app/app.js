const express = require('express');
const app = express();
const server = require('http').createServer(app);
const morgan = require("morgan");
const ip = require("ip");

const config = require("./config.json");

const tcp = require('./tcp');
const io = require('./socket');
const routes = require("./routes");
const pb = require("./protobuf")

// Logging middleware
app.use(morgan("dev"));

// Use routes
app.use(routes);

tcp.emitter.on("message", (buffer) => {
  console.log(buffer.toString('hex').match(/../g).join(' '));
  const msg = pb.parseMessage(buffer);
  io.emit("message", JSON.stringify(msg))
})

// Start the server
server.listen(config.server.port, () => {
  console.log(`Server is running at http://${ip.address()}:${config.server.port}/`);
});
io.listen(server);
