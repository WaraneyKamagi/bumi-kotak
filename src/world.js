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
    this.setupVenus();
    this.setupMars();

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
      }),

      // --- Venus Materials (Sulfuric Yellow/Gold & Molten Core) ---
      venusCrust: new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.65 }),
      venusRidge: new THREE.MeshStandardMaterial({ color: 0xca8a04, roughness: 0.8 }),
      venusCloud: new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.4 }),
      venusMantle: new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 }),
      venusCore: new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0xd97706,
        emissiveIntensity: 2.2,
        roughness: 0.2,
        metalness: 0.5
      }),
      venusAtmo: new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0.18,
        depthWrite: false
      }),
      venusAtmoLine: new THREE.LineBasicMaterial({
        color: 0xfde047,
        transparent: true,
        opacity: 0.85
      }),

      // --- Mars Materials (Terracotta/Rust Red & Frozen Core) ---
      marsCrust: new THREE.MeshStandardMaterial({ color: 0xc2410c, roughness: 0.75 }),
      marsDarkRock: new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.85 }),
      marsIce: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }),
      marsMantle: new THREE.MeshStandardMaterial({ color: 0x450a0a, roughness: 0.95 }),
      marsCore: new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 2.3,
        roughness: 0.2,
        metalness: 0.5
      }),
      marsAtmo: new THREE.MeshBasicMaterial({
        color: 0xf87171,
        transparent: true,
        opacity: 0.15,
        depthWrite: false
      }),
      marsAtmoLine: new THREE.LineBasicMaterial({
        color: 0xfca5a5,
        transparent: true,
        opacity: 0.8
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
    this.coreWireframe.raycast = () => {};
    this.coreGroup.add(this.coreWireframe);

    this.planetGroup.add(this.coreGroup);
  }

  setupAtmosphere() {
    // Outer atmospheric cubic shell encasing the planet (as seen in the reference)
    const atmoSize = 10.65;
    const atmoGeom = new THREE.BoxGeometry(atmoSize, atmoSize, atmoSize);

    // Translucent cyan volume (pass-through raycast to surface below)
    this.atmoMesh = new THREE.Mesh(atmoGeom, this.materials.atmoShell);
    this.atmoMesh.raycast = () => {};
    this.planetGroup.add(this.atmoMesh);

    // Distinct glowing cyan border lines
    const edgesGeom = new THREE.EdgesGeometry(atmoGeom);
    this.atmoLines = new THREE.LineSegments(edgesGeom, this.materials.atmoLine);
    this.atmoLines.raycast = () => {};
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
        explodedPosition: cfg.normal.clone().multiplyScalar(HALF_SIZE * 1.55)
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

  setupVenus() {
    this.venusGroup = new THREE.Group();
    const S = 9.6; // Same size as Earth (9.6)
    const HALF_S = S / 2;
    this.venusGroup.position.set(-19, 0, -2);
    // Angle so the exposed half-core directly faces front-right toward the viewer
    this.venusGroup.rotation.y = -Math.PI * 0.28;

    // Helper for box voxels
    const boxGeom = new THREE.BoxGeometry(1, 1, 1);
    const createVoxel = (x, y, z, sx, sy, sz, mat, data) => {
      const v = new THREE.Mesh(boxGeom, mat);
      v.position.set(x, y, z);
      v.scale.set(sx, sy, sz);
      v.castShadow = true;
      v.receiveShadow = true;
      if (data) v.userData = data;
      return v;
    };

    // --- 1. Outer Crust Base Group (Disassembles outwards along -X) ---
    this.venusCrustGroup = new THREE.Group();
    const halfBaseGeom = new THREE.BoxGeometry(HALF_S, S, S);
    const halfBaseMesh = new THREE.Mesh(halfBaseGeom, this.materials.venusCrust);
    halfBaseMesh.position.set(-HALF_S / 2, 0, 0);
    halfBaseMesh.castShadow = true;
    halfBaseMesh.receiveShadow = true;
    halfBaseMesh.userData = {
      name: 'Permukaan Kerak Venus (Sulfur Crust)',
      category: 'Kerak Planet',
      temp: '465 °C',
      elevation: '+92 atm (Tekanan Superkritis)',
      feature: 'Daratan batuan basal panas berselimut awan gas sulfur asam pekat.'
    };
    this.venusCrustGroup.add(halfBaseMesh);

    // Half atmosphere box & bounding line (pass-through raycast to surface below)
    const atmoGeom = new THREE.BoxGeometry(HALF_S * 1.08, S * 1.08, S * 1.08);
    const atmoMesh = new THREE.Mesh(atmoGeom, this.materials.venusAtmo);
    atmoMesh.position.set(-HALF_S * 1.08 / 2, 0, 0);
    atmoMesh.raycast = () => {};
    this.venusCrustGroup.add(atmoMesh);

    const atmoEdges = new THREE.LineSegments(new THREE.EdgesGeometry(atmoGeom), this.materials.venusAtmoLine);
    atmoEdges.position.copy(atmoMesh.position);
    atmoEdges.raycast = () => {};
    this.venusCrustGroup.add(atmoEdges);

    this.venusGroup.add(this.venusCrustGroup);

    // --- 2. Mountain & Ridge Feature Group (Disassembles Upwards +Y) ---
    this.venusMountainGroup = new THREE.Group();
    const maxwellMontes = createVoxel(-HALF_S / 2, -1.8, HALF_S + 0.15, HALF_S * 0.75, 1.2, 0.35, this.materials.venusRidge, {
      name: 'Pegunungan Vulkanik Venus (Maxwell Montes)',
      category: 'Relief Vulkanik',
      temp: '440 °C',
      elevation: '+11 km dpl',
      feature: 'Puncak gunung tertinggi di Venus yang diselimuti salju logam semikonduktor.'
    });
    this.venusMountainGroup.add(maxwellMontes);

    const ishtarTerra = createVoxel(-HALF_S - 0.15, 0.5, 0, 0.35, 3.8, 3.8, this.materials.venusRidge, {
      name: 'Dataran Tinggi Ishtar Terra',
      category: 'Benua Venus',
      temp: '450 °C',
      elevation: '+4,200 m',
      feature: 'Wilayah daratan benua dataran tinggi berukuran benua Australia di belahan utara Venus.'
    });
    this.venusMountainGroup.add(ishtarTerra);
    this.venusGroup.add(this.venusMountainGroup);

    // --- 3. Atmospheric Cloud & Vortex Group (Disassembles Frontwards +Z) ---
    this.venusCloudGroup = new THREE.Group();
    const sulfurCloud = createVoxel(-HALF_S / 2, 2.0, HALF_S + 0.15, HALF_S * 0.9, 1.3, 0.35, this.materials.venusCloud, {
      name: 'Pita Awan Asam Sulfur Venus',
      category: 'Troposfer Venus',
      temp: '380 °C',
      elevation: '+45 km dpl',
      feature: 'Gelombang awan gas asam sulfur pekat pembawa efek rumah kaca tak terkendali.'
    });
    this.venusCloudGroup.add(sulfurCloud);

    const cloudVortex = createVoxel(-HALF_S / 2, 0.2, -HALF_S - 0.15, HALF_S * 0.85, 1.8, 0.35, this.materials.venusCloud, {
      name: 'Vorteks Atmosfer Super-Rotasi Venus',
      category: 'Dinamika Atmosfer',
      temp: '370 °C',
      elevation: '+55 km dpl',
      feature: 'Pusaran badai gas atmosfer asam sulfur yang berputar 60 kali lebih cepat dari rotasi planet.'
    });
    this.venusCloudGroup.add(cloudVortex);
    this.venusGroup.add(this.venusCloudGroup);

    // --- 4. Silicate Mantle Slab (Disassembles to X: -2.6) ---
    const mantleGeom = new THREE.BoxGeometry(0.2, S * 0.92, S * 0.92);
    this.venusMantleMesh = new THREE.Mesh(mantleGeom, this.materials.venusMantle);
    this.venusMantleMesh.position.set(-0.1, 0, 0);
    this.venusMantleMesh.userData = {
      name: 'Mantel Batuan Silikat Venus',
      category: 'Mantel Planet',
      temp: '1,800 °C',
      elevation: '-2,800 km kedalaman',
      feature: 'Lapisan mantel batuan silikat tebal dengan arus konveksi magma vulkanik aktif.'
    };
    this.venusGroup.add(this.venusMantleMesh);

    // --- 5. Molten Outer Core Slab (Disassembles to X: -1.2) ---
    const outerCoreGeom = new THREE.BoxGeometry(0.25, S * 0.55, S * 0.55);
    this.venusOuterCoreMesh = new THREE.Mesh(outerCoreGeom, this.materials.venusCore);
    this.venusOuterCoreMesh.position.set(-0.05, 0, 0);
    this.venusOuterCoreMesh.userData = {
      name: 'Cincin Inti Luar Cair Venus',
      category: 'Magma Logam',
      temp: '3,800 °C',
      elevation: '-4,200 km kedalaman',
      feature: 'Logam besi-nikel cair berpendar dengan tekanan geomagnetik tinggi.'
    };
    this.venusGroup.add(this.venusOuterCoreMesh);

    // --- 6. Protruding Glowing Inner Core Cube (Disassembles to X: +2.0, Scales to 1.25) ---
    const coreCubeGeom = new THREE.BoxGeometry(S * 0.36, S * 0.36, S * 0.36);
    this.venusCoreMesh = new THREE.Mesh(coreCubeGeom, this.materials.venusCore);
    this.venusCoreMesh.position.set(S * 0.05, 0, 0);
    this.venusCoreMesh.castShadow = true;
    this.venusCoreMesh.userData = {
      name: 'Inti Padat Venus (Exposed Core)',
      category: 'Pusat Planet',
      temp: '4,500 °C',
      elevation: 'Pusat Planet (Radius 1,500 km)',
      feature: 'Inti besi-nikel padat super-panas yang terpapar pada potongan 50% planet.'
    };
    this.venusGroup.add(this.venusCoreMesh);

    // Core Wireframe Cage attached to venusCoreMesh
    const wireGeom = new THREE.BoxGeometry(S * 0.39, S * 0.39, S * 0.39);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0xffe066, wireframe: true, transparent: true, opacity: 0.5 });
    this.venusWire = new THREE.Mesh(wireGeom, wireMat);
    this.venusWire.raycast = () => {};
    this.venusCoreMesh.add(this.venusWire);

    // Internal Point Light shining outward attached to venusCoreMesh
    this.venusLight = new THREE.PointLight(0xfbbf24, 3.2, 20, 1.2);
    this.venusLight.position.set(1.5, 0, 0);
    this.venusCoreMesh.add(this.venusLight);

    // Floating magma embers
    const emberCount = 35;
    const emberGeom = new THREE.BufferGeometry();
    const emberPos = new Float32Array(emberCount * 3);
    for (let i = 0; i < emberCount; i++) {
      emberPos[i * 3] = Math.random() * (S * 0.45);
      emberPos[i * 3 + 1] = (Math.random() - 0.5) * (S * 0.6);
      emberPos[i * 3 + 2] = (Math.random() - 0.5) * (S * 0.6);
    }
    emberGeom.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
    const emberMat = new THREE.PointsMaterial({ color: 0xf59e0b, size: 0.35, transparent: true, opacity: 0.85 });
    this.venusEmbers = new THREE.Points(emberGeom, emberMat);
    this.venusEmbers.raycast = () => {};
    this.venusGroup.add(this.venusEmbers);

    // Define Exploded Parts for Venus
    this.venusParts = [
      {
        id: 'venus-crust',
        mesh: this.venusCrustGroup,
        initialPosition: new THREE.Vector3(0, 0, 0),
        explodedPosition: new THREE.Vector3(-2.8, 0, 0)
      },
      {
        id: 'venus-mountain',
        mesh: this.venusMountainGroup,
        initialPosition: new THREE.Vector3(0, 0, 0),
        explodedPosition: new THREE.Vector3(-0.9, 2.2, 0)
      },
      {
        id: 'venus-cloud',
        mesh: this.venusCloudGroup,
        initialPosition: new THREE.Vector3(0, 0, 0),
        explodedPosition: new THREE.Vector3(-0.9, 0, 2.2)
      },
      {
        id: 'venus-mantle',
        mesh: this.venusMantleMesh,
        initialPosition: new THREE.Vector3(-0.1, 0, 0),
        explodedPosition: new THREE.Vector3(-1.6, 0, 0)
      },
      {
        id: 'venus-outercore',
        mesh: this.venusOuterCoreMesh,
        initialPosition: new THREE.Vector3(-0.05, 0, 0),
        explodedPosition: new THREE.Vector3(-0.8, 0, 0)
      },
      {
        id: 'venus-core',
        mesh: this.venusCoreMesh,
        initialPosition: new THREE.Vector3(S * 0.05, 0, 0),
        explodedPosition: new THREE.Vector3(S * 0.05 + 1.2, 0, 0),
        initialScale: new THREE.Vector3(1, 1, 1),
        explodedScale: new THREE.Vector3(1.15, 1.15, 1.15)
      }
    ];

    this.scene.add(this.venusGroup);
  }

  setupMars() {
    this.marsGroup = new THREE.Group();
    const S = 9.6; // Same size as Earth (9.6)
    const HALF_S = S / 2;
    this.marsGroup.position.set(19, 0, 2);
    // Angle so the exposed half-core directly faces front-right toward the viewer
    this.marsGroup.rotation.y = -Math.PI * 0.28;

    // Helper for box voxels
    const boxGeom = new THREE.BoxGeometry(1, 1, 1);
    const createVoxel = (x, y, z, sx, sy, sz, mat, data) => {
      const v = new THREE.Mesh(boxGeom, mat);
      v.position.set(x, y, z);
      v.scale.set(sx, sy, sz);
      v.castShadow = true;
      v.receiveShadow = true;
      if (data) v.userData = data;
      return v;
    };

    // --- 1. Outer Crust Base Group (Disassembles outwards along -X) ---
    this.marsCrustGroup = new THREE.Group();
    const halfBaseGeom = new THREE.BoxGeometry(HALF_S, S, S);
    const halfBaseMesh = new THREE.Mesh(halfBaseGeom, this.materials.marsCrust);
    halfBaseMesh.position.set(-HALF_S / 2, 0, 0);
    halfBaseMesh.castShadow = true;
    halfBaseMesh.receiveShadow = true;
    halfBaseMesh.userData = {
      name: 'Dataran Gurun Karat Mars (Rust Crust)',
      category: 'Kerak Planet',
      temp: '-65 °C',
      elevation: '+1,200 m (Dataran Tharsis)',
      feature: 'Daratan gurun merah berdebu besi oksida dengan kawah vulkanik purba.'
    };
    this.marsCrustGroup.add(halfBaseMesh);

    // Dark volcanic basalt patches
    const basaltVoxel = createVoxel(-HALF_S - 0.15, -1.0, -0.5, 0.35, 2.8, 3.0, this.materials.marsDarkRock, {
      name: 'Formasi Batuan Basaltik Kuno Mars',
      category: 'Vulkanisme Purba',
      temp: '-60 °C',
      elevation: '+600 m',
      feature: 'Hamparan batuan beku vulkanik peninggalan erupsi jutaan tahun lalu.'
    });
    this.marsCrustGroup.add(basaltVoxel);

    // Half atmosphere box & bounding line (pass-through raycast to surface below)
    const atmoGeom = new THREE.BoxGeometry(HALF_S * 1.08, S * 1.08, S * 1.08);
    const atmoMesh = new THREE.Mesh(atmoGeom, this.materials.marsAtmo);
    atmoMesh.position.set(-HALF_S * 1.08 / 2, 0, 0);
    atmoMesh.raycast = () => {};
    this.marsCrustGroup.add(atmoMesh);

    const atmoEdges = new THREE.LineSegments(new THREE.EdgesGeometry(atmoGeom), this.materials.marsAtmoLine);
    atmoEdges.position.copy(atmoMesh.position);
    atmoEdges.raycast = () => {};
    this.marsCrustGroup.add(atmoEdges);

    this.marsGroup.add(this.marsCrustGroup);

    // --- 2. Polar Ice Cap Feature Group (Disassembles Upwards +Y) ---
    this.marsIceGroup = new THREE.Group();
    const polarIce = createVoxel(-HALF_S / 2, HALF_S + 0.15, 0, HALF_S * 0.8, 0.35, S * 0.7, this.materials.marsIce, {
      name: 'Tudung Es Kutub Mars (Planum Boreum)',
      category: 'Kriosfer Mars',
      temp: '-125 °C',
      elevation: '+2,800 m',
      feature: 'Lapisan es air dan es kering karbon dioksida beku abadi di kutub utara.'
    });
    this.marsIceGroup.add(polarIce);
    this.marsGroup.add(this.marsIceGroup);

    // --- 3. Canyon & Supervolcano Group (Disassembles Frontwards +Z) ---
    this.marsCanyonGroup = new THREE.Group();
    const vallesMarineris = createVoxel(-HALF_S / 2, 0, HALF_S + 0.15, HALF_S * 0.9, 0.9, 0.35, this.materials.marsDarkRock, {
      name: 'Ngarai Raksasa Valles Marineris',
      category: 'Celah Tektonik',
      temp: '-55 °C',
      elevation: '-7,000 m (Palung Ngarai)',
      feature: 'Ngarai terpanjang di tata surya dengan panjang 4.000 km dan kedalaman 7 km.'
    });
    this.marsCanyonGroup.add(vallesMarineris);

    const olympusMons = createVoxel(-HALF_S / 2, 1.4, -HALF_S - 0.15, HALF_S * 0.75, 1.5, 0.35, this.materials.marsDarkRock, {
      name: 'Gunung Berapi Olympus Mons',
      category: 'Supervolcano Mars',
      temp: '-70 °C',
      elevation: '+21,900 m (Puncak Tertinggi)',
      feature: 'Gunung berapi perisai raksasa tertinggi di tata surya, tingginya hampir 3 kali lipat Everest.'
    });
    this.marsCanyonGroup.add(olympusMons);
    this.marsGroup.add(this.marsCanyonGroup);

    // --- 4. Basalt Mantle Slab (Disassembles to X: -2.6) ---
    const mantleGeom = new THREE.BoxGeometry(0.2, S * 0.92, S * 0.92);
    this.marsMantleMesh = new THREE.Mesh(mantleGeom, this.materials.marsMantle);
    this.marsMantleMesh.position.set(-0.1, 0, 0);
    this.marsMantleMesh.userData = {
      name: 'Penampang Mantel Basalt Mars',
      category: 'Mantel Planet',
      temp: '1,200 °C',
      elevation: '-1,800 km kedalaman',
      feature: 'Mantel batuan basaltik kaya besi dan magnesium yang kini telah membeku.'
    };
    this.marsGroup.add(this.marsMantleMesh);

    // --- 5. Outer Core Ring Layer (Disassembles to X: -1.2) ---
    const outerCoreGeom = new THREE.BoxGeometry(0.25, S * 0.52, S * 0.52);
    this.marsOuterCoreMesh = new THREE.Mesh(outerCoreGeom, this.materials.marsCore);
    this.marsOuterCoreMesh.position.set(-0.05, 0, 0);
    this.marsOuterCoreMesh.userData = {
      name: 'Lapisan Inti Besi-Belerang Mars',
      category: 'Inti Luar',
      temp: '2,200 °C',
      elevation: '-2,800 km kedalaman',
      feature: 'Campuran besi, nikel, dan belerang cair dengan kepadatan tinggi.'
    };
    this.marsGroup.add(this.marsOuterCoreMesh);

    // --- 6. Protruding Glowing Inner Core Cube (Disassembles to X: +2.0, Scales to 1.25) ---
    const coreCubeGeom = new THREE.BoxGeometry(S * 0.35, S * 0.35, S * 0.35);
    this.marsCoreMesh = new THREE.Mesh(coreCubeGeom, this.materials.marsCore);
    this.marsCoreMesh.position.set(S * 0.05, 0, 0);
    this.marsCoreMesh.castShadow = true;
    this.marsCoreMesh.userData = {
      name: 'Inti Logam Beku Mars (Exposed Core)',
      category: 'Pusat Planet',
      temp: '2,800 °C',
      elevation: 'Pusat Planet (Radius 1,700 km)',
      feature: 'Inti padat besi-sulfida yang terpapar langsung pada belahan planet terbuka.'
    };
    this.marsGroup.add(this.marsCoreMesh);

    // Core Wireframe Cage attached to marsCoreMesh
    const wireGeom = new THREE.BoxGeometry(S * 0.38, S * 0.38, S * 0.38);
    const wireMat = new THREE.MeshBasicMaterial({ color: 0xff6b6b, wireframe: true, transparent: true, opacity: 0.5 });
    this.marsWire = new THREE.Mesh(wireGeom, wireMat);
    this.marsWire.raycast = () => {};
    this.marsCoreMesh.add(this.marsWire);

    // Internal Point Light attached to marsCoreMesh
    this.marsLight = new THREE.PointLight(0xef4444, 2.8, 18, 1.2);
    this.marsLight.position.set(1.5, 0, 0);
    this.marsCoreMesh.add(this.marsLight);

    // Floating embers
    const emberCount = 35;
    const emberGeom = new THREE.BufferGeometry();
    const emberPos = new Float32Array(emberCount * 3);
    for (let i = 0; i < emberCount; i++) {
      emberPos[i * 3] = Math.random() * (S * 0.45);
      emberPos[i * 3 + 1] = (Math.random() - 0.5) * (S * 0.6);
      emberPos[i * 3 + 2] = (Math.random() - 0.5) * (S * 0.6);
    }
    emberGeom.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
    const emberMat = new THREE.PointsMaterial({ color: 0xef4444, size: 0.32, transparent: true, opacity: 0.85 });
    this.marsEmbers = new THREE.Points(emberGeom, emberMat);
    this.marsEmbers.raycast = () => {};
    this.marsGroup.add(this.marsEmbers);

    // Define Exploded Parts for Mars
    this.marsParts = [
      {
        id: 'mars-crust',
        mesh: this.marsCrustGroup,
        initialPosition: new THREE.Vector3(0, 0, 0),
        explodedPosition: new THREE.Vector3(-2.8, 0, 0)
      },
      {
        id: 'mars-ice',
        mesh: this.marsIceGroup,
        initialPosition: new THREE.Vector3(0, 0, 0),
        explodedPosition: new THREE.Vector3(-0.9, 2.2, 0)
      },
      {
        id: 'mars-canyon',
        mesh: this.marsCanyonGroup,
        initialPosition: new THREE.Vector3(0, 0, 0),
        explodedPosition: new THREE.Vector3(-0.9, 0, 2.2)
      },
      {
        id: 'mars-mantle',
        mesh: this.marsMantleMesh,
        initialPosition: new THREE.Vector3(-0.1, 0, 0),
        explodedPosition: new THREE.Vector3(-1.6, 0, 0)
      },
      {
        id: 'mars-outercore',
        mesh: this.marsOuterCoreMesh,
        initialPosition: new THREE.Vector3(-0.05, 0, 0),
        explodedPosition: new THREE.Vector3(-0.8, 0, 0)
      },
      {
        id: 'mars-core',
        mesh: this.marsCoreMesh,
        initialPosition: new THREE.Vector3(S * 0.05, 0, 0),
        explodedPosition: new THREE.Vector3(S * 0.05 + 1.2, 0, 0),
        initialScale: new THREE.Vector3(1, 1, 1),
        explodedScale: new THREE.Vector3(1.15, 1.15, 1.15)
      }
    ];

    this.scene.add(this.marsGroup);
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
    if (preset === 'venus') {
      return { position: { x: -19 + 14.5, y: 10, z: -2 + 14.5 }, target: { x: -19, y: 0, z: -2 } };
    } else if (preset === 'mars') {
      return { position: { x: 19 + 14.5, y: 10, z: 2 + 14.5 }, target: { x: 19, y: 0, z: 2 } };
    } else if (preset === 'earth') {
      return { position: { x: 16.5, y: 13.5, z: 16.5 }, target: { x: 0, y: 0, z: 0 } };
    } else if (preset === 'top') {
      return { position: { x: 0, y: 26, z: 0.1 }, target: { x: 0, y: 0, z: 0 } };
    } else {
      // Default Panorama viewing all 3 planets side by side
      return { position: { x: 0, y: 17, z: 56 }, target: { x: 0, y: 0, z: 0 } };
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

    // Planet rotation (pauses gracefully when exploded for easy layer inspection)
    if (this.autoRotate && !this.isExploded) {
      if (this.planetGroup) this.planetGroup.rotation.y += delta * 0.15;
      if (this.venusGroup) this.venusGroup.rotation.y += delta * 0.12;
      if (this.marsGroup) this.marsGroup.rotation.y += delta * 0.14;
    }

    // Gentle Earth core pulsation
    if (this.coreWireframe) {
      this.coreWireframe.rotation.x += delta * 0.3;
      this.coreWireframe.rotation.y += delta * 0.5;
    }
    if (this.corePointLight) {
      this.corePointLight.intensity = (this.isExploded ? 4.5 : 3.0) + Math.sin(elapsed * 4) * 0.6;
    }

    // Venus core pulsation
    if (this.venusWire) {
      this.venusWire.rotation.x += delta * 0.25;
      this.venusWire.rotation.y += delta * 0.35;
    }
    if (this.venusLight) {
      this.venusLight.intensity = (this.isExploded ? 4.2 : 2.8) + Math.sin(elapsed * 3.5) * 0.5;
    }

    // Mars core pulsation
    if (this.marsWire) {
      this.marsWire.rotation.x += delta * 0.2;
      this.marsWire.rotation.y += delta * 0.3;
    }
    if (this.marsLight) {
      this.marsLight.intensity = (this.isExploded ? 3.8 : 2.5) + Math.sin(elapsed * 4.2) * 0.5;
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}
