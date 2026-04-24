import * as THREE from 'three';
import { FOG, WORLD, MAP } from '@config/gameplay';

// Fog of war overlay: a canvas-textured plane at y≈0.15 above terrain.
// The canvas has one pixel per nav tile, painted by FogSystem at 5 Hz.
// Out-of-sight dynamic entities dim their alpha; the overlay handles terrain.

export interface FogOverlay {
  mesh: THREE.Mesh;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
  paint(grid: Uint8Array): void;
}

export function createFogOverlay(): FogOverlay {
  const canvas = document.createElement('canvas');
  canvas.width = FOG.gridW;
  canvas.height = FOG.gridH;
  const maybeCtx = canvas.getContext('2d', { willReadFrequently: false });
  if (!maybeCtx) throw new Error('Could not get 2d context for fog canvas');
  const ctx: CanvasRenderingContext2D = maybeCtx;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  const planeGeom = new THREE.PlaneGeometry(WORLD.width, WORLD.depth);
  planeGeom.rotateX(-Math.PI / 2);
  planeGeom.translate(WORLD.width / 2, 0, WORLD.depth / 2);

  // Additive-subtract approach with a transparent canvas + multiply blend would
  // require postprocessing. Simpler: we paint dark fog into the canvas and draw the
  // plane with a "NormalBlending" transparent material — unseen = black alpha 1.
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });

  const mesh = new THREE.Mesh(planeGeom, mat);
  mesh.position.y = 0.05;
  mesh.renderOrder = 2;
  mesh.name = 'fog-overlay';

  // Cached image data — we rebuild each paint from scratch for simplicity at 5Hz.
  const img = ctx.createImageData(canvas.width, canvas.height);

  function paint(gridData: Uint8Array): void {
    // gridData[i] ∈ {0 unexplored, 1 explored, 2 visible}
    const data = img.data;
    for (let i = 0; i < gridData.length; i++) {
      const v = gridData[i]!;
      const off = i * 4;
      if (v === FOG.unexplored) {
        data[off + 0] = 0; data[off + 1] = 0; data[off + 2] = 0; data[off + 3] = 255;
      } else if (v === FOG.explored) {
        data[off + 0] = 0; data[off + 1] = 0; data[off + 2] = 0; data[off + 3] = 135;
      } else {
        data[off + 0] = 0; data[off + 1] = 0; data[off + 2] = 0; data[off + 3] = 0;
      }
    }
    ctx.putImageData(img, 0, 0);
    texture.needsUpdate = true;
  }

  // Initial fill: all unexplored.
  paint(new Uint8Array(FOG.gridW * FOG.gridH));

  return { mesh, canvas, ctx, texture, paint };
}

// Utility used elsewhere: converts world XY to fog tile and reads value.
export function sampleFog(grid: Uint8Array, wx: number, wy: number): 0 | 1 | 2 {
  const tx = Math.floor(wx / MAP.tileSize);
  const ty = Math.floor(wy / MAP.tileSize);
  if (tx < 0 || ty < 0 || tx >= FOG.gridW || ty >= FOG.gridH) return 0;
  const v = grid[ty * FOG.gridW + tx]!;
  return (v as 0 | 1 | 2);
}
