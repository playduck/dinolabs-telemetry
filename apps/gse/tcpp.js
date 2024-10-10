const config = require('../config.json');
const secrets = require('../secrets.json');
const http = require('http');
const base64 = require('base64-js');

const TAG = "TCPP";

class PostApi {
  constructor() {
    this.reconnectTimeout = 1000;  // fixed reconnect timeout
    this.retryCount = 0;
    this.auth = secrets.tcp_api.auth;
    this.url = `${config.tcp_api.protocol}://${config.tcp_api.host}:${config.tcp_api.port}`;

    this.connected = false;
  }

  post(data, callback) {
    if(!this.connected) {
        return;
    }

    const options = {
      method: 'POST',
      hostname: config.tcp_api.host,
      port: config.public_server.port,
      path: config.tcp_api.endpoint_url,
      headers: {
        'Content-Type': data instanceof Buffer ? 'application/octet-stream' : 'application/json',
        'Content-Length': data.length
      }
    };

    if (this.auth) {
      const authString = `${this.auth.username}:${this.auth.password}`;
      const authBuffer = Buffer.from(authString, 'utf8');
      const encodedAuth = base64.fromByteArray(authBuffer);
      options.headers.Authorization = `Basic ${encodedAuth}`;
    }

    const req = http.request(options);
    req.on('error', (err) => {
      console.error(TAG, 'Error occurred:', err.name);
      if(typeof(callback) === "function") {
        callback(err);
      }
    });
    req.on('close', () => {
      if(typeof(callback) === "function") {
        callback();
      }
    });
    req.end(data);
  }

  connect() {
    this.connected = true;

    // const options = {
    //   method: 'GET',
    //   hostname: config.tcp_api.host,
    //   port: config.public_server.port,
    //   path: '/'
    // };

    // const req = http.request(options);
    // req.on('error', (err) => {
    //   console.error(TAG, 'Error occurred:', err);
    //   this.reconnect();
    // });
    // req.on('response', () => {
    //   console.log(TAG, 'Connected to the server');
    //   this.retryCount = 0;
    //   this.connected = true;
    // });
    // req.end();
  }

  reconnect(callback) {
    this.retryCount++;
    console.log(TAG, `Reconnecting to ${this.url} (${this.retryCount})...`);
    setTimeout(() => {
      this.connect();
      if(typeof(callback) === "function")   {
        callback();
      }
    }, this.reconnectTimeout);
  }

  onError(err) {
    console.error(TAG, 'Error occurred:', err.name);
    this.reconnect();
    this.connected = false;
  }
}

const postApi = new PostApi()
postApi.connect();

module.exports = postApi;
