const config = require("../config.json");
const path = require("path");
const protobuf = require("protobufjs");
const cobs = require("cobs");
const zlib = require("zlib");
const crc_32 = require('crc-32');

const TAG = "PROTO";

cobs.maxLength = config.proto.cobs_length;

const protobufDefinition = path.join(__dirname, config.proto.definition);
let decodeMessage = () => {
    console.error(TAG, "protobuf uninitilized");
    return undefined;
};

const parseMessage = (x) => {
    return decodeMessage(x);
}

const crc32 = (buffer) => {
  if (typeof zlib !== 'undefined' && zlib.crc32) {
    return zlib.crc32(buffer, 0);
  } else {
    return crc_32.buf(buffer, 0);
  }
}

protobuf.load(protobufDefinition).then( (root) => {
  const PayloadPackage = root.lookupType("dinolabs.PayloadPackage");

  decodeMessage = (buffer) => {

    let decodedData = undefined;
    try {
      decodedData = cobs.decode(buffer);
    } catch(e)  {
      console.error(TAG, "Bad COBS");
      return undefined;
    }


    try {
        const message = PayloadPackage.toObject(PayloadPackage.decode(decodedData, decodedData.length - 1), {
            longs: String,
            enums: String,
            defaults: true // default omissions to zero
        });

        calc_crc32 = crc32(decodedData.subarray(5, decodedData.length - 1), 0);
        if(message.crc32 != calc_crc32) {
            console.error(TAG, "CRC mismatch");
            return undefined;
        } else  {
          console.log(TAG, "CRC match")
        }

        // don't transmit useless data in json
        delete message.crc32;
        delete message.version;

        return message;
    }   catch(e) {
        console.error(TAG, "Bad pb deocoding");
        return undefined;
    }
  };

  console.log(TAG, "loaded protobuf")
});

module.exports = {
    parseMessage,
};
