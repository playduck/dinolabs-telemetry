class IParser {
  parseMessage(buffer) {
    throw new Error('parseMessage method must be implemented');
  }
}

module.exports = IParser;