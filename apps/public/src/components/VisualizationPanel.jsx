import { onMount, onCleanup, createSignal, createEffect } from 'solid-js';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { ViewHelper } from 'three/addons/helpers/ViewHelper.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { MeshLine, MeshLineMaterial } from 'three.meshline';
import { BsArrowCounterclockwise } from 'solid-icons/bs';
import styles from './VisualizationPanel.module.css';
import Panel from './shared/Panel';
import { useIMUStatus } from '../hooks/useTelemetryState';
import { useTheme } from '../contexts/ThemeContext';

function VisualizationPanel({ className }) {
  // Check if mobile device
  const isMobile = () => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth <= 768 || (window.innerWidth <= 900 && window.innerHeight <= 700);
  };

  // Don't render 3D on mobile to save power
  if (isMobile()) {
    return null;
  }

  const [canvasRef, setCanvasRef] = createSignal(null);
  const imuData = useIMUStatus();
  const { theme } = useTheme();

  let camera, scene, renderer, controls, helper, labelRenderer;
  let meshGroup = new THREE.Group();
  let animationId;
  let grid, axesHelper; // Store references for theme updates

  // Default camera position
  const defaultCameraPosition = new THREE.Vector3(4.2, 2.2, 1.0);
  const defaultTarget = new THREE.Vector3(0.0, 1.0, 0);

  // Label references for telemetry data
  let batteryVoltageLabel, chargePowerInLabel, coldSideBottomLabel, hotSideLabel, coldSideTopLabel, cpuLabel;

  // Vector visualization arrows
  let accelArrow, magArrow;
  let accelLabel, magLabel;

  // Simple reset function - no state management
  const resetCamera = () => {
    if (!camera || !controls) return;
    camera.position.copy(defaultCameraPosition);
    controls.target.copy(defaultTarget);
    controls.update();
  };

  // Helper function to create value/unit display elements
  function createValueUnitElement(name, unit, unitText) {
    const div = document.createElement('div');
    div.className = styles.floating;

    const nameSpan = document.createElement('span');
    nameSpan.className = styles.name;
    nameSpan.innerText = name;

    const container = document.createElement('div');

    const valueSpan = document.createElement('span');
    valueSpan.className = styles.value;

    const unitSpan = document.createElement('span');
    unitSpan.className = `${styles.unit} ${styles[unit]}`;
    unitSpan.textContent = unitText;

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

  // Helper function to add labels with connecting lines
  function addLabel(h, v, points, div) {
    const labelPosition = new THREE.Vector3(0.8, v - 0.5, h * 1);
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

    const label3d = new CSS2DObject(div);
    label3d.position.set(labelPosition.x, labelPosition.y, labelPosition.z);
    label3d.center.set(0.5, 0.5);
    mesh.add(label3d);
    label3d.layers.set(0);

    return mesh;
  }

  // Initialize Three.js scene
  function initScene() {
    const canvas = canvasRef();
    if (!canvas) return;

    // Get theme colors
    const themeColors = theme().colors;
    const bgColor = new THREE.Color(themeColors.background);
    const gridColor1 = new THREE.Color(themeColors.grid);
    const gridColor2 = new THREE.Color(themeColors.gridSecondary);

    // Scene setup
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(bgColor.getHex(), 0.05);

    // Camera setup
    const rect = canvas.getBoundingClientRect();
    camera = new THREE.PerspectiveCamera(50, rect.width / rect.height, 0.1, 1000);
    camera.position.copy(defaultCameraPosition);
    camera.layers.enableAll();

    // WebGL Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(rect.width, rect.height);
    renderer.setClearColor(bgColor.getHex(), 1);
    renderer.autoClear = false;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.25;
    canvas.appendChild(renderer.domElement);

    // CSS2D Renderer for labels
    labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(rect.width, rect.height);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.left = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    canvas.appendChild(labelRenderer.domElement);

    // Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.minDistance = 1;
    controls.maxDistance = 10;
    controls.enableDamping = false;
    controls.target.copy(defaultTarget);

    // Configure controls for mobile - disable scroll/wheel but keep touch
    const isMobile = window.innerWidth <= 768 || (window.innerWidth <= 900 && window.innerHeight <= 700);
    if (isMobile) {
      // Disable zoom via mouse wheel/scroll to prevent page scroll interference
      controls.enableZoom = false;
      // Keep rotation enabled for touch gestures
      controls.enableRotate = true;
      controls.enablePan = true;
      // Disable right-click context menu interactions
      controls.enableKeys = false;
    }

    controls.update();

    // Grid with theme colors
    grid = new THREE.GridHelper(100, 570, gridColor1.getHex(), gridColor2.getHex());
    grid.material.opacity = 0.5;
    grid.material.depthWrite = false;
    grid.material.transparent = true;
    scene.add(grid);

    // Axes helper with WARR theme colors
    axesHelper = new THREE.AxesHelper(20);
    const red = new THREE.Color(themeColors.warrRed);
    const green = new THREE.Color(themeColors.warrGreen);
    const blue = new THREE.Color(themeColors.warrBlue1);
    axesHelper.setColors(red, green, blue);
    scene.add(axesHelper);

    // View helper
    helper = new ViewHelper(camera, renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.1);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight1.position.set(5, 10, 2);
    directionalLight1.castShadow = true;
    directionalLight1.shadow.camera.updateProjectionMatrix();
    directionalLight1.shadow.mapSize.width = 512;
    directionalLight1.shadow.mapSize.height = 512;
    directionalLight1.shadow.camera.near = 0.5;
    directionalLight1.shadow.camera.far = 500;
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight2.position.set(5, 0, -1);
    scene.add(directionalLight2);

    // Shadow plane
    const planeGeometry = new THREE.PlaneGeometry(10, 10);
    const planeMaterial = new THREE.ShadowMaterial();
    planeMaterial.opacity = 0.8;
    const plane = new THREE.Mesh(planeGeometry, planeMaterial);
    plane.position.set(0, -0.5, 0);
    plane.rotation.x = -Math.PI / 2;
    plane.receiveShadow = true;
    scene.add(plane);

    // Load GLTF model
    const dracoLoader = new DRACOLoader();
    // dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    dracoLoader.setDecoderPath('./assets/');
    dracoLoader.setDecoderConfig({ type: 'js' });

    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);

    const url = "assets/payloadc.glb";
    gltfLoader.load(url, (gltf) => {
      const pivotY = 1.5;
      const root = gltf.scene;

      root.scale.set(10, 10, 10);
      root.rotation.y = Math.PI / 2;

      const box = new THREE.BoxHelper(root, 0xa8d8f7);
      scene.add(box);

      root.position.set(0, -pivotY, 0);

      root.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      meshGroup.add(root);
      meshGroup.position.set(0, pivotY, 0);
      scene.add(meshGroup);
    });

    // Create mesh group for model
    scene.add(meshGroup);

    // Create telemetry labels
    // setupTelemetryLabels();

    // Create vector arrows for IMU data
    setupVectorArrows();

    // Start animation loop
    animate();

    // Setup resize handler
    const handleResize = () => resize();
    window.addEventListener('resize', handleResize);

    // Store cleanup function
    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }

  function setupTelemetryLabels() {
    // Battery Voltage
    let points = [new THREE.Vector3(0.0, 0.4, 0), new THREE.Vector3(0.5, 0.4, 0)];
    batteryVoltageLabel = createValueUnitElement("Battery", "voltage", "V");
    scene.add(addLabel(1, 1, points, batteryVoltageLabel));

    // Charge Power
    points = [new THREE.Vector3(0.3, 1.06, -0.1), new THREE.Vector3(0.5, 1.06, -0.2)];
    chargePowerInLabel = createValueUnitElement("Charge Power", "power", "W");
    scene.add(addLabel(-1, 1, points, chargePowerInLabel));

    // Cold Side Bottom
    points = [new THREE.Vector3(0.2, 1.9, 0), new THREE.Vector3(0.5, 1.85, 0.2)];
    coldSideBottomLabel = createValueUnitElement("Cold-Side Bot", "temperature", "°C");
    scene.add(addLabel(1, 2, points, coldSideBottomLabel));

    // Cold Side Top
    points = [new THREE.Vector3(0.2, 2.4, 0), new THREE.Vector3(0.5, 2.45, 0.2)];
    coldSideTopLabel = createValueUnitElement("Cold-Side Top", "temperature", "°C");
    scene.add(addLabel(1, 3, points, coldSideTopLabel));

    // CPU
    points = [new THREE.Vector3(0.0, 1.25, 0), new THREE.Vector3(0.5, 1.35, -0.2)];
    cpuLabel = createValueUnitElement("CPU", "percentage", "%");
    scene.add(addLabel(-1, 2, points, cpuLabel));

    // Hot Side
    points = [new THREE.Vector3(-0.4, 2.15, 0), new THREE.Vector3(0.5, 2.15, -0.2)];
    hotSideLabel = createValueUnitElement("Hot-Side", "temperature", "°C");
    scene.add(addLabel(-1, 3, points, hotSideLabel));

    // Set initial values
    batteryVoltageLabel.setValue("+00.00");
    chargePowerInLabel.setValue("+00.00");
    coldSideBottomLabel.setValue("+00.00");
    coldSideTopLabel.setValue("+00.00");
    hotSideLabel.setValue("+00.00");
    cpuLabel.setValue("00.00");
  }

  // Helper function to create thick arrow with cylinder shaft
  function createThickArrow(color, origin) {
    const group = new THREE.Group();
    group.position.copy(origin);

    // Shaft (cylinder) - much thicker for visibility
    const shaftGeometry = new THREE.CylinderGeometry(0.05, 0.05, 1, 8);
    const shaftMaterial = new THREE.MeshBasicMaterial({ color: color });
    const shaft = new THREE.Mesh(shaftGeometry, shaftMaterial);
    shaft.position.y = 0.5; // Center the shaft

    // Cone head - proportionally larger
    const headGeometry = new THREE.ConeGeometry(0.12, 0.3, 8);
    const headMaterial = new THREE.MeshBasicMaterial({ color: color });
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.15; // At the end of shaft

    group.add(shaft);
    group.add(head);

    // Store references for later updates
    group.userData.shaft = shaft;
    group.userData.head = head;

    // Render on top
    group.traverse((child) => {
      if (child.material) {
        child.material.depthTest = false;
        child.material.depthWrite = false;
        child.renderOrder = 999;
      }
    });

    return group;
  }

  function setupVectorArrows() {
    // Get theme colors
    const themeColors = theme().colors;
    const accelColor = new THREE.Color(themeColors.warrBlue2).getHex();
    const magColor = new THREE.Color(themeColors.warrBlue3).getHex();

    // Acceleration vector arrow (primary color)
    const accelOrigin = new THREE.Vector3(0, 0.75, 0);
    accelArrow = createThickArrow(accelColor, accelOrigin);
    accelArrow.visible = false;
    scene.add(accelArrow);

    // Acceleration label
    const accelLabelDiv = document.createElement('div');
    accelLabelDiv.className = styles.floating;
    accelLabelDiv.style.backgroundColor = themeColors.primary;
    const accelNameSpan = document.createElement('span');
    accelNameSpan.className = styles.name;
    accelNameSpan.innerText = 'Accel';
    const accelValueSpan = document.createElement('span');
    accelValueSpan.className = styles.value;
    accelLabelDiv.appendChild(accelNameSpan);
    accelLabelDiv.appendChild(accelValueSpan);
    accelLabelDiv.setValue = (value) => { accelValueSpan.innerText = value; };

    accelLabel = new CSS2DObject(accelLabelDiv);
    accelLabel.position.set(0, 0.75, 0);
    accelLabel.center.set(0.5, 0.5);
    accelLabel.visible = false;
    scene.add(accelLabel);

    // Magnetic field vector arrow (secondary color)
    const magOrigin = new THREE.Vector3(0, 0.75, 0);
    magArrow = createThickArrow(magColor, magOrigin);
    magArrow.visible = false;
    scene.add(magArrow);

    // Magnetic field label
    const magLabelDiv = document.createElement('div');
    magLabelDiv.className = styles.floating;
    magLabelDiv.style.backgroundColor = themeColors.secondary;
    const magNameSpan = document.createElement('span');
    magNameSpan.className = styles.name;
    magNameSpan.innerText = 'Mag';
    const magValueSpan = document.createElement('span');
    magValueSpan.className = styles.value;
    magLabelDiv.appendChild(magNameSpan);
    magLabelDiv.appendChild(magValueSpan);
    magLabelDiv.setValue = (value) => { magValueSpan.innerText = value; };

    magLabel = new CSS2DObject(magLabelDiv);
    magLabel.position.set(0, 0.75, 0);
    magLabel.center.set(0.5, 0.5);
    magLabel.visible = false;
    scene.add(magLabel);
  }

  function updateVectorArrows() {
    const data = imuData();
    if (!data || !accelArrow || !magArrow) return;

    // Helper to update a custom arrow
    function updateArrow(arrow, label, vector, magnitude, lengthScale, labelOffset) {
      if (magnitude > 0.01) {
        const direction = vector.clone().normalize();
        const length = Math.min(magnitude * lengthScale, 5);

        // Rotate arrow to point in direction
        const quaternion = new THREE.Quaternion();
        quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
        arrow.setRotationFromQuaternion(quaternion);

        // Scale shaft to length
        const shaft = arrow.userData.shaft;
        const head = arrow.userData.head;
        shaft.scale.y = length;
        shaft.position.y = length / 2;
        head.position.y = length + 0.1;

        arrow.visible = true;

        // Update label
        const labelPos = direction.clone().multiplyScalar(length + labelOffset);
        labelPos.add(arrow.position);
        label.position.copy(labelPos);
        label.element.setValue(`${magnitude.toFixed(2)}g`);
        label.visible = true;
      } else {
        arrow.visible = false;
        label.visible = false;
      }
    }

    // Update acceleration arrow
    if (data.accelerometer) {
      const { x, y, z } = data.accelerometer;
      if (x !== null && y !== null && z !== null) {
        const accelVector = new THREE.Vector3(x, y, z);
        const magnitude = accelVector.length();
        updateArrow(accelArrow, accelLabel, accelVector, magnitude, 1.0, 0.3);
      }
    }

    // Update magnetic field arrow
    if (data.magnetometer) {
      const { x, y, z } = data.magnetometer;
      if (x !== null && y !== null && z !== null) {
        const magVector = new THREE.Vector3(x, y, z);
        const magnitude = magVector.length();
        updateArrow(magArrow, magLabel, magVector, magnitude, 2.0, 0.3);
        // Update label unit for magnetometer
        if (magLabel.visible) {
          magLabel.element.setValue(`${magnitude.toFixed(2)}G`);
        }
      }
    }
  }

  function animate() {
    animationId = requestAnimationFrame(animate);

    if (controls) controls.update();
    updateVectorArrows(); // Update IMU vectors every frame
    if (renderer && scene && camera) {
      renderer.clear();
      if (helper) helper.render(renderer);
      renderer.render(scene, camera);
      if (labelRenderer) labelRenderer.render(scene, camera);
    }
  }

  function resize() {
    const canvas = canvasRef();
    if (!canvas || !camera || !renderer || !labelRenderer) return;

    const rect = canvas.getBoundingClientRect();
    camera.aspect = rect.width / rect.height;
    camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height - 10);
    labelRenderer.setSize(rect.width, rect.height - 25);

    // Update mobile detection and controls on resize
    if (controls) {
      const isMobile = window.innerWidth <= 768 || (window.innerWidth <= 900 && window.innerHeight <= 700);
      if (isMobile) {
        // Mobile: disable zoom (scroll) but keep touch rotation and pan
        controls.enableZoom = false;
        controls.enableRotate = true;
        controls.enablePan = true;
        controls.enableKeys = false;
      } else {
        // Desktop: enable all controls
        controls.enableZoom = true;
        controls.enableRotate = true;
        controls.enablePan = true;
        controls.enableKeys = true;
      }
    }
  }

  // Cleanup function
  function cleanup() {
    if (animationId) {
      cancelAnimationFrame(animationId);
    }
    if (controls) {
      controls.dispose();
    }
    if (renderer) {
      renderer.dispose();
    }
  }

  // Update scene colors when theme changes
  createEffect(() => {
    const themeColors = theme().colors;
    if (!scene || !renderer || !grid || !axesHelper) return;

    // Update background and fog
    const bgColor = new THREE.Color(themeColors.background);
    renderer.setClearColor(bgColor.getHex(), 1);
    scene.fog.color.setHex(bgColor.getHex());

    // Update grid colors
    const gridColor1 = new THREE.Color(themeColors.grid);
    const gridColor2 = new THREE.Color(themeColors.gridSecondary);
    grid.material.color.setHex(gridColor1.getHex());

    // Update axes colors
    const red = new THREE.Color(themeColors.warrRed);
    const green = new THREE.Color(themeColors.warrGreen);
    const blue = new THREE.Color(themeColors.warrBlue1);
    axesHelper.setColors(red, green, blue);
  });

  // Solid.js lifecycle
  onMount(() => {
    const cleanupResize = initScene();
    onCleanup(() => {
      cleanup();
      if (cleanupResize) cleanupResize();
    });
  });

  return (
    <Panel
      title="3D Visualization"
      className={className}
      contentClass={styles.contentSection}
    >
      <div class={styles.canvasContainer} ref={setCanvasRef}>
        <button
          class={styles.resetButton}
          onClick={resetCamera}
          title="Reset camera view"
        >
          <BsArrowCounterclockwise />
        </button>
      </div>
    </Panel>
  );
}

export default VisualizationPanel;
