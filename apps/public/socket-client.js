import {io} from 'socket.io';

const rttElement = document.getElementById("connection");
let rtt = undefined;
const rtt_lowpass = 0.75;
const heartbeatIntervalMs = 1500;

const socket = io();

socket.on('connect', () => {
  console.log('Connected to the server');
  document.body.classList.remove("offline");
  document.body.classList.add("online");
  document.getElementById("rocket-state").innerText = "00";
  document.getElementById("system-state").innerText = "00";
  requestHeartbeat();
});

socket.on('disconnect', () => {
  console.log('Disconnected from the server');

  document.body.classList.add("offline");
  document.body.classList.remove("online");

  rttElement.innerText = "";
  rtt = undefined;

  document.getElementById("rocket-state").innerText = "";
  document.getElementById("system-state").innerText = "";
});

let heartbeatRequsetTime;

socket.on("heartbeat-response", (heartbeatResponseTime) => {
  const delta = heartbeatResponseTime - heartbeatRequsetTime;
  if(rtt != undefined)  {
    // simple 1 pole lowpass
    rtt = ((1 - rtt_lowpass) * rtt) + (rtt_lowpass * delta);
  } else  {
    rtt = delta;
  }
  rttElement.innerText = (Math.round(rtt * 1000) / 1000).toFixed(2);
})

function requestHeartbeat() {
  heartbeatRequsetTime = Date.now();
  socket.emit("heartbeat-request", heartbeatRequsetTime);
}
setInterval(requestHeartbeat, heartbeatIntervalMs);

const socketClient = {

  onMessage: (callback) => {
    socket.on('message', (message) => {
      callback(message);
    });
  },

  onBadMessage: (callback) => {
    socket.on('bad-message', () => {
      callback();
    });
  },

  sendMessage: (message) => {
    socket.emit('message', message);
  },
};

export default socketClient;
