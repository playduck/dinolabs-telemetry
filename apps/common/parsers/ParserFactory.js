class ParserFactory {
  static create(type, config) {
    switch (type) {
      case 'protobuf':
        const ProtobufParser = require('./ProtobufParser');
        return new ProtobufParser(config);
      case 'json':
        const JsonParser = require('./JsonParser');
        return new JsonParser(config);
      default:
        throw new Error(`Unsupported parser type: ${type}`);
    }
  }
}

module.exports = ParserFactory;