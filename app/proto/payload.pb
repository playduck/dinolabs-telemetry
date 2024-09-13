syntax = "proto3";

import "nanopb.proto";

package dinolabs;
option optimize_for = LITE_RUNTIME;

enum Versions {
  Version_Unkown = 0;
  Version_1 = 1;
}

/* main trasaction message */
message Packet {
    fixed32 crc32 = 1;
    Versions version = 2;
    uint64 timestamp = 3 [ (nanopb).int_size = IS_64 ];

    oneof payload {
        PowerBoard PowerState = 4;
        ExperimentBoard ExperiementState = 5;
        CoolingSystem CoolingState = 6;
        SystemState SystemStatus = 7;
    }
}

message PowerBoard {
    float V_Battery = 1;
    float I_Battery = 2;

    float V_Charge_Input = 3;   /* BMS input side voltage (PCB: VChrg) */
    float I_Charge_Input = 4;   /* Current over RAC_SNS into BMS input */
    float I_Charge_Battery = 5; /* Current over RBAT_SNS from BMS output */

    float V_Rail_12V = 6;
    float I_Rail_12V = 7;

    float V_Rail_5V = 8;
    float I_Rail_5V = 9;

    float V_Rail_3V3 = 10;
    float I_Rail_3V3 = 11;

    uint32 powerState = 12 [ (nanopb).int_size = IS_8 ];  /* power good and charge source */
}

message ExperimentSensor {
  float averageRawOpticalPower = 1; /* nW/cm2 */
  float photodiodeVoltage = 2;
}

message ExperimentBoard {
    uint32 boardId = 1 [ (nanopb).int_size = IS_8 ];
    ExperimentSensor sensor1 = 2;
    ExperimentSensor sensor2 = 3;
    ExperimentSensor sensor3 = 4;
    ExperimentSensor sensor4 = 5;
}

message TEC {
    float TECVoltage = 1;
    float TECCurrent = 2;
}

message Fan {
    float FanVoltage = 1;
    float FanCurrent = 2;
}

message CoolingSystem {
    TEC TopTEC = 1;
    TEC BottomTEC = 2;
    Fan fan = 3;

    repeated TemperatureSensor Top_Cool_Side = 4 [ (nanopb).max_count = 4 ];
    repeated TemperatureSensor Bottom_Cool_Side = 5 [ (nanopb).max_count = 4 ];
    repeated TemperatureSensor Hot_Side = 6 [ (nanopb).max_count = 2 ];

    /* did overtemp event occour since last message?, LSB=Top Overheat, LSB+1=Bottom Overheat */
    uint32 overtempEventOccured = 8 [ (nanopb).int_size = IS_8 ];
}

message TemperatureSensor {
    uint32 sensorId = 1 [ (nanopb).int_size = IS_8 ];
    float temperature = 2; /* Temperature in degC */
}

message SystemState {
  /* TODO: maybe change states to defined enums */
  uint32 currentPayloadState = 1; /* tbd */
  uint32 lastFCSState = 2; /* echo back last received state from Rocketry FCS */
  uint32 rawErrorCount = 3;
  float cpuUsage = 4;
  uint32 storageCapacity = 5;
}
