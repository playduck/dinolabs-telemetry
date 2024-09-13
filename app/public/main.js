import {
  animate_data,
  batteryVoltageLabel,
  chargePowerInLabel,
  coldSideBottomLabel,
  coldSideTopLabel,
  hotSideLabel } from './visualization.js';

import socketClient from './socket-client.js';

const chambers = [];
let imuAccelSparkline;
let imuGyrolSparkline;
let tempPlot;
let tecPlot;
let powerPlot;

const experimentHistory = 60;
const IMUHistory = 60;
const TempHistory = 60;
const TECHistory = 60;
const PowerHistory = 60;
const LogHistory = 60;

let coldSideTopGraph, coldSideTopValue;
let coldSideBotGraph, coldSideBotValue;
let hotSideGraph, hotSideValue;
let messageLog;
let previousTime = 0;

let colors = {
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
  // focus: {
  //     prox: 16,
  // },
  sync: {
    key: mooSync.key,
    setSeries: true,
    match: [matchSyncKeys, matchSyncKeys],
  },
};

function getColors() {
  const style = getComputedStyle(document.body);
  Object.keys(colors).forEach((color) => {
    colors[color] = style.getPropertyValue(color);
  });
}

function arcurve(level, ath) {
  let alpha = 1;
  if (level >= ath) {
    alpha = 1;
  } else {
    alpha = 0.0125;
  }

  return alpha * level + (1 - alpha) * ath;
}

function mixColors(color1, color2, ratio = 0.5) {
  // Convert hex strings to RGB
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  // Calculate the mixed RGB values
  const mixedRgb = {
    r: Math.round(rgb1.r * (1 - ratio) + rgb2.r * ratio),
    g: Math.round(rgb1.g * (1 - ratio) + rgb2.g * ratio),
    b: Math.round(rgb1.b * (1 - ratio) + rgb2.b * ratio),
  };

  // Convert the mixed RGB back to a hex string
  return rgbToHex(mixedRgb);
}

// Helper function to convert a hex string to an RGB object
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// Helper function to convert an RGB object to a hex string
function rgbToHex(rgb) {
  return `#${((1 << 24) + (rgb.r << 16) + (rgb.g << 8) + rgb.b)
    .toString(16)
    .slice(1)}`;
}

function generateRandomNumbers(count, meanVal, stdDev = 3, axesCount = 1) {
  let values = Array(axesCount + 1)
    .fill(0)
    .map(() => []);
  for (let i = 0; i < count; i++) {
    values[0].push(i); // Time axis
    for (let j = 1; j <= axesCount; j++) {
      // Generate two random numbers between 0 and 1
      let u1 = Math.random();
      let u2 = Math.random();
      // Use the Box-Muller transform to generate a normally distributed random number
      let randomVal = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      // Scale the random number to have the specified mean and standard deviation
      let scaledVal = Math.round((meanVal + randomVal * stdDev) * 1000) / 1000;
      values[j].push(scaledVal);
    }
  }
  return values;
}

function formatValue(x) {
  let prefix = x >= 0 ? "+" : ""; // automatic prefix for negative values
  let integerPart = Math.abs(x).toFixed(0).padStart(2, "0"); // pad the integer part
  let decimalPart = x.toFixed(2).split('.')[1]; // get the decimal part
  return `${prefix}${integerPart}.${decimalPart}`;
}

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
        range: [0, 20],
      },
    },
    legend: {
      show: false,
    },
    axes: [
      {
        show: true,
        size: 0,
      },
      {
        show: true,
        size: 35,
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
    chamber: chamber,
    sparkline: u,
  });

  return u;
}

