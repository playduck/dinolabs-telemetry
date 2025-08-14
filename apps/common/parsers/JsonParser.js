const IParser = require('../interfaces/IParser');

class JsonParser extends IParser {
  constructor(config) {
    super();
    this.config = config;
    this.TAG = "JSON_PARSER";
  }

  parseMessage(buffer) {
    try {
      const jsonString = buffer.toString('utf8');
      return JSON.parse(jsonString);
    } catch(error) {
      console.error(this.TAG, "Failed to parse JSON:", error);
      return undefined;
    }
  }
}

module.exports = JsonParser;