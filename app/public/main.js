import {
  animate_data,
  batteryVoltageLabel,
  chargePowerInLabel,
  coldSideBottomLabel,
  coldSideTopLabel,
  hotSideLabel,
  cpuLabel } from './visualization.js';

import socketClient from './socket-client.js';

const demoMode = true;
const demoLoopIntervalMs = 250;
const uiUpdateLoopIntervalMs = 100;
const SCALING_FACTOR = 1000.0;

/* scrollback plot count  */
const globalHistory = 50;
const experimentHistory = globalHistory;
const IMUHistory = globalHistory;
const TempHistory = globalHistory;
const TECHistory = globalHistory;
const PowerHistory = globalHistory;
const LogHistory = globalHistory;

/* pltos */
const chambers = [];
let imuAccelSparkline;
let imuGyrolSparkline;
let tempPlot;
let tecPlot;
let powerPlot;

/* DOM elements */
let coldSideTopGraph, coldSideTopValue;
let coldSideBotGraph, coldSideBotValue;
let hotSideGraph, hotSideValue;
let messageLog;
let previousTime = undefined;

let powerGood, chargeSource;
let errorCount, payloadState, FCSState, cpuUsage, storageCapacity;
let lastMessageTime;

let colors = {
  "--very-light-gray": undefined,
  "--light-gray": undefined,
  "--very-dark-gray": undefined,
  "--dark-gray": undefined,
  "--warr-blue-1": undefined,
  "--warr-blue-2": undefined,
  "--warr-blue-3": undefined,
  "--warr-red": undefined,
  "--warr-green": undefined,
  "--warr-black": undefined,
  "--warr-yellow": undefined,
  "--warr-orange": undefined,
  "--warr-pink": undefined,
  "--warr-purple": undefined
};

let mooSync = uPlot.sync("moo");
const matchSyncKeys = (own, ext) => own === ext;
const cursorOpts = {
  lock: false,
  sync: {
    key: mooSync.key,
    setSeries: true,
    match: [matchSyncKeys, matchSyncKeys],
  },
};

/** Auxiliary methods */
/* get computed style colors from CSS  */
function getColors() {
  const style = getComputedStyle(document.body);
  Object.keys(colors).forEach((color) => {
    colors[color] = style.getPropertyValue(color);
  });
}

/* attack-release (ar) curve for all-time-high (ath) bar-chart fader */
function arcurve(level, ath) {
  let alpha = 1;
  if (level >= ath) {
    alpha = 1;
  } else {
    alpha = 0.0125;
  }

  return alpha * level + (1 - alpha) * ath;
}

/* format a numeric value to append a prefix (+-) and fix and pad it */
function formatValue(x) {
  // Check if the value is NaN or undefined
  if (typeof x === 'undefined' || isNaN(x)) {
    x = 0;
  }

  const prefix = x >= 0 ? "+" : ""; // automatic prefix for negative values
  const fixed = Math.abs(x).toFixed(2).split('.');
  const integerPart = fixed[0].padStart(2, "0"); // pad the integer part
  const decimalPart = fixed[1]; // get the decimal part
  return `${prefix}${integerPart}.${decimalPart}`;
}

/* map a value range onto another */
function map(input, input_start, input_end, output_start, output_end) {
  return Math.min(
    Math.max(
      output_start +
        ((output_end - output_start) / (input_end - input_start)) *
          (input - input_start),
      output_start
    ),
    output_end
  );
}

/* initilize all .value elements to read 0 */
function clearAll() {
  const elements = [...document.getElementsByClassName("value")];
  elements.forEach((element) => {
    element.innerHTML = "+00.00";
  });
}

/* add a new Y value(s) to an plot buffer and truncate if it exceeds a size */
function addAndConfine(data, newY, size) {
  // Check if the data array is valid
  if (
    !data ||
    data.length < 2 ||
    data.some((arr) => arr.length !== data[0].length)
  ) {
    throw new Error("Invalid data array");
  }

  // Calculate the next X value
  const newX = data[0].length ? data[0][data[0].length - 1] + 1 : 1;

  // Add the new X and Y values to the data array
  const newData = data.map((arr, index) => {
    if (index === 0) {
      // Add the new X value to the time-axis
      return arr.concat([newX]);
    } else {
      // Add the new Y value(s) to the corresponding dimension
      if (Array.isArray(newY)) {
        return arr.concat([newY[index - 1]]);
      } else {
        return arr.concat([newY]);
      }
    }
  });

  // Confine the array to the predefined size
  return newData.map((arr) => arr.slice(-size));
}

