import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// 16x16 Grid Maps for 6 Cube Faces
// '.' = Ocean, '#' = Land, 'C' = Cloud
const FACE_MAPS = {
  // +Z (Left Face in isometric view: Americas)
  front: [
    "....######......",
    "...########.....",
    "..#########.....",
    "..##########....",
    "...#########....",
    "...########.....",
    "....#####.......",
    "....####........",
    ".....###........",
    ".....####.......",
    ".#..#######.....",
    "...#########....",
    "...#########....",
    "....#######.....",
    "....#####.......",
    "....###........."
  ],

  // +X (Right Face in isometric view: Europe & Africa)
  right: [
    "####............",
    "######..........",
    ".######.........",
    "..#####.........",
    ".########.......",
    "##########......",
    "###########.....",
    "##########......",
    ".#########......",
    "..#######.......",
    "..######........",
    "...#####........",
    "...####.........",
    "....##..........",
    "................",
    "................"
  ],

  // +Y (Top Face in isometric view: Arctic fringe & 2 Floating Clouds)
  top: [
    "......##########",
    ".......#########",
    "........########",
    ".........#######",
    "..........######",
    ".....CCCC...####",
    "....CCCCCC...###",
    ".....CCCC.......",
    "................",
    "................",
    "...CCC..........",
    "...CCC..........",
    "................",
    "................",
    "...#####........",
    "....####........"
  ],

  // -Z (Back Left Face: Asia, Nusantara, Australia)
  back: [
    "###############.",
    "###############.",
    ".##############.",
    "..############..",
    "..###########...",
    "...########.....",
    ".....####.......",
    "................",
    "..###..####.....",
    "....#####..##...",
    "......###.......",
    "....#######.....",
    "...#########....",
    "...#########....",
    "....#######.....",
    "................"
  ],

  // -X (Back Right Face: Pacific Ocean & New Zealand)
  left: [
    "................",
    "................",
    "....##..........",
    ".....#..........",
    "................",
    "........##......",
    "................",
    "................",
    "................",
    "................",
    "......##........",
    "................",
    "..........##....",
    "...........#....",
    "................",
    "................"
  ],

  // -Y (Bottom Face: Antarctica Ice Sheet)
  bottom: [
    "................",
    "................",
    ".....######.....",
    "...##########...",
    "..############..",
    ".##############.",
    "################",
    "################",
    "################",
    "################",
    ".##############.",
    "..############..",
    "...##########...",
    ".....######.....",
    "................",
    "................"
  ]
};

export class CubeWorld {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.width = canvasContainer.clientWidth;
    this.height = canvasContainer.clientHeight;

    this.scene = new THREE.Scene();
    // Dark navy cosmic background matching reference image
    this.scene.background = new THREE.Color(0x091428);
    this.scene.fog = new THREE.FogExp2(0x091428, 0.012);

