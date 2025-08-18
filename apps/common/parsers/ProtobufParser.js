const path = require("path");
const protobuf = require("protobufjs");
const cobs = require("cobs");
const zlib = require("zlib");
const crc_32 = require('crc-32');
const IParser = require('../interfaces/IParser');

class ProtobufParser extends IParser {
  constructor(config) {
    super();
    this.config = config;
    this.TAG = "PROTOBUF_PARSER";
    this.decodeMessage = () => {
      console.error(this.TAG, "protobuf uninitialized");
      return undefined;
    };

    cobs.maxLength = config.cobs_length;
    this.init();
  }

  async init() {
    try {
      const protobufDefinition = path.join(__dirname, '..', this.config.definition);
      const root = await protobuf.load(protobufDefinition);
      const PayloadPackage = root.lookupType("dinolabs.PayloadPackage");

      this.decodeMessage = (buffer) => {
        let decodedData = undefined;
        try {
          decodedData = cobs.decode(buffer);
        } catch(e) {
          console.error(this.TAG, "Bad COBS");
          return undefined;
        }

        try {
          const message = PayloadPackage.toObject(PayloadPackage.decode(decodedData, decodedData.length - 1), {
            longs: String,
            enums: String,
            defaults: true
          });

          const calc_crc32 = this.crc32(decodedData.subarray(5, decodedData.length - 1), 0);
          if(message.crc32 != calc_crc32) {
            console.error(this.TAG, "CRC mismatch");
            return undefined;
          } else {
            // console.log(this.TAG, "CRC match");
          }

          delete message.crc32;
          delete message.version;

          return message;
        } catch(e) {
          console.error(this.TAG, "Bad pb decoding");
          return undefined;
        }
      };

      console.log(this.TAG, "loaded protobuf");
    } catch(error) {
      console.error(this.TAG, "Failed to load protobuf:", error);
    }
  }

  crc32(buffer) {
    if (typeof zlib !== 'undefined' && zlib.crc32) {
      return zlib.crc32(buffer, 0);
    } else {
      return crc_32.buf(buffer, 0);
    }
  }

  parseMessage(buffer) {
    return this.decodeMessage(buffer);
  }
}

module.exports = ProtobufParser;