/** DOM manipulation functions */
/* fill a PowerBlock with values */
function setPowerBlockValues(id, voltage, current) {
  // Get the power block element
  const powerBlock = document.getElementById(id);

  // Check if the power block element exists
  if (powerBlock) {
    // Get the voltage, current, and power elements
    const voltageElement = powerBlock.querySelector('.power-list div:nth-child(1) .value');
    const currentElement = powerBlock.querySelector('.power-list div:nth-child(2) .value');
    const powerElement = powerBlock.querySelector('.power-list div:nth-child(3) .value');

    // Check if the voltage, current, and power elements exist
    if (voltageElement && currentElement && powerElement) {
      // Set the voltage, current, and power values
      const power = voltage * current;
      voltageElement.textContent = formatValue(voltage);
      currentElement.textContent = formatValue(current);
      powerElement.textContent = formatValue(power);
    } else {
      console.error('One or more power block elements not found.');
    }
  } else {
    console.error('Power block element not found.');
  }
}

/* add a DOM row to a table */
let tableRowCount = 0;
function appendTableRow(limit, time, type, previousTime) {
    // Create a new table row element
    const row = document.createElement('tr');

    const cell1 = document.createElement('td');
    cell1.textContent = ++tableRowCount;
    row.appendChild(cell1);

    const cell2 = document.createElement('td');
    const d =  new Date(parseInt(time));
    cell2.textContent = d.toLocaleTimeString();
    row.appendChild(cell2);

    const cell3 = document.createElement('td');
    if (previousTime !== undefined) {
      const delta = time - previousTime;
      cell3.textContent = `${delta} ms`;
    } else {
      previousTime = time;
      cell3.textContent = 'none';
    }
    row.appendChild(cell3);

    const cell4 = document.createElement('td');
    cell4.textContent = type;
    row.appendChild(cell4);

    // Append the new row to the element
    messageLog.insertBefore(row, messageLog.firstChild);

    // If the element has more than the limit number of children, remove the oldest
    if (messageLog.children.length > limit) {
      messageLog.removeChild(messageLog.lastChild);
    }

    return time;
}

/* genrate experiment chamber DOM and plot */
function generateChamber(index, parent) {
  // Create the chamber div
  const chamber = document.createElement("div");
  chamber.classList.add("chamber");
  chamber.setAttribute("chamber-index", index);
  chamber.style.setProperty("--level", "100%");

  // Create the values div
  const values = document.createElement("div");
  values.classList.add("values");

  // Create the irradiance value and unit spans
  const irradianceValue = document.createElement("span");
  irradianceValue.classList.add("value", "irradiance");
  const irradianceUnit = document.createElement("span");
  irradianceUnit.classList.add("unit", "irradiance");
  irradianceUnit.innerHTML = "nW/cm<sup>2</sup>";

  // Create the voltage value and unit spans
  const voltageValue = document.createElement("span");
  voltageValue.classList.add("value", "voltage");
  const voltageUnit = document.createElement("span");
  voltageUnit.classList.add("unit", "voltage");
  voltageUnit.textContent = "V";

  // Append the spans to the values div
  values.appendChild(irradianceValue);
  values.appendChild(irradianceUnit);
  values.appendChild(voltageValue);
  values.appendChild(voltageUnit);

  // Create the sparkline div
  const sparkline = document.createElement("div");
  sparkline.classList.add("sparkline");
  sparkline.id = `sparkline-${index}`;

  function getSize() {
    const sparkline = document
      .getElementById(`sparkline-${index}`)
      .getBoundingClientRect();
    return {
      width: sparkline.width,
      height: sparkline.height,
    };
  }

  // Append the values and sparkline divs to the chamber div
  chamber.appendChild(values);
  chamber.appendChild(sparkline);

  // Append the chamber div to the parent element
  parent.appendChild(chamber);

  const opts = {
    ...getSize(),
    pxAlign: false,
    cursor: cursorOpts,
    plugins: [tooltipPlugin()],
    scales: {
      x: {
        time: false,
      },
      y: {
        auto: false,
        range: [0, 4096],
      },
    },
    legend: {
      show: false,
    },
    axes: [
      {
        show: true,
        size: 0,
        stroke: colors["--very-dark-gray"],
        grid: {
          stroke: colors["--light-gray"],
        }
      },
      {
        show: true,
        size: 35,
        stroke: colors["--very-dark-gray"],
        grid: {
          stroke: colors["--light-gray"],
        }
      },
    ],
    series: [
      {
        label: "t",
      },
      {
        label: "power",
        stroke: colors["--warr-green"],
        width: 2,
        //   fill: colors["--warr-blue-3"],
      },
    ],
  };

  const data = [[], []];
  const u = new uPlot(opts, data, sparkline);
  u.getSize = getSize;
  chambers.push({
    irradianceValue: irradianceValue,
    voltageValue: voltageValue,
    chamber: chamber,
    sparkline: u,
  });

  return u;
}

