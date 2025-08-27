/**
 * Refactored Three.js ecosystem simulation to reduce stutters:
 *  - Node labels & popups are no longer recreated every frame
 *  - Pulse lines are created once and updated in place
 */

import * as THREE from 'https://unpkg.com/three@0.151.3/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.151.3/examples/jsm/controls/OrbitControls.js';

export function runEcosystem(appendToEl = document.body) {

  // ---------------------------------------------------------------------
  // 0a. Basic Config Constants
  // ---------------------------------------------------------------------
  const VIEW_SIZE = 385;          
  const DOT_FADE_DURATION = 200;  
  const MAX_DOTS_PER_CLICK = 20;  

  // Store intervals to clean up later if needed
  let intervals = [];

  // Simple UUID generator
  function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  // ---------------------------------------------------------------------
  // 0b. Container Setup
  // ---------------------------------------------------------------------
  const rootContainer = appendToEl;

  let simulationContainer = rootContainer.querySelector('.ecosystem-visualization');
  if (!simulationContainer) {
    simulationContainer = document.createElement('div');
    simulationContainer.className = 'ecosystem-visualization';
    rootContainer.appendChild(simulationContainer);
  }

  let threeContainer = simulationContainer.querySelector('#three-container');
  if (!threeContainer) {
    threeContainer = document.createElement('div');
    threeContainer.id = 'three-container';
    simulationContainer.appendChild(threeContainer);
  }

  const nodeSelectEl = simulationContainer.querySelector('#control-panel #node-select');
  const dotsInputEl  = simulationContainer.querySelector('#control-panel #dots-input');
  const addButtonEl  = simulationContainer.querySelector('#control-panel #add-dots-button');
  const controlPanel = simulationContainer.querySelector('#control-panel');
  if (controlPanel) {
    // Hide if found
    controlPanel.style.display = 'none';
  }

  // ---------------------------------------------------------------------
  // 0c. Inject Required Styles
  // ---------------------------------------------------------------------
  const styleContent = `
    /* Ecosystem styles (same as original) */
    body, html {
      margin: 0; padding: 0; font-family: sans-serif; background-color: #f5f5f5;
    }
    .ecosystem-layout { display: flex; width: 100vw; height: 100vh; }
    .ecosystem-text { flex: 1; padding: 2rem; display: flex; flex-direction: column; justify-content: center; background-color: #f5f5f5; }
    .ecosystem-visualization { flex: 1; position: relative; }
    #three-container { width: 100%; height: 100%; position: relative; }
    #control-panel { /* hidden by default in this refactor */ }
    .popup-message {
      position: absolute; padding: 4px 8px; background: #fff;
      border: 2px solid #ff9800; border-radius: 8px; text-align: center;
      font-size: 0.8rem; pointer-events: none; transform: translate(-50%, -50%);
      white-space: nowrap;
    }
    .node-label {
      position: absolute; transform: translateX(-50%);
      background-color: rgba(255, 255, 255, 0.8);
      padding: 3px 8px; border-radius: 4px; font-size: 0.8rem; font-weight: bold;
      text-align: center; pointer-events: none; white-space: nowrap;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2); z-index: 20;
    }
    /* etc. */
  `;
  const style = document.createElement('style');
  style.textContent = styleContent;
  document.head.appendChild(style);

  // ---------------------------------------------------------------------
  // 1. Core Data
  // ---------------------------------------------------------------------
  let animationFrame = 0;

  const sections = [
    { id: 'modelTinkerers',         name: 'Fine-Tuners & Trainers',   dots: 12, x: 300, y: -50 },
    { id: 'mlArchitects',           name: 'Base Model Architects',    dots: 12, x: 0,    y: -200 },
    { id: 'artists',                name: 'Artists',                  dots: 12, x: -300,  y: -50 },
    { id: 'artToolBuilders',        name: 'Tool Builders',            dots: 12, x: -200,  y: 200 },
    { id: 'experimenters',          name: 'Workflow Creators',        dots: 12, x: 50,  y: 300 },
    { id: 'infrastructureBuilders', name: 'Infrastructure Engineers', dots: 12, x: 250, y: 150 }
  ];

  const connections = [
    { from: 'artists', to: 'modelTinkerers',          type: 'red', label: 'Inform & inspire', thickness: 1 },
    { from: 'artists', to: 'mlArchitects',            type: 'red', label: 'Inform & inspire', thickness: 1 },
    { from: 'artists', to: 'artToolBuilders',         type: 'red', label: 'Inform & inspire', thickness: 1 },
    { from: 'artists', to: 'experimenters',           type: 'red', label: 'Inform & inspire', thickness: 1 },
    { from: 'artists', to: 'infrastructureBuilders',  type: 'red', label: 'Inform & inspire', thickness: 1 },
    { from: 'mlArchitects', to: 'modelTinkerers',     type: 'red', label: 'Make stuff for',    thickness: 1 },
    { from: 'modelTinkerers', to: 'infrastructureBuilders', type: 'red', label: 'Make stuff for', thickness: 1 },
    { from: 'infrastructureBuilders', to: 'experimenters', type: 'green', label: 'Make stuff for', thickness: 1 },
    { from: 'experimenters', to: 'artToolBuilders',   type: 'green', label: 'Make stuff for', thickness: 1 },
    { from: 'artToolBuilders', to: 'artists',         type: 'green', label: 'Make stuff for', thickness: 1 }
  ];

  const adjacency = {};
  sections.forEach(s => { adjacency[s.id] = []; });
  connections.forEach(conn => {
    if (!adjacency[conn.from].includes(conn.to)) adjacency[conn.from].push(conn.to);
    if (!adjacency[conn.to].includes(conn.from)) adjacency[conn.to].push(conn.from);
  });

  // Key: dotId -> orbit parameters
  let dotOffsets = {};

  // Arrays for pulses and expansions
  let pulseDots = [];       // each item is { ..., meshes: [segmentMesh, glowMesh], ... }
  let nodeExpansions = [];

  // For hidden control panel
  let selectedNode = 'all';
  let dotsToAdd = 1;

  const sectionColors = {
    'modelTinkerers':        '#4285F4',
    'mlArchitects':          '#9C27B0',
    'artists':               '#FF9800',
    'artToolBuilders':       '#F44336',
    'experimenters':         '#00BCD4',
    'infrastructureBuilders': '#4CAF50'
  };

  // Three.js
  let scene, camera, renderer, controls, raycaster, mouse;
  let nodeMeshes = [];               // node circle meshes
  let connectionMeshes = [];         // lines between nodes
  let orbitingDotMeshes = {};        // { sectionId: [Mesh, Mesh, ...], ... }

  // We no longer re-create popup / label DOMs each frame:
  // - For popups, we create once on click, remove via setTimeout
  // - For labels, we create them once (or once per node) and update positions each frame
  const nodeLabelDivs = {};         // { sectionId -> DOM element }

  // ---------------------------------------------------------------------
  // 2a. Initialize Three.js
  // ---------------------------------------------------------------------
  function initThree() {
    const width = threeContainer.clientWidth;
    const height = threeContainer.clientHeight;

    scene = new THREE.Scene();
    scene.background = null; 

    const aspect = width / height;
    const isMobile = window.innerWidth <= 1024;
    const mobileScale = isMobile ? 1.275 : 1;
    const VIEW_SIZE_ADJUSTED = VIEW_SIZE * mobileScale;

    camera = new THREE.OrthographicCamera(
      -VIEW_SIZE_ADJUSTED * aspect,
       VIEW_SIZE_ADJUSTED * aspect,
       VIEW_SIZE_ADJUSTED,
      -VIEW_SIZE_ADJUSTED,
      -1000,
       1000
    );
    camera.position.set(0, 0, 10);

    const panX = isMobile ? 30 : -30;
    const panY = isMobile ? 30 : 50;
    camera.left   += panX;
    camera.right  += panX;
    camera.top    += panY;
    camera.bottom += panY;
    camera.updateProjectionMatrix();

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.sortObjects = true;
    threeContainer.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = 'pan-y';  // Allow vertical scrolling on mobile

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableRotate = false;
    controls.enablePan = false;    // Disable panning on all devices
    controls.enableZoom = false;
    controls.addEventListener('change', () => {
      updateNodeLabelPositions();
    });

    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    if (isMobile) {
      // Disable interactivity on mobile by adding a blocker overlay
      controls.enabled = false;
      // Ensure the container is positioned relatively so the blocker positions correctly
      threeContainer.style.position = 'relative';
      const blocker = document.createElement('div');
      blocker.style.position = 'absolute';
      blocker.style.top = '0';
      blocker.style.left = '0';
      blocker.style.width = '100%';
      blocker.style.height = '100%';
      blocker.style.zIndex = '10';
      blocker.style.backgroundColor = 'transparent';
      threeContainer.appendChild(blocker);
    } else {
      renderer.domElement.addEventListener('pointerdown', onPointerDown);
    }

    window.addEventListener('resize', onWindowResize);
  }

  function onWindowResize() {
    const width = threeContainer.clientWidth;
    const height = threeContainer.clientHeight;
    const aspect = width / height;
    const isMobile = window.innerWidth <= 1024;
    const mobileScale = isMobile ? 1.275 : 1;
    const VIEW_SIZE_ADJUSTED = VIEW_SIZE * mobileScale;

    camera.left   = -VIEW_SIZE_ADJUSTED * aspect;
    camera.right  =  VIEW_SIZE_ADJUSTED * aspect;
    camera.top    =  VIEW_SIZE_ADJUSTED;
    camera.bottom = -VIEW_SIZE_ADJUSTED;

    const panX = isMobile ? 30 : -30;
    const panY = isMobile ? 30 : 50;
    camera.left   += panX;
    camera.right  += panX;
    camera.top    += panY;
    camera.bottom += panY;

    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    updateNodeLabelPositions();
  }

  function onTouchStart(event) {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    handlePointerOrTap(touch.clientX, touch.clientY);
  }

  function onPointerDown(event) {
    handlePointerOrTap(event.clientX, event.clientY);
  }

  function handlePointerOrTap(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((clientY - rect.top) / rect.height) * 2 + 1;
    mouse.set(x, y);

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    if (!intersects.length) return;

    const first = intersects[0].object;
    if (first.userData.type === 'sectionNode') {
      handleSectionClick(first.userData.sectionId);
    }

  }

  // ---------------------------------------------------------------------
  // 2b. Scene Building (Nodes & Connections)
  // ---------------------------------------------------------------------
  function rebuildSceneObjects() {
    nodeMeshes.forEach(obj => scene.remove(obj.mesh));
    connectionMeshes.forEach(obj => scene.remove(obj.mesh));
    nodeMeshes = [];
    connectionMeshes = [];

    // Build connection lines (just once):
    connections.forEach((conn, idx) => {
      const fromS = sections.find(s => s.id === conn.from);
      const toS   = sections.find(s => s.id === conn.to);
      if (!fromS || !toS) return;

      const points = [
        new THREE.Vector3(fromS.x, fromS.y, 0),
        new THREE.Vector3(toS.x, toS.y, 0)
      ];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
        color: sectionColors[conn.from] || '#2196F3',
        linewidth: conn.thickness * 2,
        opacity: 0.7,
        transparent: true
      });
      const line = new THREE.Line(geometry, material);
      line.position.z = 0;
      line.renderOrder = 1;
      line.userData = { connIndex: idx, type: 'connectionLine' };
      scene.add(line);
      connectionMeshes.push({ mesh: line, connIndex: idx });
    });

    // Build node circles
    sections.forEach(sec => {
      const radius = 15;
      const geometry = new THREE.CircleGeometry(radius, 32);
      const material = new THREE.MeshBasicMaterial({
        color: sectionColors[sec.id],
        transparent: true
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(sec.x, sec.y, 1);
      mesh.renderOrder = 10;
      mesh.userData = { type: 'sectionNode', sectionId: sec.id };
      scene.add(mesh);

      nodeMeshes.push({ id: sec.id, mesh, sectionId: sec.id });
    });

    // Create or re-create node label elements (ONE TIME)
    createNodeLabelElements();
  }

  /**
   * Create a label <div> for each node, store it in `nodeLabelDivs[sectionId]`.
   * We won't remove them each frame; we only update positions.
   */
  function createNodeLabelElements() {
    // Clear old labels from DOM & our map
    Object.values(nodeLabelDivs).forEach(div => div.remove());
    for (const key in nodeLabelDivs) delete nodeLabelDivs[key];

    sections.forEach(section => {
      const label = document.createElement('div');
      label.className = 'node-label';
      label.textContent = section.name;
      label.style.position = 'absolute';
      label.style.pointerEvents = 'none';
      label.style.backgroundColor = 'rgba(255,255,255,0.5)';
      simulationContainer.appendChild(label);

      nodeLabelDivs[section.id] = label;
    });

    // Position them once now
    updateNodeLabelPositions();
  }

  function updateNodeLabelPositions() {
    // For each section, project coords to screen and move the label
    const rect = simulationContainer.getBoundingClientRect();
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;

    sections.forEach(section => {
      const label = nodeLabelDivs[section.id];
      if (!label) return;

      const vec = new THREE.Vector3(section.x, section.y, 1);
      vec.project(camera);

      const screenX = vec.x * halfW + halfW;
      const screenY = -vec.y * halfH + halfH;

      label.style.left = (screenX) + 'px';
      label.style.top  = (screenY + 20) + 'px';  // slightly below the node
    });
  }

  // ---------------------------------------------------------------------
  // 2c. Orbiting Dots
  // ---------------------------------------------------------------------
  function buildOrbitingDots() {
    // Remove old
    Object.values(orbitingDotMeshes).forEach(arr => {
      arr.forEach(m => scene.remove(m));
    });
    orbitingDotMeshes = {};

    // Make arrays for each section
    sections.forEach(section => {
      orbitingDotMeshes[section.id] = [];
    });

    // For each dotOffset, create a mesh
    Object.keys(dotOffsets).forEach(dotId => {
      const offset = dotOffsets[dotId];
      const secId = offset.homeSectionId;
      if (!orbitingDotMeshes[secId]) {
        orbitingDotMeshes[secId] = [];
      }

      const geometry = new THREE.CircleGeometry(4, 16);
      const material = new THREE.MeshBasicMaterial({
        color: sectionColors[secId],
        opacity: 0, // fade in
        transparent: true
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 5;
      mesh.userData.dotId = dotId;
      mesh.userData.fadeCreated = Date.now();

      scene.add(mesh);
      orbitingDotMeshes[secId].push(mesh);
    });
  }

  function createSingleDotMesh(dotId) {
    const offset = dotOffsets[dotId];
    if (!offset) return;
    const secId = offset.homeSectionId;

    const geometry = new THREE.CircleGeometry(4, 16);
    const material = new THREE.MeshBasicMaterial({
      color: sectionColors[secId],
      opacity: 0,
      transparent: true
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.renderOrder = 5;
    mesh.userData.dotId = dotId;
    mesh.userData.fadeCreated = Date.now();

    scene.add(mesh);
    orbitingDotMeshes[secId].push(mesh);
  }

  // ---------------------------------------------------------------------
  // 2d. Pulses (Create Once, Then Update)
  // ---------------------------------------------------------------------
  function createPulseMeshes(x1, y1, x2, y2, thickness, color) {
    // We'll create 2 Mesh objects: main + glow
    // Just create geometry with 6 vertices forming a thick line quad
    const baseGeometry = new THREE.BufferGeometry();
    baseGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
    const baseMaterial = new THREE.MeshBasicMaterial({
      color,
      opacity: 0.8,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false
    });
    const segmentMesh = new THREE.Mesh(baseGeometry, baseMaterial);
    segmentMesh.renderOrder = 2;

    // Glow geometry
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(18), 3));
    const glowMaterial = new THREE.MeshBasicMaterial({
      color,
      opacity: 0.2,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false
    });
    const glowMesh = new THREE.Mesh(glowGeometry, glowMaterial);
    glowMesh.renderOrder = 2;

    scene.add(segmentMesh);
    scene.add(glowMesh);

    return [segmentMesh, glowMesh];
  }

  function updatePulseMeshPositions(pulse) {
    // Calculate current start/end for the traveling segment
    const dx = pulse.endX - pulse.startX;
    const dy = pulse.endY - pulse.startY;
    const lineLength = Math.sqrt(dx*dx + dy*dy);
    if (lineLength === 0) return;

    const segmentPct = Math.min(0.2 + ((pulse.sourceNodeDots - 10) * 0.01), 0.4);
    const segmentLen = lineLength * segmentPct;
    const totalProgress = pulse.progress * (lineLength + segmentLen);

    const segStart = Math.max(0, totalProgress - segmentLen);
    const segEnd   = Math.min(lineLength, totalProgress);

    // If out of range, hide
    if (segStart >= lineLength || segEnd <= 0) {
      // Move out of view or set opacity=0
      setLineQuad(pulse.meshes[0], 0,0,0,0,0,0, 0);
      setLineQuad(pulse.meshes[1], 0,0,0,0,0,0, 0);
      return;
    }

    // Trigger expansion if it hits the end
    if (segEnd >= lineLength && !pulse.hasTriggeredExpansion) {
      const targetSec = sections.find(s => s.x === pulse.endX && s.y === pulse.endY);
      if (targetSec) createNodeExpansion(targetSec.id, pulse.color, pulse.thickness);
      pulse.hasTriggeredExpansion = true;
    }

    const ratio1 = segStart / lineLength;
    const ratio2 = segEnd   / lineLength;
    const x1 = pulse.startX + dx * ratio1;
    const y1 = pulse.startY + dy * ratio1;
    const x2 = pulse.startX + dx * ratio2;
    const y2 = pulse.startY + dy * ratio2;

    // The traveling thickness changes slightly with progress
    const baseThickness = pulse.thickness * 1.2;
    const currentThick  = baseThickness * (0.5 + 0.5 * pulse.progress);

    setLineQuad(pulse.meshes[0], x1, y1, x2, y2, currentThick, 0.8);
    setLineQuad(pulse.meshes[1], x1, y1, x2, y2, currentThick*1.5, 0.2);
  }

  /**
   * Helper to place 2D line quad in a BufferGeometry. 
   */
  function setLineQuad(mesh, x1, y1, x2, y2, thickness, opacity) {
    if (!mesh) return;
    const positions = mesh.geometry.attributes.position.array;
    mesh.material.opacity = opacity;

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx*dx + dy*dy) || 0.0001;
    const nx = dx / length;
    const ny = dy / length;
    const px = -ny;
    const py = nx;
    const half = thickness * 0.5;

    // Build two triangles forming a thick line:
    // top-left, bottom-left, top-right, top-right, bottom-left, bottom-right
    // offset in perpendicular direction by thickness
    const x1a = x1 + px*half, y1a = y1 + py*half;
    const x1b = x1 - px*half, y1b = y1 - py*half;
    const x2a = x2 + px*half, y2a = y2 + py*half;
    const x2b = x2 - px*half, y2b = y2 - py*half;

    // Triangle 1
    positions[0] = x1a; positions[1] = y1a; positions[2] = 0;
    positions[3] = x1b; positions[4] = y1b; positions[5] = 0;
    positions[6] = x2a; positions[7] = y2a; positions[8] = 0;
    // Triangle 2
    positions[9]  = x2a; positions[10] = y2a; positions[11] = 0;
    positions[12] = x1b; positions[13] = y1b; positions[14] = 0;
    positions[15] = x2b; positions[16] = y2b; positions[17] = 0;

    mesh.geometry.attributes.position.needsUpdate = true;
  }

  // ---------------------------------------------------------------------
  // 2e. Node Expansions
  // ---------------------------------------------------------------------
  function createNodeExpansion(sectionId, color, pulseThickness) {
    const sec = sections.find(s => s.id === sectionId);
    if (!sec) return;

    const expansionId = `expansion-${Date.now()}`;
    const duration = 1000;
    const baseScale = 1.5 + ((pulseThickness - 1) * 0.5) || 1.5;

    const geometry = new THREE.CircleGeometry(15, 32);
    const material = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.7, depthTest: false
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(sec.x, sec.y, 0.8);
    mesh.renderOrder = 8;
    scene.add(mesh);

    const expansionData = {
      id: expansionId,
      x: sec.x,
      y: sec.y,
      color,
      startTime: Date.now(),
      duration,
      maxScale: baseScale,
      expansionRatio: 0.3,
      mesh
    };
    nodeExpansions.push(expansionData);

    // Remove after done
    setTimeout(() => {
      nodeExpansions = nodeExpansions.filter(e => e.id !== expansionId);
      scene.remove(mesh);
    }, duration);
  }

  function updateNodeExpansion(exp) {
    const now = Date.now();
    const elapsed = now - exp.startTime;
    const progress = Math.min(1, elapsed / exp.duration);
    // "easeOutBack" style
    const easeOutBack = t => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * (t - 1)**3 + c1 * (t - 1)**2;
    };

    const ratio = exp.expansionRatio || 0.5;
    const startScale = 0.5;
    let scale;
    if (progress < ratio) {
      const p = progress / ratio;
      scale = startScale + (exp.maxScale - startScale) * easeOutBack(p);
    } else {
      const p = (progress - ratio) / (1 - ratio);
      scale = startScale + (exp.maxScale - startScale)*(1 - p*p);
    }

    if (exp.mesh) {
      exp.mesh.scale.set(scale, scale, 1);
      exp.mesh.material.opacity = 0.7 * (1 - progress);
    }
  }

  // ---------------------------------------------------------------------
  // 2f. Automatic Pulse Spawning
  // ---------------------------------------------------------------------
  function setupPulseSpawning() {
    function createPulses() {
      const totalDots = sections.reduce((sum, s) => sum + s.dots, 0);
      const artistConnections   = connections.filter(c => c.from === 'artists');
      const nonArtistConnections = connections.filter(c => c.from !== 'artists');

      let connectionLimit;
      if (totalDots > 100) {
        connectionLimit = 3;
      } else if (totalDots > 50) {
        connectionLimit = 6;
      } else {
        connectionLimit = nonArtistConnections.length;
      }
      const shuffled = [...nonArtistConnections].sort(() => Math.random() - 0.5);
      const chosenNonArtist = shuffled.slice(0, connectionLimit);

      function makePulseObj(conn, idx, prefix) {
        const fs = sections.find(s => s.id === conn.from);
        const ts = sections.find(s => s.id === conn.to);
        if (!fs || !ts) return null;
        const dotCount = fs.dots;
        const dur = Math.max(3000 - (dotCount - 10)*75, 1500);

        const [segmentMesh, glowMesh] = createPulseMeshes(fs.x, fs.y, ts.x, ts.y, conn.thickness, sectionColors[conn.from]);

        return {
          id: `${prefix}-${idx}-${Date.now()}`,
          startX: fs.x, startY: fs.y,
          endX:   ts.x, endY:   ts.y,
          color: sectionColors[conn.from],
          progress: 0,
          thickness: conn.thickness + Math.min(2 + Math.floor((dotCount - 10) / 4), 5),
          duration: dur * 1.5,
          sourceNodeDots: dotCount,
          meshes: [segmentMesh, glowMesh]
        };
      }

      const artistPulses    = artistConnections.map((c,i) => makePulseObj(c,i,'artist')).filter(Boolean);
      const nonArtistPulses = chosenNonArtist.map((c,i) => makePulseObj(c,i,'nonartist')).filter(Boolean);
      const newPulses = [...artistPulses, ...nonArtistPulses];
      pulseDots = [...pulseDots, ...newPulses];

      // schedule removal
      newPulses.forEach(p => {
        setTimeout(() => {
          pulseDots = pulseDots.filter(px => px.id !== p.id);
          // remove from scene
          if (p.meshes) {
            p.meshes.forEach(m => scene.remove(m));
          }
        }, p.duration);
      });
    }

    function getPulseInterval() {
      const totalDots = sections.reduce((sum, s) => sum + s.dots, 0);
      const avg = totalDots / sections.length;
      let interval = Math.max(2000 - (avg - 10) * 60, 800);
      if (totalDots > 100) interval = 2500;
      if (totalDots > 150) interval = 3000;
      return interval * 1.5;
    }

    // Initial pulses
    createPulses();
    // Repeated pulses
    const pulseIntervalId = setInterval(createPulses, getPulseInterval());
    intervals.push(pulseIntervalId);
  }

  // Pulse progress increment
  const pulseIncrementId = setInterval(() => {
    pulseDots.forEach(p => {
      const baseInc = 0.02;
      const speedFactor = 3000 / (p.duration || 3000);
      const inc = baseInc * speedFactor;
      p.progress = Math.min(1, p.progress + inc);
    });
  }, 50);
  intervals.push(pulseIncrementId);

  // ---------------------------------------------------------------------
  // 2g. Orbital Math + Movement
  // ---------------------------------------------------------------------
  function calcInTransitPosition(offset) {
    const now = Date.now();
    const progress = (now - offset.inTransitStartTime) / offset.inTransitDuration;
    const t = Math.min(1, progress);
    const x = offset.oldX + (offset.newX - offset.oldX)*t;
    const y = offset.oldY + (offset.newY - offset.oldY)*t;
    return { x, y, progress: t };
  }

  function calcOrbitPosition(section, offset, elapsed) {
    const easeOut = t => 1 - Math.pow(1 - t, 3);
    let baseDist = offset.distance;
    if (elapsed < offset.flightDuration) {
      const t = elapsed / offset.flightDuration;
      baseDist = offset.initialDistance + (offset.distance - offset.initialDistance)*easeOut(t);
    }

    const drift = offset.driftAmplitude * Math.sin(offset.driftSpeed * elapsed);
    const dist = baseDist + drift;

    const angle = elapsed * offset.speed * offset.direction + offset.phase;
    const xPos = section.x + Math.cos(angle)*dist;
    const yPos = section.y + Math.sin(angle)*dist;
    return { x: xPos, y: yPos };
  }

  function maybeMoveToAnotherHub(dotId, offset) {
    if (offset.isInTransit) return;
    const moveChance = 0.00005;
    if (Math.random() < moveChance) {
      const home = offset.homeSectionId;
      const neighbors = adjacency[home] || [];
      let newSecId;
      const roll = Math.random();
      if (neighbors.length > 0 && roll < 0.7) {
        newSecId = neighbors[Math.floor(Math.random() * neighbors.length)];
      } else {
        const others = sections.filter(s => s.id !== home);
        newSecId = others[Math.floor(Math.random() * others.length)].id;
      }
      if (newSecId === home) return;

      offset.isInTransit = true;
      offset.inTransitStartTime = Date.now();
      offset.inTransitDuration  = 2000;

      const oldSec = sections.find(s => s.id === home);
      const newSec = sections.find(s => s.id === newSecId);
      if (!oldSec || !newSec) return;

      offset.oldX = oldSec.x;
      offset.oldY = oldSec.y;
      offset.newX = newSec.x;
      offset.newY = newSec.y;
      offset.newSectionId = newSecId;

      offset.fromColor = new THREE.Color(sectionColors[home]);
      offset.toColor   = new THREE.Color(sectionColors[newSecId]);
    }
  }

  function finalizeTransit(dotId, offset) {
    offset.isInTransit = false;
    if (!offset.newSectionId) return;

    const oldId = offset.homeSectionId;
    const newId = offset.newSectionId;
    offset.newSectionId = null;

    const oldSec = sections.find(s => s.id === oldId);
    const newSec = sections.find(s => s.id === newId);
    if (oldSec) oldSec.dots = Math.max(0, oldSec.dots - 1);
    if (newSec) newSec.dots++;

    // Reassign dot mesh from old group to new group
    const oldArr = orbitingDotMeshes[oldId] || [];
    const idx = oldArr.findIndex(m => m.userData.dotId === dotId);
    if (idx !== -1) {
      const [dotMesh] = oldArr.splice(idx, 1);
      if (!orbitingDotMeshes[newId]) orbitingDotMeshes[newId] = [];
      orbitingDotMeshes[newId].push(dotMesh);
    }

    // Update offset
    offset.homeSectionId = newId;
    offset.startTime = Date.now();
    offset.flightDuration = 1000;
    offset.initialDistance = 0;
    offset.distance = 50 + Math.random() * 50;
    const dx = offset.newX - newSec.x;
    const dy = offset.newY - newSec.y;
    offset.phase = Math.atan2(dy, dx);
  }


  function handleSectionClick(sectionId) {
    const sec = sections.find(s => s.id === sectionId);
    if (!sec) return;
    sec.dots += 1;
    const newDotIndex = sec.dots;

    const randomDist  = 50 + Math.random() * 50;
    const speed       = 0.0005 + (newDotIndex % 5)*0.0002;
    const direction   = newDotIndex % 2 === 0 ? 1 : -1;
    const phase       = (newDotIndex / sec.dots)*Math.PI*2;

    const initialDistance = 500;
    const flightDuration  = 1000;
    const startTime       = Date.now();
    const driftAmplitude  = 10 + Math.random() * 30;
    const driftSpeed      = 0.001 + Math.random() * 0.002;

    const dotId = generateUUID();
    dotOffsets[dotId] = {
      homeSectionId: sectionId,
      distance: randomDist,
      speed,
      phase,
      direction,
      startTime,
      flightDuration,
      initialDistance,
      driftAmplitude,
      driftSpeed,
      isInTransit: false
    };

    createSingleDotMesh(dotId);
  }

  function handleAddDots() {
    const val = parseInt(dotsInputEl.value, 10);
    dotsToAdd = isNaN(val) ? 1 : Math.min(MAX_DOTS_PER_CLICK, Math.max(1, val));

    if (selectedNode === 'all') {
      const batchSize = 3;
      sections.forEach((section, idx) => {
        const numBatches = Math.ceil(dotsToAdd / batchSize);
        for (let b = 0; b < numBatches; b++) {
          const countThisBatch = Math.min(batchSize, dotsToAdd - b*batchSize);
          const delay = idx*300 + b*500;
          setTimeout(() => {
            for (let i=0; i<countThisBatch; i++) {
              handleSectionClick(section.id);
            }
          }, delay);
        }
      });
    } else {
      const batchSize = 5;
      const numBatches = Math.ceil(dotsToAdd / batchSize);
      for (let b=0; b<numBatches; b++) {
        const c = Math.min(batchSize, dotsToAdd - b*batchSize);
        setTimeout(() => {
          for (let i=0; i<c; i++) {
            handleSectionClick(selectedNode);
          }
        }, b*500);
      }
    }
  }

  // ---------------------------------------------------------------------
  // 2i. Animation & Rendering
  // ---------------------------------------------------------------------
  function animate() {
    requestAnimationFrame(animate);
    animationFrame++;

    // Update orbiting dots
    Object.entries(orbitingDotMeshes).forEach(([secId, meshes]) => {
      meshes.forEach(mesh => {
        const dotId = mesh.userData.dotId;
        const offset = dotOffsets[dotId];
        if (!offset) return;
        if (offset.isInTransit) {
          const { x, y, progress } = calcInTransitPosition(offset);
          if (offset.fromColor && offset.toColor) {
            const c = offset.fromColor.clone().lerp(offset.toColor, progress);
            mesh.material.color.set(c);
          }
          mesh.position.set(x, y, 0.5);
          if (progress >= 1) finalizeTransit(dotId, offset);
        } else {
          maybeMoveToAnotherHub(dotId, offset);
          const elapsed = Date.now() - offset.startTime;
          const sec = sections.find(s => s.id === offset.homeSectionId);
          if (!sec) return;
          const { x, y } = calcOrbitPosition(sec, offset, elapsed);
          mesh.position.set(x, y, 0.5);
          mesh.material.color.set(sectionColors[offset.homeSectionId] || '#ffffff');
        }
        // Fade in
        if (mesh.userData.fadeCreated) {
          const fadeElapsed = Date.now() - mesh.userData.fadeCreated;
          if (fadeElapsed < DOT_FADE_DURATION) {
            mesh.material.opacity = 0.7*(fadeElapsed / DOT_FADE_DURATION);
          } else {
            mesh.material.opacity = 0.7;
            delete mesh.userData.fadeCreated;
          }
        }
      });
    });

    // Update existing pulse segments
    pulseDots.forEach(pulse => {
      updatePulseMeshPositions(pulse);
    });

    // Update expansions
    nodeExpansions.forEach(updateNodeExpansion);

    controls.update();
    renderer.render(scene, camera);
    // Update label positions once per frame - CHANGED: Update only every 10 frames
    if (animationFrame % 10 === 0) {
      updateNodeLabelPositions();
    }
  }

  // ---------------------------------------------------------------------
  // 3. Initialize
  // ---------------------------------------------------------------------
  initThree();

  if (nodeSelectEl) {
    // Rebuild dropdown options
    Array.from(nodeSelectEl.options).forEach(opt => {
      if (opt.value !== 'all') nodeSelectEl.remove(opt);
    });
    sections.forEach(sec => {
      const opt = document.createElement('option');
      opt.value = sec.id;
      opt.textContent = sec.name;
      nodeSelectEl.appendChild(opt);
    });
    nodeSelectEl.addEventListener('change', e => {
      selectedNode = e.target.value;
    });
  }

  if (dotsInputEl) {
    dotsInputEl.addEventListener('change', e => {
      const val = parseInt(e.target.value, 10);
      dotsToAdd = isNaN(val) ? 1 : Math.min(MAX_DOTS_PER_CLICK, Math.max(1, val));
      dotsInputEl.value = dotsToAdd;
    });
  }

  if (addButtonEl) {
    addButtonEl.addEventListener('click', handleAddDots);
  }

  // Initialize offsets for existing dots
  function initializeDotOffsets() {
    sections.forEach(sec => {
      for (let i=0; i<sec.dots; i++) {
        const dotId = generateUUID();
        const randomDist = 50 + Math.random() * 50;
        const driftAmplitude = 10 + Math.random() * 30;
        const driftSpeed = 0.001 + Math.random() * 0.002;
        const speed = 0.0005 + (i % 5)*0.0002;
        const phase = (i / sec.dots)*Math.PI*2;
        const direction = (i % 2 === 0) ? 1 : -1;

        dotOffsets[dotId] = {
          homeSectionId: sec.id,
          distance: randomDist,
          speed, phase, direction,
          startTime: Date.now(),
          flightDuration: 1000,
          initialDistance: 500,
          driftAmplitude, driftSpeed,
          isInTransit: false
        };
      }
    });
  }

  initializeDotOffsets();

  // Build the scene & orbits
  rebuildSceneObjects();
  buildOrbitingDots();

  // Create pulses occasionally
  setupPulseSpawning();

  // Start rendering
  animate();
}

// By default, run automatically if this file is included directly:
runEcosystem();