    // Isometric perspective camera (low FOV for crisp isometric feel)
    this.camera = new THREE.PerspectiveCamera(36, this.width / this.height, 0.1, 1000);
    // Positioned at equal X and Z, elevated Y to match the exact isometric reference angle
    this.camera.position.set(16.5, 14.5, 16.5);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(this.width, this.height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 55;
    this.controls.target.set(0, 0, 0);

    // Raycasting
    this.raycaster = new THREE.Raycaster();

    // Planet Root Group
    this.planetGroup = new THREE.Group();
    this.scene.add(this.planetGroup);

    this.faceGroups = [];
    this.isExploded = false;
    this.currentTheme = 'earth';
    this.autoRotate = false; // Off by default so initial view stays locked to reference image
    this.timeOfDay = 0.38;

    // Materials Palette
    this.materials = this.initMaterials();

    // Build World
    this.setupLighting();
    this.setupCosmos();
    this.setupCore();
    this.setupAtmosphere();
    this.setupFaces();

    // Resize Handler
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  initMaterials() {
    return {
      // Ocean Base (Rich Vibrant Blue)
      oceanWater: new THREE.MeshStandardMaterial({
        color: 0x009ce5,
        roughness: 0.25,
        metalness: 0.05
      }),
      // Shallow Water Shelf (Lighter Cyan Border)
      oceanShelf: new THREE.MeshStandardMaterial({
        color: 0x38c2f8,
        roughness: 0.3
      }),
      // Continent Land (Electric Lime Green)
      landGrass: new THREE.MeshStandardMaterial({
        color: 0x76c817,
        roughness: 0.65
      }),
      // Continent Rock/Mantle (Underside of plate exposed when exploded)
      mantleRock: new THREE.MeshStandardMaterial({
        color: 0x2e4a1f,
        roughness: 0.85
      }),
      // Floating Voxel Clouds (Pure White)
      cloudVoxel: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4
      }),
      // Polar Ice (Antarctica & Greenland caps)
      snowPolar: new THREE.MeshStandardMaterial({
        color: 0xe0f7fa,
        roughness: 0.3
      }),
      // Glowing Magma Core
      magmaCore: new THREE.MeshStandardMaterial({
        color: 0xff5500,
        emissive: 0xff3300,
        emissiveIntensity: 2.2,
        roughness: 0.2,
        metalness: 0.6
      }),
      // Atmosphere Outer Shell
      atmoShell: new THREE.MeshBasicMaterial({
        color: 0x00b4d8,
        transparent: true,
        opacity: 0.2,
        depthWrite: false
      }),
      // Atmosphere Bounding Line
      atmoLine: new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.85
      })
    };
  }

  setupLighting() {
    // Ambient space light
    this.ambientLight = new THREE.AmbientLight(0x284266, 1.6);
    this.scene.add(this.ambientLight);

    // Primary Sun Light positioned from upper-front to give the exact 3D voxel shading in the reference
    this.sunLight = new THREE.DirectionalLight(0xffffff, 2.8);
    this.sunLight.position.set(20, 26, 22);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 80;
    this.sunLight.shadow.camera.left = -15;
    this.sunLight.shadow.camera.right = 15;
    this.sunLight.shadow.camera.top = 15;
    this.sunLight.shadow.camera.bottom = -15;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);

    // Subtle blue rim light from opposite side
    this.rimLight = new THREE.DirectionalLight(0x1e3a8a, 0.8);
    this.rimLight.position.set(-20, -10, -20);
    this.scene.add(this.rimLight);

    // Magma Core PointLight inside planet
    this.corePointLight = new THREE.PointLight(0xff5500, 3.5, 25, 1.5);
    this.planetGroup.add(this.corePointLight);
  }

  updateSunPosition() {
    const angle = this.timeOfDay * Math.PI * 2;
    const distance = 35;
    const sunX = Math.cos(angle) * distance;
    const sunZ = Math.sin(angle) * distance;
    const sunY = Math.sin(angle * 0.5) * 14 + 16;
    this.sunLight.position.set(sunX, sunY, sunZ);
  }

  setupCosmos() {
    // Clean solid cosmic background matching reference image (zero fill-rate overhead)
    this.scene.background = new THREE.Color(0x091428);
  }

  setupCore() {
    this.coreGroup = new THREE.Group();

    // Central Magma Voxel Cube
    const coreGeom = new THREE.BoxGeometry(3.6, 3.6, 3.6);
    this.coreMesh = new THREE.Mesh(coreGeom, this.materials.magmaCore);
    this.coreMesh.castShadow = true;
    this.coreMesh.receiveShadow = true;
    this.coreMesh.userData = {
      name: 'Inti Magma Panas (Liquid Core)',
      category: 'Inti Planet',
      temp: '5,500 °C',
      elevation: '-4,200 km',
      feature: 'Pusat panas bumi kotak dengan radiasi energi termal tinggi.'
    };
    this.coreGroup.add(this.coreMesh);

    // Wireframe cage around core
    const wireGeom = new THREE.BoxGeometry(3.85, 3.85, 3.85);
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xffaa00,
      wireframe: true,
      transparent: true,
      opacity: 0.45
    });
    this.coreWireframe = new THREE.Mesh(wireGeom, wireMat);
    this.coreGroup.add(this.coreWireframe);

    this.planetGroup.add(this.coreGroup);
  }

  setupAtmosphere() {
    // Outer atmospheric cubic shell encasing the planet (as seen in the reference)
    const atmoSize = 10.65;
    const atmoGeom = new THREE.BoxGeometry(atmoSize, atmoSize, atmoSize);

    // Translucent cyan volume
    this.atmoMesh = new THREE.Mesh(atmoGeom, this.materials.atmoShell);
    this.atmoMesh.userData = {
      name: 'Lapisan Atmosfer Kubus',
      category: 'Atmosfer',
      temp: '-15 °C',
      elevation: '+50 km (Eksosfer)',
      feature: 'Kubah atmosfer kubik pelindung radiasi kosmik dan penyedia biosfer.'
    };
    this.planetGroup.add(this.atmoMesh);

    // Distinct glowing cyan border lines
    const edgesGeom = new THREE.EdgesGeometry(atmoGeom);
    this.atmoLines = new THREE.LineSegments(edgesGeom, this.materials.atmoLine);
    this.planetGroup.add(this.atmoLines);
  }

  setupFaces() {
    const CUBE_SIZE = 9.6;
    const HALF_SIZE = CUBE_SIZE / 2;
    const GRID_N = 16;
    const VOXEL_SIZE = CUBE_SIZE / GRID_N; // 0.6
    const LAND_HEIGHT = 0.38;
    const SHELF_HEIGHT = 0.05;
    const CLOUD_HEIGHT = 0.45;

    // Shared Geometries for Performance
    const landBoxGeom = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, LAND_HEIGHT);
    const shelfBoxGeom = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, SHELF_HEIGHT);
    const cloudBoxGeom = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, CLOUD_HEIGHT);

    const faceConfigs = [
      {
        id: 'front',
        name: 'Benua Amerika (The Americas)',
        category: 'Belahan Barat',
        temp: '24 °C',
        elevation: '+2,400 m',
        feature: 'Benua Amerika Utara, jembatan tanah genting Panama, dan bentang Amazon Amerika Selatan.',
        normal: new THREE.Vector3(0, 0, 1),
        rotation: [0, 0, 0],
        map: FACE_MAPS.front
      },
      {
        id: 'right',
        name: 'Eropa & Benua Afrika',
        category: 'Belahan Timur',
        temp: '31 °C',
        elevation: '+1,800 m',
        feature: 'Daratan Eropa di utara, Laut Tengah, dan bentang benua Afrika yang luas di selatan.',
        normal: new THREE.Vector3(1, 0, 0),
        rotation: [0, Math.PI / 2, 0],
        map: FACE_MAPS.right
      },
      {
        id: 'top',
        name: 'Kutub Utara & Awan Voxel',
        category: 'Arktik & Troposfer',
        temp: '-22 °C',
        elevation: '+1,200 m (Awan)',
        feature: 'Gugusan samudra arktik dengan tepian hijau Eurasia dan formasi awan kumulus putih.',
        normal: new THREE.Vector3(0, 1, 0),
        rotation: [-Math.PI / 2, 0, 0],
        map: FACE_MAPS.top
      },
      {
        id: 'back',
        name: 'Asia, Nusantara & Australia',
        category: 'Asia-Pasifik',
        temp: '28 °C',
        elevation: '+1,500 m',
        feature: 'Daratan Asia raksasa, kepulauan zamrud Nusantara, dan benua Australia.',
        normal: new THREE.Vector3(0, 0, -1),
        rotation: [0, Math.PI, 0],
        map: FACE_MAPS.back
      },
      {
        id: 'left',
        name: 'Samudra Pasifik Luas',
        category: 'Hidrosfer Pasifik',
        temp: '18 °C',
        elevation: '0 m (Laut)',
        feature: 'Hamparan samudra biru terluas dengan gugusan pulau vulkanik dan Selandia Baru.',
        normal: new THREE.Vector3(-1, 0, 0),
        rotation: [0, -Math.PI / 2, 0],
        map: FACE_MAPS.left
      },
      {
        id: 'bottom',
        name: 'Kutub Selatan (Antartika)',
        category: 'Kriosfer Kutub',
        temp: '-55 °C',
        elevation: '+2,800 m (Es)',
        feature: 'Kubah es abadi Antartika pembungkus kutub selatan planet kubus.',
        normal: new THREE.Vector3(0, -1, 0),
        rotation: [Math.PI / 2, 0, 0],
        map: FACE_MAPS.bottom
      }
    ];

    faceConfigs.forEach((cfg) => {
      const faceGroup = new THREE.Group();
      faceGroup.name = cfg.id;

      const basePos = cfg.normal.clone().multiplyScalar(HALF_SIZE);
      faceGroup.position.copy(basePos);
      faceGroup.rotation.set(...cfg.rotation);

      // Store initial and exploded positions for anime.js
      faceGroup.userData = {
        config: cfg,
        normal: cfg.normal.clone(),
        initialPosition: basePos.clone(),
        explodedPosition: cfg.normal.clone().multiplyScalar(HALF_SIZE * 2.2)
      };

      // Base ocean plate slab
      const oceanPlateGeom = new THREE.BoxGeometry(CUBE_SIZE, CUBE_SIZE, 0.4);
      const oceanPlate = new THREE.Mesh(oceanPlateGeom, this.materials.oceanWater);
      oceanPlate.position.set(0, 0, -0.2);
      oceanPlate.receiveShadow = true;
      oceanPlate.userData = {
        name: `Samudra (${cfg.name})`,
        category: 'Hidrosfer',
        temp: '18 °C',
        elevation: '0 m',
        feature: 'Air samudra biru cerah pembentuk muka planet kubus.'
      };
      faceGroup.add(oceanPlate);

      // Mantle bottom slab (visible when exploded)
      const mantleGeom = new THREE.BoxGeometry(CUBE_SIZE * 0.96, CUBE_SIZE * 0.96, 0.3);
      const mantleMesh = new THREE.Mesh(mantleGeom, this.materials.mantleRock);
      mantleMesh.position.set(0, 0, -0.55);
      mantleMesh.userData = {
        name: 'Kerak Bawah Benua',
        category: 'Litosfer',
        temp: '950 °C',
        elevation: '-50 km',
        feature: 'Batuan basal mantel penopang lempeng benua bumi kotak.'
      };
      faceGroup.add(mantleMesh);

      // Build 16x16 Voxels for this face
      const map = cfg.map;
      // Precompute shelf positions: an ocean cell that touches a land cell
      const hasLandNeighbor = (r, c) => {
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < GRID_N && nc >= 0 && nc < GRID_N) {
              if (map[nr][nc] === '#') return true;
            }
          }
        }
        return false;
      };

      for (let r = 0; r < GRID_N; r++) {
        for (let c = 0; c < GRID_N; c++) {
          const char = map[r][c];

          // Local coordinates on face [-HALF_SIZE, +HALF_SIZE]
          const x = (c + 0.5) * VOXEL_SIZE - HALF_SIZE;
          const y = HALF_SIZE - (r + 0.5) * VOXEL_SIZE; // Invert row so row 0 is top

          if (char === '#') {
            // Raised Land Voxel (Lime Green)
            const landMesh = new THREE.Mesh(
              landBoxGeom,
              cfg.id === 'bottom' ? this.materials.snowPolar : this.materials.landGrass
            );
            landMesh.position.set(x, y, LAND_HEIGHT / 2);
            landMesh.castShadow = true;
            landMesh.receiveShadow = true;
            landMesh.userData = {
              name: `Daratan Voxel (${cfg.name})`,
              category: 'Kontinental',
              temp: cfg.temp,
              elevation: cfg.elevation,
              feature: cfg.feature
            };
            faceGroup.add(landMesh);
          } else if (char === 'C') {
            // Floating Voxel Clouds
            const cloudMesh = new THREE.Mesh(cloudBoxGeom, this.materials.cloudVoxel);
            // Floating slightly above water surface
            cloudMesh.position.set(x, y, CLOUD_HEIGHT / 2 + 0.45);
            cloudMesh.castShadow = true;
            cloudMesh.receiveShadow = true;
            cloudMesh.userData = {
              name: 'Awan Kumulus Voxel',
              category: 'Kondensasi Awan',
              temp: '8 °C',
              elevation: '+1,800 m',
              feature: 'Gugusan uap air berbentuk balok putih melayang di atas samudra.'
            };
            faceGroup.add(cloudMesh);
          } else if (char === '.') {
            // Check if this ocean cell is adjacent to land -> Shallow Cyan Water Shelf
            if (hasLandNeighbor(r, c)) {
              const shelfMesh = new THREE.Mesh(shelfBoxGeom, this.materials.oceanShelf);
              shelfMesh.position.set(x, y, SHELF_HEIGHT / 2);
              shelfMesh.receiveShadow = true;
              shelfMesh.userData = {
                name: 'Paparan Dangkal Pesisir (Coastal Shelf)',
                category: 'Pesisir Pantai',
                temp: '22 °C',
                elevation: '-15 m',
                feature: 'Perairan pirus dangkal berpasir yang mengelilingi tepian benua.'
              };
              faceGroup.add(shelfMesh);
            }
          }
        }
      }

      this.faceGroups.push(faceGroup);
      this.planetGroup.add(faceGroup);
    });
  }

  setTheme(themeName) {
    this.currentTheme = themeName;
    if (themeName === 'frost') {
      // Winter Frost Mode
      this.materials.oceanWater.color.setHex(0x38bdf8);
      this.materials.oceanShelf.color.setHex(0xbae6fd);
      this.materials.landGrass.color.setHex(0xe0f2fe);
      this.scene.background.setHex(0x061124);
      this.scene.fog.color.setHex(0x061124);
    } else {
      // Standard Vibrant Earth (matches reference)
      this.materials.oceanWater.color.setHex(0x009ce5);
      this.materials.oceanShelf.color.setHex(0x38c2f8);
      this.materials.landGrass.color.setHex(0x76c817);
      this.scene.background.setHex(0x091428);
      this.scene.fog.color.setHex(0x091428);
    }
  }

  setCameraPreset(preset) {
    if (preset === 'top') {
      return { position: { x: 0, y: 26, z: 0.1 }, target: { x: 0, y: 0, z: 0 } };
    } else if (preset === 'equator') {
      return { position: { x: 0, y: 2, z: 24 }, target: { x: 0, y: 0, z: 0 } };
    } else if (preset === 'asia') {
      return { position: { x: -16.5, y: 12, z: -16.5 }, target: { x: 0, y: 0, z: 0 } };
    } else {
      // Default Isometric view matching reference
      return { position: { x: 16.5, y: 14.5, z: 16.5 }, target: { x: 0, y: 0, z: 0 } };
    }
  }

  onResize() {
    this.width = this.container.clientWidth;
    this.height = this.container.clientHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  update(delta, elapsed) {
    this.controls.update();

    // Auto rotate if toggled on
    if (this.autoRotate && !this.isExploded) {
      this.planetGroup.rotation.y += delta * 0.15;
    }

    // Gentle core pulsation
    if (this.coreWireframe) {
      this.coreWireframe.rotation.x += delta * 0.3;
      this.coreWireframe.rotation.y += delta * 0.5;
    }
    if (this.corePointLight) {
      this.corePointLight.intensity = 3.0 + Math.sin(elapsed * 4) * 0.6;
    }

  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