/* add IMU plot */
function addIMU(id, sum = false, range) {
  const sparkline = document.getElementById(id);
  function getSize() {
    const sparkline = document.getElementById(id).getBoundingClientRect();
    return {
      width: sparkline.width,
      height: sparkline.height,
    };
  }

  const opts = {
    ...getSize(),
    pxAlign: false,
    cursor: cursorOpts,
    plugins: [tooltipPlugin()],

    scales: {
      x: {
        time: false,
      },
      y: {
        auto: false,
        range: range
      },
    },
    legend: {
      show: false,
    },
    axes: [
      {
        show: true,
        size: 0,
        stroke: colors["--very-dark-gray"],
        grid: {
          stroke: colors["--light-gray"],
        }
      },
      {
        show: true,
        size: 40,
        gap: 0,
        stroke: colors["--very-dark-gray"],
        grid: {
          stroke: colors["--light-gray"],
        }
      },
    ],
    series: [
      {
        label: "t",
      },
      {
        label: "X",
        stroke: colors["--warr-red"],
      },
      {
        label: "Y",
        stroke: getComputedStyle(document.body).getPropertyValue(
          "--warr-green"
        ),
      },
      {
        label: "Z",
        stroke: getComputedStyle(document.body).getPropertyValue(
          "--warr-blue-3"
        ),
      },
    ],
  };

  const data = [[], [], [], []];

  if (sum) {
    opts.series.push({
      label: "S",
      stroke: colors["--warr-black"],
    });
    data.push([]);
  }

  const u = new uPlot(opts, data, sparkline);
  u.getSize = getSize;
  return u;
}

/* add Temperature plot */
function addTemperaturePlot() {
  const element = document.getElementById("temperature-plot");

  function getSize() {
    const sparkline = document
      .getElementById("temperature-plot")
      .getBoundingClientRect();
    return {
      width: sparkline.width,
      height: sparkline.height - 20,
    };
  }

  const opts = {
    ...getSize(),
    pxAlign: false,
    cursor: cursorOpts,
    plugins: [tooltipPlugin()],
    scales: {
      x: {
        time: false,
      },
      y: {
        auto: false,
        range: [0, 80],
      },
    },
    legend: {
      show: true,
      size: 30,
    },
    axes: [
      {
        show: true,
        size: 30,
        stroke: colors["--very-dark-gray"],
        grid: {
          stroke: colors["--light-gray"],
        }
      },
      {
        show: true,
        size: 30,
        label: "Temperature (°C)",
        labelGap: 8,
        stroke: colors["--very-dark-gray"],
        grid: {
          stroke: colors["--light-gray"],
        }
      },
    ],
    series: [
      {
        label: "Time",
      },
      {
        label: "Cold Side Top",
        width: 2,
        stroke: getComputedStyle(document.body).getPropertyValue(
          "--warr-blue-3"
        ),
      },
      {
        label: "Cold Side Bottom",
        width: 2,
        stroke: getComputedStyle(document.body).getPropertyValue(
          "--warr-blue-2"
        ),
      },
      {
        label: "Hot Side",
        width: 2,
        stroke: getComputedStyle(document.body).getPropertyValue(
          "--warr-yellow"
        ),
      },
    ],
  };

  const data = [[], [], [], []];
  const u = new uPlot(opts, data, element);
  u.getSize = getSize;

  return u;
}

