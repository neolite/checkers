import * as THREE from 'three';
import { WORLD } from '@config/gameplay';
import { NEUTRAL_COLORS } from '@config/palette';
import { FX_TUNING } from '@config/fx';

export interface RenderContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  terrain: THREE.Mesh;
  sun: THREE.DirectionalLight;
}

function buildTerrainMesh(): THREE.Mesh {
  const seg = 48;
  const geom = new THREE.PlaneGeometry(WORLD.width, WORLD.depth, seg, seg);
  // Kept flat — dune-y heightmaps made the fog overlay "leak" through crests and
  // confused unit picking. A flat ground is cleaner for a single-screen prototype.
  const pos = geom.attributes.position!;
  // Use the noise to generate COLOR variance instead of Z variance.
  const rand = mulberry32(FX_TUNING.render.terrainRoughnessSeed);
  void rand;
  pos.needsUpdate = true;
  geom.computeVertexNormals();
  // Lay it flat (XZ plane) — three.js plane is XY by default.
  geom.rotateX(-Math.PI / 2);
  // Translate so world origin is (0,0,0) top-left of map, not centered.
  geom.translate(WORLD.width / 2, 0, WORLD.depth / 2);

  const mat = new THREE.MeshLambertMaterial({
    color: NEUTRAL_COLORS.terrain,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createRenderContext(host: HTMLElement): RenderContext {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(FX_TUNING.render.clearColor);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(FX_TUNING.render.clearColor, 120, 260);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 400);
  camera.position.set(WORLD.width / 2, 55, WORLD.depth / 2 + 30);
  camera.lookAt(WORLD.width / 2, 0, WORLD.depth / 2);

  // Lights
  const ambient = new THREE.HemisphereLight(0xc8d8ff, 0x1a2230, 0.55);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xfff3da, 0.95);
  sun.position.set(60, 120, 40);
  sun.target.position.set(WORLD.width / 2, 0, WORLD.depth / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 300;
  const sbox = 90;
  sun.shadow.camera.left = -sbox;
  sun.shadow.camera.right = sbox;
  sun.shadow.camera.top = sbox;
  sun.shadow.camera.bottom = -sbox;
  scene.add(sun);
  scene.add(sun.target);

  const terrain = buildTerrainMesh();
  scene.add(terrain);

  // Faint grid overlay.
  const grid = new THREE.GridHelper(WORLD.width, 32, 0x2a3647, 0x1a222e);
  grid.position.set(WORLD.width / 2, 0.02, WORLD.depth / 2);
  (grid.material as THREE.Material).opacity = FX_TUNING.render.gridOpacity;
  (grid.material as THREE.Material).transparent = true;
  scene.add(grid);

  window.addEventListener('resize', () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  });

  return { renderer, scene, camera, terrain, sun };
}
