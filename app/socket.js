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
});

module.exports = io;
