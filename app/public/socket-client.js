import {io} from 'socket.io';

const socket = io('http://localhost:3000');

const socketClient = {
  onConnect: () => {
    socket.on('connect', () => {
      console.log('Connected to the server');
    });
  },

  onDisconnect: () => {
    socket.on('disconnect', () => {
      console.log('Disconnected from the server');
    });
  },

  onMessage: (callback) => {
    socket.on('message', (message) => {
      callback(message);
    });
  },

  sendMessage: (message) => {
    socket.emit('message', message);
  },
};

export default socketClient;
