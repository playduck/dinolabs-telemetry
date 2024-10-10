const io = require('socket.io')();

io.on('connection', (socket) => {
  console.log('New client connected');

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });

  // Handle messages from clients
  socket.on('message', (message) => {
    console.log(`Received message: ${message}`);
  });

  // handle heartbeat messages for RTT
  socket.on("heartbeat-request", (heartbeatRequestTime) => {
    socket.emit("heartbeat-response", Date.now());
  });

});

module.exports = io;