function clearAll() {
  const elements = [...document.getElementsByClassName("value")];
  elements.forEach((element) => {
    element.innerHTML = "+00.00";
  });
}

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
        },
      {
        show: true,
        size: 40,
        gap: 0,
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
      },
      {
        show: true,
        size: 30,
        label: "Temperature °C",
        labelGap: 8,
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
          },
      {
        scale: "v",
        show: true,
        size: 30,
        label: "Voltage (V)",
        labelGap: 8,
      },
      {
        scale: "i",
        show: true,
        size: 30,
        label: "Current (A)",
        side: 1,
        labelGap: 8,
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
      },
      {
        label: "Fan V",
        width: 2,
        scale: "v",
        stroke: colors["--warr-blue-1"]
      },
      {
        label: "Fan I",
        width: 2,
        scale: "i",
        stroke: colors["--warr-red"],
      },
    ],
  };

  const data = [[], [], [], [], [], [], []];
  const u = new uPlot(opts, data, element);
  u.getSize = getSize;

  return u;
}

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
          },
      {
        scale: "v",
        show: true,
        size: 30,
        label: "Voltage (V)",
        labelGap: 8,
      },
      {
        scale: "i",
        show: true,
        size: 30,
        label: "Current (A)",
        side: 1,
        labelGap: 8,
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

function setPowerBlockValues(id, voltage, current, power) {
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

function appendTableRow(element, limit, time, type, previousTime) {
    // Create a new table row element
    const row = document.createElement('tr');

    // Create three new table cell elements and append them to the row
    const cell1 = document.createElement('td');
    cell1.textContent = time.toString();
    row.appendChild(cell1);

    const cell2 = document.createElement('td');
    if (previousTime !== undefined) {
      const delta = time - previousTime;
      cell2.textContent = `${delta} ms`;
    } else {
      cell2.textContent = '';
    }
    row.appendChild(cell2);

    const cell3 = document.createElement('td');
    cell3.textContent = type;
    row.appendChild(cell3);

    // Append the new row to the element
    element.insertBefore(row, element.firstChild);

    // If the element has more than the limit number of children, remove the oldest
    if (element.children.length > limit) {
      element.removeChild(element.lastChild);
    }

    return time;
}

document.addEventListener("DOMContentLoaded", () => {
  getColors();

  let coldSideTop = document.getElementById("temp-cold-side-top");
  coldSideTopGraph = [
    ...coldSideTop.getElementsByClassName("temperature-bar"),
  ][0];
  coldSideTopValue = [...coldSideTop.getElementsByClassName("value")][0];

  let coldSideBot = document.getElementById("temp-cold-side-bot");
  coldSideBotGraph = [
    ...coldSideBot.getElementsByClassName("temperature-bar"),
  ][0];
  coldSideBotValue = [...coldSideBot.getElementsByClassName("value")][0];

  let hotSide = document.getElementById("temp-hot-side");
  hotSideGraph = [...hotSide.getElementsByClassName("temperature-bar")][0];
  hotSideValue = [...hotSide.getElementsByClassName("value")][0];

  messageLog = document.getElementById("message-scroll-block");

  const topChambers = document.getElementById("top-chambers");
  const botChambers = document.getElementById("bot-chambers");
  for (let i = 1; i <= 4; i++) {
    mooSync.sub(generateChamber(i, topChambers));
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

  clearAll();

  socketClient.onConnect();
  socketClient.onDisconnect();

  socketClient.onMessage((message) => {
    console.log(`Received message from server: ${message}`);
  });



  function update() {
    const t = Date.now();

    /* TODO remove */
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
      Math.round(
        (Math.random() * 0.1 +
          10 +
          2 * Math.cos((t / 9000) * 2 * Math.PI + 0)) *
          1000
      ) / 1000,
      Math.round(
        (Math.random() * 0.1 +
          0.7 +
          0.3 * Math.cos((t / 11000) * 3 * Math.PI)) *
          1000
      ) / 1000,
    ];
    tecPlot.setData(addAndConfine(tecPlot.data, newTecData, TECHistory));
    setPowerBlockValues("tec-top", newTecData[0], newTecData[1]);
    setPowerBlockValues("tec-bot", newTecData[2], newTecData[3]);
    setPowerBlockValues("fan", newTecData[4], newTecData[5]);

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
    previousTime = appendTableRow(messageLog, LogHistory, Date.now(),msg_types[(Math.random() * msg_types.length) | 0], previousTime);

  }
  setInterval(update, 250);

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

    }, 100);
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
