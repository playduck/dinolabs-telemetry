const config = require("./config.json");
const path = require("path");
const protobuf = require("protobufjs");
const cobs = require("cobs");
const zlib = require("zlib");

cobs.maxLength = config.proto.cobs_length;

const protobufDefinition = path.join(__dirname, config.proto.definition);
let decodeMessage = () => {
    console.log("protobuf uninitilized");
    return undefined;
};

const parseMessage = (x) => {
    return decodeMessage(x);
}

protobuf.load(protobufDefinition).then( (root) => {
  const PayloadPackageTypes = root.lookupType("dinolabs.PayloadPackage").oneofs
    .payload.oneof;

  const PayloadPackage = root.lookupType("dinolabs.PayloadPackage");
  const Versions = root.lookupEnum("dinolabs.Versions").values;

  let boardId = 0;
  function createDummyMessage(type) {
    const payload = {
      crc32: 0,
      version: Versions.Version_1,
      timestamp: Date.now(),
    };

    switch (type) {
      case "PowerState":
        payload.PowerState = {
          V_Battery: 16.4 + 0.1 * Math.random(),
          I_Battery: 3 + 1 * Math.random(),
          V_Charge_Input: 36 + 0.1 * Math.random(),
          I_Charge_Input: Math.min(0.25 + Math.random(), 0.27),
          I_Charge_Battery: 0,
          V_Rail_12V: Math.min(11.9 + 0.2 * Math.random(), 12.1),
          I_Rail_12V: 0.85 + 0.1 * Math.random(),
          V_Rail_5V: Math.min(4.9 + 0.2 * Math.random(), 5.15),
          I_Rail_5V: 1.2 + 0.1 * Math.random(),
          V_Rail_3V3: Math.min(3.1 + 0.3 * Math.random(), 3.4),
          I_Rail_3V3: 0.9 + 0.4 * Math.random(),
          powerState: 0x12,
        };
        payload.PowerState.I_Charge_Battery =
          (payload.PowerState.V_Charge_Input *
            payload.PowerState.I_Charge_Input) /
            payload.PowerState.V_Battery -
          0.01;
        break;
      case "ExperiementState":
        payload.ExperiementState = {
          boardId: boardId,
          sensors: [
            {
              averageRawOpticalPower: 0.8 * Math.random(),
              photodiodeVoltage: 0.36 * Math.random(),
            },
            {
              averageRawOpticalPower: 0.5 * Math.random(),
              photodiodeVoltage: 0.8 * Math.random(),
            },
            {
              averageRawOpticalPower: 0.6 * Math.random(),
              photodiodeVoltage: 0.4 * Math.random(),
            },
            {
              averageRawOpticalPower: 0.61 * Math.random(),
              photodiodeVoltage: 0.73 * Math.random(),
            },
          ],
        };
        boardId = (boardId + 1) % 2;
        break;
      case "CoolingState":
        payload.CoolingState = {
          TopTEC: {
            TECVoltage: 7 + Math.random(),
            TECCurrent: 1.5 + Math.random(),
          },
          BottomTEC: {
            TECVoltage: 7 + Math.random(),
            TECCurrent: 1.5 + Math.random(),
          },
          fan: {
            FanVoltage: 11.8 + 0.1 * Math.random(),
            FanCurrent: 0.8 + 0.15 * Math.random(),
          },
          Temp_Top_Cool_Side: 19.5 + 0.3 * Math.random(),
          Temp_Hot_Side: 40 + 4 * Math.random(),
          Temp_Bottom_Cool_Side: 19.5 + 0.3 * Math.random(),

          overtempEventOccured: 0,
        };
        break;
      case "SystemStatus":
        payload.SystemStatus = {
          currentPayloadState: 0x01,
          lastFCSState: 0x05,
          rawErrorCount: 0,
          cpuUsage: 0.2 + 0.2 * Math.random(),
          storageCapacity: Math.round(1000 + 10 * Math.random()),
          IMU: {
            accX: 0,
            accY: 0,
            accZ: 0,
            gyroX: 0,
            gyroY: 0,
            gyroZ: 0,
          },
        };
        break;
      default:
        console.error(`Unknown type ${type}`);
        return null;
    }

    const errMsg = PayloadPackage.verify(payload);
    if (errMsg) throw Error(errMsg);
    const message = PayloadPackage.create(payload);
    const buffer = PayloadPackage.encode(message).finish();

    return buffer;
  }

  decodeMessage = (buffer) => {

    console.log("length: ", buffer.length);
    const decodedData = cobs.decode(buffer);

    try {
        const message = PayloadPackage.toObject(PayloadPackage.decode(decodedData, decodedData.length - 1), {
            longs: String,
            enums: String,
            defaults: true // default omissions to zero
        });

        calc_crc32 = zlib.crc32(decodedData.subarray(5, decodedData.length - 1), 0);
        if(message.crc32 != calc_crc32) {
            console.error("CRC mismatch");
        } else  {
          console.log("CRC match")
        }
        console.log(message)

        delete message.crc32;
        delete message.version;

        return message;
    }   catch(e) {
        console.log(e)
    }
  };

  console.log("loaded protobuf")
});

module.exports = {
    parseMessage,
};
