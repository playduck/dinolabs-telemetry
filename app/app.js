const port = 3000;

const express = require('express');
const app = express();
const server = require('http').createServer(app);
const morgan = require("morgan");

const opc = require('./opc');
const io = require('./socket');
const routes = require("./routes");
const pb = require("./protobuf")

// Logging middleware
app.use(morgan("dev"));

// Use routes
app.use(routes);

opc.emitter.on("message", (buffer) => {
  const msg = pb.parseMessage(buffer);
  io.emit("message", JSON.stringify(msg))
})

// Start the server
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
io.listen(server);
