import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import Stats from "three/examples/jsm/libs/stats.module.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ViewHelper } from "three/addons/helpers/ViewHelper.js";
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

import { MeshLine, MeshLineMaterial, MeshLineRaycast } from 'three.meshline';

let canvas;
let camera, scene, renderer, controls, stats, helper, labelRenderer;

let mesh_group = new THREE.Group();

let batteryVoltageLabel, chargePowerInLabel, coldSideBottomLabel, hotSideLabel, coldSideTopLabel, cpuLabel;

function createValueUnitElement(name, unit, unitText) {
  // Create the div element
  const div = document.createElement('div');
  div.className = "floating";

  const nameSpan = document.createElement('span');
  nameSpan.className = 'name';
  nameSpan.innerText = name;

  const container = document.createElement('div');

  // Create the span for value
  const valueSpan = document.createElement('span');
  valueSpan.className = 'value';

  // Create the span for unit
  const unitSpan = document.createElement('span');
  unitSpan.className = `unit ${unit}`;
  unitSpan.textContent = unitText;

  // Append the spans to the div
  container.appendChild(valueSpan);
  container.appendChild(unitSpan);
  div.appendChild(nameSpan);
  div.appendChild(container);

  function setValue(value) {
    valueSpan.innerText = value;
  }
  div.setValue = setValue;

  return div;
}

document.addEventListener("DOMContentLoaded", () => {
  canvas = document.getElementById("canvas-3d");

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0xffffff, 0.05);

  camera = new THREE.PerspectiveCamera(50, canvas.getBoundingClientRect().width / canvas.getBoundingClientRect().height, 0.1, 1000);
  camera.position.set(4.5,2,2.5);
  camera.layers.enableAll();

  renderer = new THREE.WebGLRenderer({antialias: true,alpha: false});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height);
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvas.appendChild(renderer.domElement);

  labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize( canvas.getBoundingClientRect().width, canvas.getBoundingClientRect().height);
  labelRenderer.domElement.style.position = 'absolute';
  labelRenderer.domElement.style.left = '0';
  labelRenderer.domElement.style.pointerEvents = 'none';
  canvas.appendChild( labelRenderer.domElement );

  controls = new OrbitControls(camera, renderer.domElement);
  controls.minDistance = 1;
  controls.maxDistance = 10;
  controls.enableDamping = false;
  controls.target.set(0, 1.25, 0);
  controls.update();

  const grid = new THREE.GridHelper(100, 570, 0xa9a9a9, 0x9c9c9c);
  grid.material.opacity = 0.5;
  grid.material.depthWrite = false;
  grid.material.transparent = true;
  scene.add(grid);

  const axesHelper = new THREE.AxesHelper(20);
  axesHelper.setColors(
    getComputedStyle(document.body).getPropertyValue("--warr-red"),
    getComputedStyle(document.body).getPropertyValue("--warr-green"),
    getComputedStyle(document.body).getPropertyValue("--warr-blue-2")
  );
  scene.add(axesHelper);
  helper = new ViewHelper(camera, renderer.domElement);

  /*
  const statsContainer = document.createElement("div");

  statsContainer.style.position = "absolute";
  statsContainer.style.left = "1ex";
  statsContainer.style.bottom = "1ex";
  statsContainer.style.opacity = 0.65;
  statsContainer.style.display = "block";

  let stats1 = new Stats();
  stats1.showPanel(0);
  stats1.dom.style.position = "relative";
  statsContainer.appendChild(stats1.dom);

  let stats2 = new Stats();
  stats2.showPanel(1);
  stats2.dom.style.position = "relative";
  statsContainer.appendChild(stats2.dom);

  canvas.appendChild(statsContainer);
  */

  const gltfLoader = new GLTFLoader();
  const url = "assets/main_assembly-opt.glb";
  gltfLoader.load(url, (gltf) => {
    const pivot_y = 1.5
    const root = gltf.scene;

    root.scale.set(10, 10, 10);
    root.rotation.y = Math.PI / 2;

    const box = new THREE.BoxHelper(root, 0xa8d8f7);
    scene.add(box);

    root.position.set(0, -pivot_y, 0);

    root.traverse((child) => {

      // if(child.name == "sensor_board_PCB_primitive0") {
      //   const material = new THREE.MeshBasicMaterial( { color: 0xff0000 } );
      //   child.material = material;
      //   child.rotation.x = 1.23
      //   console.log(child)
      // }

      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });

    mesh_group.add(root);
    mesh_group.position.set(0, pivot_y, 0);
    scene.add(mesh_group);
  });

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
  scene.add(ambientLight);

  const directionalLight1 = new THREE.DirectionalLight(0xffffff, 2);
  directionalLight1.position.set(5, 10, 2);
  directionalLight1.castShadow = true;
  directionalLight1.shadow.camera.updateProjectionMatrix();
  directionalLight1.shadow.mapSize.width = 512;
  directionalLight1.shadow.mapSize.height = directionalLight1.shadow.mapSize.height;
  directionalLight1.shadow.camera.near = 0.5;
  directionalLight1.shadow.camera.far = 500;
  scene.add(directionalLight1);

  const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
  directionalLight2.position.set(5, 1 - 1);
  scene.add(directionalLight2);

  const planeGeometry = new THREE.PlaneGeometry(10, 10);
  var planeMaterial = new THREE.ShadowMaterial();
  planeMaterial.opacity = 0.8;
  const plane = new THREE.Mesh(planeGeometry, planeMaterial);
  plane.position.set(0, -0.5, 0);
  plane.rotation.x = -Math.PI / 2;
  plane.receiveShadow = true;
  scene.add(plane);

  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingLook = THREE.AgXHighContrastLook;
  renderer.toneMappingExposure = 1.25;

  function addLabel(h, v, points, div) {
      const labelPosition = new THREE.Vector3(0.8, v - 0.5, h * 1)
      points.push(labelPosition);

      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new MeshLine();
      line.setGeometry(geometry);
      const material = new MeshLineMaterial({
        color: 0x7bb0dd,
        sizeAttenuation: 1,
        lineWidth: 0.0333
      });
      const mesh = new THREE.Mesh(line, material);
      mesh.layers.enableAll();

      const label3d = new CSS2DObject( div );
      label3d.position.set( labelPosition.x, labelPosition.y, labelPosition.z );
      label3d.center.set( 0.5, 0.5 );
      mesh.add(label3d);
      label3d.layers.set( 0 );

      return mesh
  }


  let points = [new THREE.Vector3(0.0,0.4,0), new THREE.Vector3(0.5,0.4,0)];
  batteryVoltageLabel = createValueUnitElement("Battery", "voltage", "V");
  scene.add( addLabel(1,1, points, batteryVoltageLabel) );

  points = [new THREE.Vector3(0.3,1.06,-0.1), new THREE.Vector3(0.5,1.06,-0.2)];
  chargePowerInLabel = createValueUnitElement("Charge Power", "power", "W");
  scene.add( addLabel(-1,1, points, chargePowerInLabel) );

  points = [new THREE.Vector3(0.2,1.9,0), new THREE.Vector3(0.5,1.85,0.2)];
  coldSideBottomLabel = createValueUnitElement("Cold-Side Bot", "temperature", "°C");
  scene.add( addLabel(1,2, points, coldSideBottomLabel) );

  points = [new THREE.Vector3(0.2,2.4,0), new THREE.Vector3(0.5,2.45,0.2)];
  coldSideTopLabel = createValueUnitElement("Cold-Side Top", "temperature", "°C");
  scene.add( addLabel(1,3, points, coldSideTopLabel) );

  points = [new THREE.Vector3(0.0,1.25,0), new THREE.Vector3(0.5,1.35,-0.2)];
  cpuLabel = createValueUnitElement("CPU ", "percentage", "%");
  scene.add( addLabel(-1,2, points, cpuLabel) );

  points = [new THREE.Vector3(-0.4,2.15,0), new THREE.Vector3(0.5,2.15,-0.2)];
  hotSideLabel = createValueUnitElement("Hot-Side ", "temperature", "°C");
  scene.add( addLabel(-1,3, points, hotSideLabel) );

  batteryVoltageLabel.setValue("+00.00");
  chargePowerInLabel.setValue("+00.00");
  coldSideBottomLabel.setValue("+00.00");
  coldSideTopLabel.setValue("+00.00");
  hotSideLabel.setValue("+00.00");
  cpuLabel.setValue("00.00");

  // Update the lighting setup to follow the camera
  function updateLights() {}

  function animate() {
    controls.update();
    updateLights();
    renderer.clear();
    helper.render(renderer);
    renderer.render(scene, camera);
    labelRenderer.render( scene, camera );
    // stats1.update();
    // stats2.update();
  }
  renderer.setAnimationLoop(animate);

  function resize() {
    const rect = canvas.getBoundingClientRect();

    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();

    renderer.setSize(rect.width, rect.height - 10);
    labelRenderer.setSize(rect.width, rect.height - 25);
  }

  window.addEventListener("resize", resize);
  setTimeout(resize, 100);
});

