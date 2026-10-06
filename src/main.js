import './style.css';
import * as THREE from 'three';
import { animate } from 'animejs';
import { CubeWorld } from './world.js';
import { soundManager } from './audio.js';

// Initialize Three.js World
const container = document.getElementById('canvas-container');
const world = new CubeWorld(container);

// UI Element References
const btnExplode = document.getElementById('btn-explode');
const btnExplodeText = document.getElementById('btn-explode-text');
const btnRotate = document.getElementById('btn-rotate');
const timeSlider = document.getElementById('time-slider');
const themeButtons = document.querySelectorAll('.theme-btn');
const camButtons = document.querySelectorAll('.cam-btn');
const btnAudio = document.getElementById('btn-audio');

// Telemetry & Inspector References
const fpsDisplay = document.getElementById('fps-display');
const coordsDisplay = document.getElementById('coords-display');
const inspectorCard = document.getElementById('inspector-card');
const inspTitle = document.getElementById('insp-title');
const inspBadge = document.getElementById('insp-badge');
const inspDesc = document.getElementById('insp-desc');
const inspTemp = document.getElementById('insp-temp');
const inspElev = document.getElementById('insp-elev');

// 1. Explode / Reassemble Core (Powered by Anime.js)
let isExploded = false;

function toggleExplode() {
  isExploded = !isExploded;
  world.isExploded = isExploded;

  if (isExploded) {
    soundManager.playExplode();
    btnExplode.classList.add('exploded');
    btnExplodeText.textContent = 'Satukan Planet';

    // Animate face plates outwards using anime.js
    world.faceGroups.forEach((face, index) => {
      const targetPos = face.userData.explodedPosition;
      animate(face.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: 1200 + index * 80,
        ease: 'outBack(1.2)'
      });
    });

    // Expand core glow and scale
    animate(world.coreMesh.scale, {
      x: 1.15,
      y: 1.15,
      z: 1.15,
      duration: 1000,
      ease: 'outExpo'
    });
  } else {
    soundManager.playAssemble();
    btnExplode.classList.remove('exploded');
    btnExplodeText.textContent = 'Bongkar Inti Planet';

    // Animate face plates back to snug cube
    world.faceGroups.forEach((face, index) => {
      const targetPos = face.userData.initialPosition;
      animate(face.position, {
        x: targetPos.x,
        y: targetPos.y,
        z: targetPos.z,
        duration: 900 + index * 60,
        ease: 'outExpo'
      });
    });

    // Return core mesh scale
    animate(world.coreMesh.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: 800,
      ease: 'outQuad'
    });
  }
}

btnExplode.addEventListener('click', toggleExplode);

// 2. Auto Rotation Toggle
btnRotate.addEventListener('click', () => {
  soundManager.playClick();
  world.autoRotate = !world.autoRotate;
  btnRotate.classList.toggle('active', world.autoRotate);
});

// 3. Time of Day Slider
timeSlider.addEventListener('input', (e) => {
  world.timeOfDay = parseFloat(e.target.value);
  world.updateSunPosition();
});

// 4. Biome Themes
themeButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    soundManager.playClick();
    themeButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const theme = btn.dataset.theme;
    world.setTheme(theme);
  });
});

// 5. Camera Preset Transitions (Powered by Anime.js)
let currentPlanetTarget = 'cinematic';

const planetInfoPresets = {
  cinematic: {
    name: 'Sistem Tiga Planet Kotak',
    category: 'Panorama 3D',
    feature: 'Formasi observasi tiga planet kubus: Venus Kotak, Bumi Kotak, dan Mars Kotak dengan ukuran skala identik (1:1).',
    temp: 'Variatif',
    elevation: 'Skala 1 : 1'
  },
  earth: {
    name: 'Bumi Kotak (Cubic Earth)',
    category: 'Planet Layak Huni',
    feature: 'Planet kubus berpenghuni dengan biosfer aktif, lempeng benua bergerak, samudra luas, dan mantel yang dapat dibongkar.',
    temp: '15 °C',
    elevation: '+8,848 m (Everest)'
  },
  venus: {
    name: 'Venus Kotak (50% Potongan Inti)',
    category: 'Planet Kembaran Bumi',
    feature: 'Planet kubus berukuran sama dengan Bumi. Potongan 50% memperlihatkan mantel silikat tebal dan inti magma besi berpendar.',
    temp: '465 °C',
    elevation: '+11 km (Maxwell Montes)'
  },
  mars: {
    name: 'Mars Kotak (50% Potongan Inti)',
    category: 'Planet Merah Terestrial',
    feature: 'Planet gurun berukuran sama dengan Bumi. Potongan 50% memaparkan mantel basalt beku, celah ngarai, dan inti logam padat.',
    temp: '-65 °C',
    elevation: '+21.9 km (Olympus Mons)'
  }
};

camButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    soundManager.playClick();
    const presetName = btn.dataset.cam;
    currentPlanetTarget = presetName;

    // Keep all navigation buttons in sync
    camButtons.forEach((b) => {
      b.classList.toggle('active', b.dataset.cam === presetName);
    });

    const { position: targetCam, target: targetLook } = world.setCameraPreset(presetName);

    // Smooth camera motion with anime.js
    animate(world.camera.position, {
      x: targetCam.x,
      y: targetCam.y,
      z: targetCam.z,
      duration: 1400,
      ease: 'outCubic'
    });

    animate(world.controls.target, {
      x: targetLook.x,
      y: targetLook.y,
      z: targetLook.z,
      duration: 1400,
      ease: 'outCubic'
    });

    // Display introductory telemetry info for selected planet
    const info = planetInfoPresets[presetName];
    if (info) {
      lastHoveredId = info.name;
      inspTitle.textContent = info.name;
      inspBadge.textContent = info.category;
      inspDesc.textContent = info.feature;
      inspTemp.textContent = info.temp;
      inspElev.textContent = info.elevation;
      inspectorCard.classList.add('active');
    }
  });
});

