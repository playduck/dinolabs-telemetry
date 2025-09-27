const config = require('../config.json');
const secrets = require('../secrets.json');
const https = require('https');
const base64 = require('base64-js');

const TAG = "TCPP";

class PostApi {
  constructor() {
    this.reconnectTimeout = 1000;  // fixed reconnect timeout
    this.retryCount = 0;
    this.auth = secrets.tcp_api.auth;
    this.url = `${config.tcp_api.protocol}://${config.tcp_api.host}`;
    this.connected = false;

    // Batching configuration
    this.batchSize = 100;  // Send after X messages
    this.batchTimeout = 2000;  // Send after Y milliseconds
    this.messageBatch = [];
    this.batchTimer = null;
  }

  post(data, callback) {
    if(!this.connected) {
        return;
    }

    // Add to batch instead of posting immediately
    this.addToBatch(data, callback);
  }

  addToBatch(data, callback) {
    this.messageBatch.push({ data, callback });

    // Set timer if this is the first message in the batch
    if (this.messageBatch.length === 1) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, this.batchTimeout);
    }

    // Send immediately if batch size reached
    if (this.messageBatch.length >= this.batchSize) {
      this.flushBatch();
    }
  }

  flushBatch() {
    if (this.messageBatch.length === 0) {
      return;
    }

    // Clear the timeout
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Prepare batch data
    const currentBatch = this.messageBatch;
    this.messageBatch = [];

    // Send as array of messages
    const batchData = currentBatch.map(item => item.data);
    const batchCallbacks = currentBatch.map(item => item.callback);

    console.log(TAG, `Sending batch of ${batchData.length} messages`);
    this.sendBatch(batchData, batchCallbacks);
  }

  sendBatch(batchData, batchCallbacks) {
    const data = JSON.stringify(batchData);

    const options = {
      host: config.tcp_api.host,
      port: 443,
      path: "/" + config.tcp_api.endpoint_url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    if (this.auth) {
      const authString = `${this.auth.username}:${this.auth.password}`;
      const authBuffer = Buffer.from(authString, 'utf8');
      const encodedAuth = base64.fromByteArray(authBuffer);
      options.headers.Authorization = `Basic ${encodedAuth}`;
    }

    const req = https.request(options);

    req.on('error', (err) => {
      // console.error(TAG, 'Error occurred:', err);
      batchCallbacks.forEach(callback => {
        if(typeof(callback) === "function") {
          callback(err);
        }
      });
    });

    req.on('close', () => {
      batchCallbacks.forEach(callback => {
        if(typeof(callback) === "function") {
          callback();
        }
      });
    });

    req.on('response', (res) => {
      // console.log(TAG, 'Response received:', res.statusCode);
      let response = '';
      res.on('data', (chunk) => {
        response += chunk;
      });
      res.on('end', () => {
        if(res.statusCode != 200) {
          // console.log(TAG, 'Response body:', response);
        }
        batchCallbacks.forEach(callback => {
          if(typeof(callback) === "function") {
            callback(null, response);
          }
        });
      });
    });
    req.end(data);
  }

  connect() {
    this.connected = true;
    console.log(TAG, "Connected to Server");
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
    // console.error(TAG, 'Error occurred:', err);
    this.reconnect();
    this.connected = false;
  }

  shutdown() {
    // Flush any remaining messages before shutdown
    this.flushBatch();
    this.connected = false;
  }
}

const postApi = new PostApi()
postApi.connect();

module.exports = postApi;
