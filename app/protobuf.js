const { time, timeStamp } = require("console");
const { version } = require("os");
const path = require("path");
const protobuf = require("protobufjs");

const protobufDefinition = path.join(__dirname, "./proto/payload.proto");

let decodeMessage;

protobuf.load(protobufDefinition, function(err, root) {
    if (err)
        throw err;

    const PayloadPacakgeTypes = root.lookupType("dinolabs.PayloadPacakge").oneofs.payload.oneof;

    const PayloadPacakge = root.lookupType("dinolabs.PayloadPacakge");
    const Versions = root.lookupEnum("dinolabs.Versions").values;

    function createDummyMessage(type)   {
        const payload = {
            crc32: 0,
            version: Versions.Version_1,
            timestamp: Date.now(),
        };

        switch(type)    {
            case "PowerState":
                payload.PowerState = {
                    V_Battery: 16.4 + 0.1 * Math.random(),
                    I_Battery: 3 + 1 * Math.random(),
                    V_Charge_Input: 36 + 0.1 * Math.random(),
                    I_Charge_Input: Math.min(0.25 + Math.random(), 0.27),
                    I_Charge_Battery: 2.1 + 0.1 * Math.random(),
                    V_Rail_12V: Math.min(11.9 + 0.2 * Math.random(), 12.1),
                    I_Rail_12V:0.85 + 0.1 *Math.random(),
                    V_Rail_5V: Math.min(4.9 + 0.2 * Math.random(), 5.15),
                    I_Rail_5V: 1.2 + 0.1 * Math.random(),
                    V_Rail_3V3: Math.min(3.1 + 0.3 * Math.random(), 3.4),
                    I_Rail_3V3: 0.9 + 0.4 * Math.random(),
                    powerState: 0x12,
                };
                break;
            case "ExperiementState":
                payload.ExperiementState = {
                    boardId: Math.random() > 0.5 ? 1 : 0,
                    sensor1: {
                        averageRawOpticalPower: 0.1 * Math.random(),
                        photodiodeVoltage: 0.1 * Math.random(),
                    },
                    sensor2: {
                        averageRawOpticalPower: 0.1 * Math.random(),
                        photodiodeVoltage: 0.1 * Math.random(),
                    },
                    sensor3: {
                        averageRawOpticalPower: 0.1 * Math.random(),
                        photodiodeVoltage: 0.1 * Math.random(),
                    },
                    sensor4: {
                        averageRawOpticalPower: 0.1 * Math.random(),
                        photodiodeVoltage: 0.1 * Math.random(),
                    },
                }
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
                        FanVoltage: 11 + Math.random(),
                        FanCurrent: 0.8 + 0.1 * Math.random()
                    },
                    Top_Cool_Side: [
                        {
                            sensorId: 0,
                            temperature: 19.5 + 0.5 * Math.random()
                        },
                        {
                            sensorId: 1,
                            temperature: 19.5 + 0.5 * Math.random()
                        },
                        {
                            sensorId: 2,
                            temperature: 19.5 + 0.5 * Math.random()
                        },
                        {
                            sensorId: 3,
                            temperature: 19.5 + 0.5 * Math.random()
                        },
                    ],
                    Bottom_Cool_Side: [
                        {
                            sensorId: 0,
                            temperature: 19.5 + 0.5 * Math.random()
                        },
                        {
                            sensorId: 1,
                            temperature: 19.5 + 0.5 * Math.random()
                        },
                        {
                            sensorId: 2,
                            temperature: 19.5 + 0.5 * Math.random()
                        },
                        {
                            sensorId: 3,
                            temperature: 19.5 + 0.5 * Math.random()
                        },
                    ],
                    Hot_Side: [
                        {
                            sensorId: 0,
                            temperature: 40 + 20 * Math.random()
                        },
                        {
                            sensorId: 1,
                            temperature: 40 + 20 * Math.random()
                        }
                    ],
                    overtempEventOccured: 0
                }
                break;
            case "SystemStatus":
                payload.SystemStatus = {
                    currentPayloadState: 0x01,
                    lastFCSState: 0x05,
                    rawErrorCount: 0,
                    cpuUsage: 0.2,
                    storageCapacity: Math.round(1000 + 10 * Math.random()),
                    IMU: {
                        accX: 0,
                        accY: 0,
                        accZ: 0,
                        gyroX: 0,
                        gyroY: 0,
                        gyroZ: 0
                    }
                };
                break;
            default:
                console.error(`Unknown type ${type}`);
                return null;
        }

        const errMsg = PayloadPacakge.verify(payload);
        if (errMsg)
            throw Error(errMsg);
        const message = PayloadPacakge.create(payload);
        const buffer = PayloadPacakge.encode(message).finish();
        console.log(`Encoded size of ${buffer.length} bytes`);
        return buffer;
    }

    decodeMessage = (buffer) => {
        const message = PayloadPacakge.toObject(PayloadPacakge.decode(buffer), {
            longs: String,
            enums: String,
        });

        /* TODO check CRC32 */

        if(Versions[message.version] != Versions.Version_1)   {
            console.error(`Unkown Version ${message.version}`)
        }

        delete message.crc32;
        delete message.version;

        console.log(message)
    }

    /* self test */
    for(const type in PayloadPacakgeTypes)  {
        decodeMessage(createDummyMessage(PayloadPacakgeTypes[type]));
    }
});

module.exports = {
    decodeMessage
};