let roll = 0;
let pitch = 0;
let yaw = 0;

const DEG_TO_RAD = Math.PI / 180;

let gyroWeight = 0.15;
let accelWeight = 1 - gyroWeight;

let filteredAngle;
let accelAngle;
let gyroRate;

const alpha = 0.1;

function animate_data(acc, gyro, dt) {

  gyroRate = gyro.map((x) => x * DEG_TO_RAD);

  accelAngle = Math.atan2(acc[1], acc[2]);
  pitch += accelWeight * (accelAngle - pitch);

  accelAngle = Math.atan2(acc[0], acc[2]);
  roll += accelWeight * (accelAngle - roll);

  filteredAngle = roll + gyroRate[0] * dt;
  roll = gyroWeight * filteredAngle + (1 - gyroWeight) * roll;

  filteredAngle = pitch + gyroRate[1] * dt;
  pitch = gyroWeight * filteredAngle + (1 - gyroWeight) * pitch;

  roll = roll;
  pitch = -pitch - Math.PI * 0.6;

  // const pitch = Math.atan(accelerationX/Math.sqrt(accelerationY*accelerationY + accelerationZ*accelerationZ));
  // const roll  = Math.atan(-accelerationY/Math.sqrt(accelerationX*accelerationX + accelerationZ*accelerationZ)) - (Math.PI/2);
  yaw = Math.atan(acc[2] / Math.sqrt(acc[0] * acc[0] + acc[2] * acc[2])) - Math.PI / 4;

  //  console.log(pitch, roll, yaw)

  if (!(isNaN(pitch) || isNaN(roll) || isNaN(yaw))) {
    mesh_group.rotation.x = ((1 - alpha) * mesh_group.rotation.x) + (alpha * pitch);
    mesh_group.rotation.y = ((1 - alpha) * mesh_group.rotation.y) + (alpha * roll);
    mesh_group.rotation.z = ((1 - alpha) * mesh_group.rotation.z) + (alpha * yaw);
  } else {
    roll = 0;
    pitch = 0;
    yaw = 0;
  }
}

export {
  animate_data,
  batteryVoltageLabel,
  chargePowerInLabel,
  coldSideBottomLabel,
  coldSideTopLabel,
  hotSideLabel
}