// 6. Sound Toggle
let isMuted = false;
btnAudio.addEventListener('click', () => {
  isMuted = !isMuted;
  soundManager.enabled = !isMuted;
  btnAudio.textContent = isMuted ? '🔇' : '🔊';
  btnAudio.style.opacity = isMuted ? '0.6' : '1';
});

// 7. Raycasting Hover / Touch Tap Inspector
const mousePos = new THREE.Vector2(-999, -999);
let lastHoveredId = null;
let pointerDownPos = { x: 0, y: 0 };
let isPointerDown = false;
let isTouchDragging = false;

const btnCloseInsp = document.getElementById('btn-close-insp');
if (btnCloseInsp) {
  btnCloseInsp.addEventListener('click', (e) => {
    e.stopPropagation();
    soundManager.playClick();
    inspectorCard.classList.remove('active');
    lastHoveredId = null;
    mousePos.x = -999;
    mousePos.y = -999;
  });
}

container.addEventListener('pointerdown', (e) => {
  pointerDownPos = { x: e.clientX, y: e.clientY };
  isPointerDown = true;
  isTouchDragging = false;
});

function onPointerMove(e) {
  if (isPointerDown) {
    const dist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    if (dist > 8) {
      isTouchDragging = true;
    }
  }

  // On touch screens, don't trigger inspector while rotating the globe
  if (e.pointerType === 'touch' && isTouchDragging) {
    return;
  }

  const rect = container.getBoundingClientRect();
  mousePos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  mousePos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

container.addEventListener('pointermove', onPointerMove);

container.addEventListener('pointerup', (e) => {
  isPointerDown = false;
  // If it was a quick tap on touch screen, perform raycast
  if (e.pointerType === 'touch' && !isTouchDragging) {
    const rect = container.getBoundingClientRect();
    mousePos.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mousePos.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    checkRaycast();
  }
  isTouchDragging = false;
});

container.addEventListener('pointerleave', (e) => {
  if (e.pointerType !== 'touch') {
    mousePos.x = -999;
    mousePos.y = -999;
    inspectorCard.classList.remove('active');
    lastHoveredId = null;
  }
});

function checkRaycast() {
  if (mousePos.x < -1 || mousePos.x > 1) return;

  world.raycaster.setFromCamera(mousePos, world.camera);
  const intersectables = [world.planetGroup];
  if (world.venusGroup) intersectables.push(world.venusGroup);
  if (world.marsGroup) intersectables.push(world.marsGroup);
  const intersects = world.raycaster.intersectObjects(intersectables, true);

  // Find topmost hit with userData.name
  let hitData = null;
  for (let i = 0; i < intersects.length; i++) {
    const obj = intersects[i].object;
    if (obj.userData && obj.userData.name) {
      hitData = obj.userData;
      break;
    }
  }

  if (hitData) {
    if (lastHoveredId !== hitData.name) {
      lastHoveredId = hitData.name;
      soundManager.playHover();
      inspTitle.textContent = hitData.name;
      inspBadge.textContent = hitData.category || 'Kontinental';
      inspDesc.textContent = hitData.feature || 'Relief bumi kotak.';
      inspTemp.textContent = hitData.temp || '24 °C';
      inspElev.textContent = hitData.elevation || '+100 m';
      inspectorCard.classList.add('active');
    }
  } else {
    inspectorCard.classList.remove('active');
    lastHoveredId = null;
  }
}

// 8. Animation & Telemetry Loop
let lastTime = performance.now();
let frameCount = 0;
let fpsTimer = 0;

function tick(now) {
  requestAnimationFrame(tick);

  const delta = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  const elapsed = now * 0.001;

  world.update(delta, elapsed);
  world.render();
  checkRaycast();

  // Telemetry updates
  frameCount++;
  fpsTimer += delta;
  if (fpsTimer >= 0.5) {
    const currentFps = Math.round((frameCount / fpsTimer));
    fpsDisplay.textContent = `${currentFps} FPS`;
    frameCount = 0;
    fpsTimer = 0;

    // Estimate coordinates or planetary telemetry
    if (currentPlanetTarget === 'venus') {
      coordsDisplay.textContent = `VENUS • 50% INTI • 465 °C`;
    } else if (currentPlanetTarget === 'mars') {
      coordsDisplay.textContent = `MARS • 50% INTI • -65 °C`;
    } else if (currentPlanetTarget === 'cinematic') {
      coordsDisplay.textContent = `TATA SURYA • 3 PLANET`;
    } else {
      const camAngle = Math.atan2(world.camera.position.z, world.camera.position.x);
      const lonDeg = Math.round((camAngle * 180) / Math.PI);
      const latDeg = Math.round((Math.asin(world.camera.position.y / world.camera.position.length()) * 180) / Math.PI);
      coordsDisplay.textContent = `BUMI • LAT ${latDeg > 0 ? '+' : ''}${latDeg}° • LON ${lonDeg > 0 ? '+' : ''}${lonDeg}°`;
    }
  }
}

requestAnimationFrame(tick);
