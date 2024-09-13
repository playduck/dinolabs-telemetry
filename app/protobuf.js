const path = require("path");
const protobuf = require("protobufjs");
const { styleText } = require("util");

const protobufDefinition = path.join(__dirname, "./proto/payload.proto");
let decodeMessage;

let io = undefined;

module.exports = (_io) => {
    io = _io;
    protobuf.load(protobufDefinition, function(err, root) {
        if (err)
            throw err;

        const PayloadPacakgeTypes = root.lookupType("dinolabs.PayloadPacakge").oneofs.payload.oneof;

        const PayloadPacakge = root.lookupType("dinolabs.PayloadPacakge");
        const Versions = root.lookupEnum("dinolabs.Versions").values;

        let boardId = 0;
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
                        I_Charge_Battery: 0,
                        V_Rail_12V: Math.min(11.9 + 0.2 * Math.random(), 12.1),
                        I_Rail_12V:0.85 + 0.1 *Math.random(),
                        V_Rail_5V: Math.min(4.9 + 0.2 * Math.random(), 5.15),
                        I_Rail_5V: 1.2 + 0.1 * Math.random(),
                        V_Rail_3V3: Math.min(3.1 + 0.3 * Math.random(), 3.4),
                        I_Rail_3V3: 0.9 + 0.4 * Math.random(),
                        powerState: 0x12,
                    };
                    payload.PowerState.I_Charge_Battery = ((payload.PowerState.V_Charge_Input * payload.PowerState.I_Charge_Input) / payload.PowerState.V_Battery) - 0.01;
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
                        ]
                    }
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
                            FanCurrent: 0.8 + 0.15 * Math.random()
                        },
                        Temp_Top_Cool_Side:  19.5 + 0.3 * Math.random(),
                        Temp_Hot_Side: 40 + 4 * Math.random(),
                        Temp_Bottom_Cool_Side:  19.5 + 0.3 * Math.random(),

                        overtempEventOccured: 0
                    }
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
            // console.log(`Encoded size of ${buffer.length} bytes`);
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

            // console.log(message)
            return message;
        }

        /* self test */
        let i = 0;
        function sendMessage() {
            i = (i + 1) % PayloadPacakgeTypes.length;
            const msg = decodeMessage(createDummyMessage(PayloadPacakgeTypes[i]));
            io.emit("message", JSON.stringify(msg))
        }

    (function loop() {
        var rand = Math.round(100 + 200 * Math.random());
        setTimeout(() => {
            sendMessage();
            loop();
        }, rand);
    }());




    });
};