/* add TEC plot */
function addTECPlot() {
  const element = document.getElementById("tec-plot");

  function getSize() {
    const sparkline = document
      .getElementById("tec-plot")
      .getBoundingClientRect();
    return {
      width: sparkline.width,
      height: sparkline.height,
    };
  }

  const opts = {
    ...getSize(),
    pxAlign: false,
    cursor: cursorOpts,
    plugins: [tooltipPlugin()],
    scales: {
      x: {
        time: false,
      },
      v: {
        auto: false,
        range: [0, 12],
      },
      i: {
        auto: false,
        range: [0, 12],
      },
    },
    legend: {
      show: false,
    },
    axes: [
      {
        show: true,
        size: 0,
        stroke: colors["--very-dark-gray"],
        grid: {
          stroke: colors["--light-gray"],
        }
      },
      {
        scale: "v",
        show: true,
        size: 30,
        label: "Voltage (V)",
        labelGap: 8,
        stroke: colors["--very-dark-gray"],
        grid: {
          stroke: colors["--light-gray"],
        }
      },
      {
        scale: "i",
        show: true,
        size: 30,
        label: "Current (A)",
        side: 1,
        labelGap: 8,
        stroke: colors["--very-dark-gray"],
        grid: {
          stroke: colors["--light-gray"],
        }
      },
    ],
    series: [
      {
        label: "Time",
      },
      {
        label: "TEC Top V",
        width: 2,
        scale: "v",
        stroke: colors["--warr-pink"]
      },
      {
        label: "TEC Top I",
        width: 2,
        scale: "i",
        stroke: colors["--warr-yellow"],
      },
      {
        label: "TEC Bottom V",
        width: 2,
        scale: "v",
        stroke: colors["--warr-purple"]
      },
      {
        label: "TEC Bottom I",
        width: 2,
        scale: "i",
        stroke: colors["--warr-orange"],
      }
    ],
  };

  const data = [[], [], [], [], [], [], []];
  const u = new uPlot(opts, data, element);
  u.getSize = getSize;

  return u;
}

/* add Power plot */
function addPowerPlot() {
  const element = document.getElementById("power-plot");

  function getSize() {
    const sparkline = document
      .getElementById("power-plot")
      .getBoundingClientRect();
    return {
      width: sparkline.width,
      height: sparkline.height,
    };
  }

  const opts = {
    ...getSize(),
    pxAlign: false,
    cursor: cursorOpts,
    plugins: [tooltipPlugin()],
    scales: {
      x: {
        time: false,
      },
      v: {
        auto: false,
        range: [0, 40],
      },
      i: {
        auto: false,
        range: [0, 4],
      },
    },
    legend: {
      show: false,
    },
    axes: [
      {
        show: true,
        size: 0,
        stroke: colors["--very-dark-gray"],
        grid: {
          stroke: colors["--light-gray"],
        }
      },
      {
        scale: "v",
        show: true,
        size: 30,
        label: "Voltage (V)",
        labelGap: 8,
        stroke: colors["--very-dark-gray"],
        grid: {
          stroke: colors["--light-gray"],
        }
      },
      {
        scale: "i",
        show: true,
        size: 30,
        label: "Current (A)",
        side: 1,
        labelGap: 8,
        stroke: colors["--very-dark-gray"],
        grid: {
          stroke: colors["--light-gray"],
        }
      },
    ],
    series: [
      {
        label: "Time",
      },
      {
        label: "TEC Top V",
        width: 2,
        scale: "v",
        stroke: colors["--warr-pink"]
      },
      {
        label: "TEC Top I",
        width: 2,
        scale: "i",
        stroke: colors["--warr-red"],
      },
      {
        label: "TEC Bottom V",
        width: 2,
        scale: "v",
        stroke: colors["--warr-purple"]
      },
      {
        label: "TEC Bottom I",
        width: 2,
        scale: "i",
        stroke: colors["--warr-orange"],
      },
    ],
  };

  const data = [[], [], [], [], []];
  const u = new uPlot(opts, data, element);
  u.getSize = getSize;

  return u;
}

function init() {
  getColors();

  /* get DOM elements */
  let coldSideTop = document.getElementById("temp-cold-side-top");
  coldSideTopGraph = [...coldSideTop.getElementsByClassName("temperature-bar"),][0];
  coldSideTopValue = [...coldSideTop.getElementsByClassName("value")][0];

  let coldSideBot = document.getElementById("temp-cold-side-bot");
  coldSideBotGraph = [...coldSideBot.getElementsByClassName("temperature-bar"),][0];
  coldSideBotValue = [...coldSideBot.getElementsByClassName("value")][0];

  let hotSide = document.getElementById("temp-hot-side");
  hotSideGraph = [...hotSide.getElementsByClassName("temperature-bar")][0];
  hotSideValue = [...hotSide.getElementsByClassName("value")][0];

  powerGood = document.getElementById("power-good");
  chargeSource = document.getElementById("charge-src");

  errorCount= document.getElementById("error-count");
  payloadState  = document.getElementById("system-state");
  FCSState = document.getElementById("rocket-state");
  cpuUsage = document.getElementById("cpu-usage");
  storageCapacity = document.getElementById("storage-capacity");

  messageLog = document.getElementById("message-scroll-block");

  /* add uPlots */
  const topChambers = document.getElementById("top-chambers");
  const botChambers = document.getElementById("bot-chambers");
  for (let i = 1; i <= 4; i++) {
    mooSync.sub(generateChamber(i, topChambers));
  }
  for (let i = 1; i <= 4; i++) {
    mooSync.sub(generateChamber(i + 4, botChambers));
  }
  chambers.forEach((c) => {
    c.sparkline.setSize(c.sparkline.getSize());
  });
  imuAccelSparkline = addIMU("imu-accel", true, [-20, 20]);
  imuGyrolSparkline = addIMU("imu-gyro", false, [-500, 500]);
  tempPlot = addTemperaturePlot();
  tecPlot = addTECPlot();
  powerPlot = addPowerPlot();

  /* set all .value items to 0 */
  clearAll();
}

