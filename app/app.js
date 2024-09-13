const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('./socket');

const morgan = require("morgan");
const port = 3000;
const routes = require("./routes");

// Logging middleware
app.use(morgan("dev"));

// Use routes
app.use(routes);

// Start the server
server.listen(3000, () => {
  console.log('Server is running on port 3000');
});
io.listen(server);