function setExpPlot(board, i, sensor) {
  const maxVal = 0.256;
  const value = sensor.photodiodeVoltage / SCALING_FACTOR;

  chambers[i].sparkline.setData(addAndConfine(chambers[i].sparkline.data, value, experimentHistory));
  chambers[i].chamber.style.setProperty("--level",`${100 - Math.min(Math.max((value / maxVal) * 100, 0), 100)}%`);

  chambers[i].irradianceValue.innerText = formatValue(value);
  chambers[i].voltageValue.innerText = formatValue(sensor.photodiodeVoltage / SCALING_FACTOR);
}

function parseMessage(message)  {
  lastMessageTime = Date.now();
  const messageObject = JSON.parse(message);
  const messageType = Object.keys(messageObject)[1];

  /* write to log table */
  previousTime = appendTableRow(LogHistory, messageObject.timestamp, messageType, previousTime);

  switch(messageType) {
    case "PowerState":
      const newPowerData = [
          messageObject.PowerState.V_Battery / SCALING_FACTOR,
          messageObject.PowerState.I_Battery / SCALING_FACTOR,
          messageObject.PowerState.V_Charge_Input / SCALING_FACTOR,
          messageObject.PowerState.I_Charge_Input / SCALING_FACTOR,
        ];
        powerPlot.setData(
          addAndConfine(powerPlot.data, newPowerData, PowerHistory)
        );
        setPowerBlockValues("RailBat", messageObject.PowerState.V_Battery / SCALING_FACTOR, messageObject.PowerState.I_Battery / SCALING_FACTOR);
        setPowerBlockValues("RailChrgIn", messageObject.PowerState.V_Charge_Input / SCALING_FACTOR, messageObject.PowerState.I_Charge_Input / SCALING_FACTOR);
        setPowerBlockValues("RailChrgOut", messageObject.PowerState.V_Battery / SCALING_FACTOR, messageObject.PowerState.I_Charge_Battery / SCALING_FACTOR);

        setPowerBlockValues("Rail12V", messageObject.PowerState.V_Rail_12V / SCALING_FACTOR, messageObject.PowerState.I_Rail_12V / SCALING_FACTOR);
        setPowerBlockValues("Rail5V", messageObject.PowerState.V_Rail_5V / SCALING_FACTOR, messageObject.PowerState.I_Rail_5V / SCALING_FACTOR);
        setPowerBlockValues("Rail3V3", messageObject.PowerState.V_Rail_3V3 / SCALING_FACTOR, messageObject.PowerState.I_Rail_3V3 / SCALING_FACTOR);

        batteryVoltageLabel.setValue(formatValue(messageObject.PowerState.V_Battery / SCALING_FACTOR));
        chargePowerInLabel.setValue(formatValue(messageObject.PowerState.V_Charge_Input / SCALING_FACTOR * messageObject.PowerState.I_Charge_Input / SCALING_FACTOR));

        switch(messageObject.PowerState.powerState & 0x03)  {
          case 0:
            chargeSource.innerText = "None";
            break;
          case 1:
            chargeSource.innerText = "USB (no PD)";
            break;
          case 2:
            chargeSource.innerText = "USB PD";
            break;
          case 3:
            chargeSource.innerText = "Umbilical";
            break;
          default:
            chargeSource.innerText = "Unknown";
            break;
        }

        if(messageObject.PowerState.powerState & 0x04)  {
          powerGood.innerText = "Good";
          powerGood.classList.add("good");
          powerGood.classList.remove("fail");
        } else  {
          powerGood.innerText = "Fail";
          powerGood.classList.remove("good");
          powerGood.classList.add("fail");
        }

      break;
    case "ExperiementState":
      const boardId = messageObject.ExperiementState.boardId;
        for(const sensor in messageObject.ExperiementState.sensors) {
          setExpPlot(boardId, boardId * 4 + parseInt(sensor), messageObject.ExperiementState.sensors[sensor]);
        }
      break;
    case "CoolingState":
      const newTempData = [messageObject.CoolingState.Temp_Top_Cool_Side / SCALING_FACTOR, messageObject.CoolingState.Temp_Bottom_Cool_Side / SCALING_FACTOR, messageObject.CoolingState.Temp_Hot_Side / SCALING_FACTOR];
      tempPlot.setData(addAndConfine(tempPlot.data, newTempData, TempHistory));

      coldSideTopValue.innerText = formatValue(messageObject.CoolingState.Temp_Top_Cool_Side  / SCALING_FACTOR);
      coldSideBotValue.innerText = formatValue(messageObject.CoolingState.Temp_Bottom_Cool_Side  / SCALING_FACTOR);
      hotSideValue.innerText = formatValue(messageObject.CoolingState.Temp_Hot_Side  / SCALING_FACTOR);

      coldSideTopGraph.style.setProperty(
        "--level",
        `${map(messageObject.CoolingState.Temp_Top_Cool_Side / SCALING_FACTOR, 0, 40, 0, 100)}%`
      );
      coldSideBotGraph.style.setProperty(
        "--level",
        `${map(messageObject.CoolingState.Temp_Bottom_Cool_Side / SCALING_FACTOR, 0, 40, 0, 100)}%`
      );
      hotSideGraph.style.setProperty(
        "--level",
        `${map(messageObject.CoolingState.Temp_Hot_Side / SCALING_FACTOR, 0, 80, 0, 100)}%`
      );

      coldSideTopLabel.setValue(formatValue(messageObject.CoolingState.Temp_Top_Cool_Side / SCALING_FACTOR));
      coldSideBottomLabel.setValue(formatValue(messageObject.CoolingState.Temp_Bottom_Cool_Side / SCALING_FACTOR));
      hotSideLabel.setValue(formatValue(messageObject.CoolingState.Temp_Hot_Side / SCALING_FACTOR));

      const newTecData = [
        messageObject.CoolingState.TopTEC.TECVoltage / SCALING_FACTOR,
        messageObject.CoolingState.TopTEC.TECCurrent / SCALING_FACTOR,
        messageObject.CoolingState.BottomTEC.TECVoltage / SCALING_FACTOR,
        messageObject.CoolingState.BottomTEC.TECCurrent / SCALING_FACTOR,
      ];
      tecPlot.setData(addAndConfine(tecPlot.data, newTecData, TECHistory));
      setPowerBlockValues("tec-top", messageObject.CoolingState.TopTEC.TECVoltage / SCALING_FACTOR, messageObject.CoolingState.TopTEC.TECCurrent / SCALING_FACTOR);
      setPowerBlockValues("tec-bot", messageObject.CoolingState.BottomTEC.TECVoltage / SCALING_FACTOR, messageObject.CoolingState.BottomTEC.TECCurrent / SCALING_FACTOR);
      document.querySelector('#fan .power-list div:nth-child(2) .value').innerText = formatValue(messageObject.CoolingState.fan.FanPercentage);
      break;
    case "SystemStatus":
      // TODO format value strings
      const cpu = (messageObject.SystemStatus.cpuUsage / SCALING_FACTOR).toFixed(2);
      errorCount.innerText = messageObject.SystemStatus.rawErrorCount;

      payloadState.innerText = Number(messageObject.SystemStatus.currentPayloadState).toString(16).padStart(2,"0");
      FCSState.innerText = Number(messageObject.SystemStatus.lastFCSState).toString(16).padStart(2,"0");

      cpuUsage.innerText = `${cpu}%`
      cpuLabel.setValue(cpu);
      storageCapacity.innerText = `${messageObject.SystemStatus.storageCapacity}MB`;

      const newGyroData = [
        messageObject.SystemStatus.IMU.gyroX / SCALING_FACTOR,
        messageObject.SystemStatus.IMU.gyroY / SCALING_FACTOR,
        messageObject.SystemStatus.IMU.gyroZ / SCALING_FACTOR,
      ];
      imuGyrolSparkline.setData(
        addAndConfine(imuGyrolSparkline.data, newGyroData, IMUHistory)
      );

      const newAccelData = [
        messageObject.SystemStatus.IMU.accX / SCALING_FACTOR,
        messageObject.SystemStatus.IMU.accY / SCALING_FACTOR,
        messageObject.SystemStatus.IMU.accZ / SCALING_FACTOR,
      ];

      newAccelData.push(
        Math.sqrt(
          Math.pow(newAccelData[0], 2) +
          Math.pow(newAccelData[1], 2) +
          Math.pow(newAccelData[2], 2)
        )
      );
      imuAccelSparkline.setData(
        addAndConfine(imuAccelSparkline.data, newAccelData, IMUHistory)
      );

      animate_data(
        [newAccelData[0], newAccelData[1], newAccelData[2]],
        [newGyroData[0], newGyroData[1], newGyroData[2]],
        Date.now() - previousTime
      );
      break;
    default:
      console.error(`Unknown messageType ${messageType}`)
  }
}

function detectColorScheme(){
  var theme="light";    //default to light

  //local storage is used to override OS theme settings
  if(localStorage.getItem("theme")){
      if(localStorage.getItem("theme") == "dark"){
          var theme = "dark";
      }
  } else if(!window.matchMedia) {
      //matchMedia method not supported
      return false;
  } else if(window.matchMedia("(prefers-color-scheme: dark)").matches) {
      //OS theme setting detected as dark
      var theme = "dark";
  }

  //dark theme preferred, set document with a `data-theme` attribute
  if (theme=="dark") {
    document.body.classList.add("dark");
  } else  {
    document.body.classList.remove("dark");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  detectColorScheme();

  init();

  if(!demoMode) {
    /* setup weboscket hooks  */
    socketClient.onMessage(parseMessage);
  } else  {
    const demoModeIndicator = document.getElementById("demo-mode");
    demoModeIndicator.style.display = "block";

    function update() {
      const t = Date.now();
      lastMessageTime = t;

      chambers.forEach((c, i) => {
        const d =
          Math.round(
            (1 * Math.random() +
              9 * Math.sin((t / 5000) * i * 2 * Math.PI) +
              10) *
              1000
          ) / 1000;

        c.sparkline.setData(
          addAndConfine(c.sparkline.data, d, experimentHistory)
        );

        c.chamber.style.setProperty(
          "--level",
          `${100 - Math.min(Math.max((d / 20) * 100, 0), 100)}%`
        );
      });

      const newGyroData = [
        0,0,0
      ];
      imuGyrolSparkline.setData(
        addAndConfine(imuGyrolSparkline.data, newGyroData, IMUHistory)
      );

      const newAccelData = [
        0,
        2,
        0
      ];

      newAccelData.push(
        Math.sqrt(
          Math.pow(newAccelData[0], 2) +
            Math.pow(newAccelData[1], 2) +
            Math.pow(newAccelData[2], 2)
        )
      );
      imuAccelSparkline.setData(
        addAndConfine(imuAccelSparkline.data, newAccelData, IMUHistory)
      );

      animate_data(
        [newAccelData[0], newAccelData[1], newAccelData[2]],
        [newGyroData[0], newGyroData[1], newGyroData[2]],
        Date.now() - previousTime
      );

      const newTempData = [
        Math.round(
          (Math.random() * 0.2 +
            20 +
            2 * Math.sin((t / 7000) * 2 * Math.PI + 0)) *
            1000
        ) / 1000,
        Math.round(
          (Math.random() * 0.2 +
            20 +
            2 * Math.sin((t / 7000) * 2 * Math.PI + Math.PI / 2)) *
            1000
        ) / 1000,
        Math.round(
          (Math.random() * 2 +
            50 +
            15 * Math.cos((t / 7000) * 2 * Math.PI + Math.PI / 4)) *
            1000
        ) / 1000,
      ];
      tempPlot.setData(addAndConfine(tempPlot.data, newTempData, TempHistory));

      coldSideTopValue.innerText = formatValue(newTempData[0]);
      coldSideBotValue.innerText = formatValue(newTempData[1]);
      hotSideValue.innerText = formatValue(newTempData[2]);

      coldSideTopGraph.style.setProperty(
        "--level",
        `${map(newTempData[0], 0, 40, 0, 100)}%`
      );
      coldSideBotGraph.style.setProperty(
        "--level",
        `${map(newTempData[1], 0, 40, 0, 100)}%`
      );
      hotSideGraph.style.setProperty(
        "--level",
        `${map(newTempData[2], 0, 80, 0, 100)}%`
      );

      coldSideTopLabel.setValue(formatValue(newTempData[0]));
      coldSideBottomLabel.setValue(formatValue(newTempData[1]));
      hotSideLabel.setValue(formatValue(newTempData[2]));

      const newTecData = [
        Math.round(
          (Math.random() * 0.1 + 7 + 2 * Math.sin((t / 7000) * 2 * Math.PI + 0)) *
            1000
        ) / 1000,
        Math.round(
          (Math.random() * 0.1 + 2 + 1 * Math.sin((t / 10000) * 3 * Math.PI)) *
            1000
        ) / 1000,
        Math.round(
          (Math.random() * 0.1 + 7 + 2 * Math.cos((t / 7000) * 2 * Math.PI + 0)) *
            1000
        ) / 1000,
        Math.round(
          (Math.random() * 0.1 + 2 + 1 * Math.cos((t / 10000) * 3 * Math.PI)) *
            1000
        ) / 1000,
      ];
      tecPlot.setData(addAndConfine(tecPlot.data, newTecData, TECHistory));
      setPowerBlockValues("tec-top", newTecData[0], newTecData[1]);
      setPowerBlockValues("tec-bot", newTecData[2], newTecData[3]);
      document.querySelector('#fan .power-list div:nth-child(2) .value').innerText = formatValue(Math.random() * 100.0);

      const newPowerData = [
        Math.round(
          (Math.random() * 0.1 + 15.2 + 2 * Math.sin((t / 4000) * 2 * Math.PI + 0)) *
            1000
        ) / 1000,
        Math.round(
          (Math.random() * 0.1 + 2 + 1 * Math.sin((t / 60000) * 3 * Math.PI)) *
            1000
        ) / 1000,
        Math.round(
          (Math.random() * 0.2 + 35 + 2 * Math.cos((t / 7000) * 2 * Math.PI + 0)) *
            1000
        ) / 1000,
        Math.round(
          (Math.random() * 0.3 + 1.2 + 1 * Math.cos((t / 80000) * 3 * Math.PI)) *
            1000
        ) / 1000,
      ];
      powerPlot.setData(
        addAndConfine(powerPlot.data, newPowerData, PowerHistory)
      );
      setPowerBlockValues("RailBat", newPowerData[0], newPowerData[1]);
      setPowerBlockValues("RailChrgIn", newPowerData[2], newPowerData[3]);
      batteryVoltageLabel.setValue(formatValue(newPowerData[0]));
      chargePowerInLabel.setValue(formatValue(newPowerData[2] * newPowerData[3]));

      const msg_types = ['Experiment Top', 'Experiment Bottom', 'Temperature', "TEC", "IMU", "Power", "System", "Heartbeat"];
      previousTime = appendTableRow(LogHistory, Date.now(),msg_types[(Math.random() * msg_types.length) | 0], previousTime);
    }
    setInterval(update, demoLoopIntervalMs);
  }

  /* UI update loop */
  const lastMsgTime = document.getElementById("last-msg");

  setInterval(() => {
    let level = parseFloat(
      getComputedStyle(coldSideTopGraph).getPropertyValue("--level")
    );
    let athLevel = parseFloat(
      getComputedStyle(coldSideTopGraph).getPropertyValue("--ath-level")
    );
    coldSideTopGraph.style.setProperty(
      "--ath-level",
      `${arcurve(level, athLevel)}%`
    );

    level = parseFloat(
      getComputedStyle(coldSideBotGraph).getPropertyValue("--level")
    );
    athLevel = parseFloat(
      getComputedStyle(coldSideBotGraph).getPropertyValue("--ath-level")
    );
    coldSideBotGraph.style.setProperty(
      "--ath-level",
      `${arcurve(level, athLevel)}%`
    );

    level = parseFloat(
      getComputedStyle(hotSideGraph).getPropertyValue("--level")
    );
    athLevel = parseFloat(
      getComputedStyle(hotSideGraph).getPropertyValue("--ath-level")
    );
    hotSideGraph.style.setProperty(
      "--ath-level",
      `${arcurve(level, athLevel)}%`
    );

    let delta = Date.now() - lastMessageTime;
    lastMsgTime.innerText = String(Math.round(delta)).padStart(4, "0");

    }, uiUpdateLoopIntervalMs);
});

window.addEventListener("resize", (e) => {
  chambers.forEach((c) => {
    c.sparkline.setSize(c.sparkline.getSize());
  });
  imuAccelSparkline.setSize(imuAccelSparkline.getSize());
  imuGyrolSparkline.setSize(imuGyrolSparkline.getSize());
  tempPlot.setSize(tempPlot.getSize());
  tecPlot.setSize(tecPlot.getSize());
  powerPlot.setSize(powerPlot.getSize());
});
