import * as THREE from 'three';
import { MAP, WORLD } from '@config/gameplay';
import type { TerrainFeature, TerrainFeatureKind, TerrainVisual } from '@config/terrain';
import { TERRAIN_RENDER_COLORS } from '@config/terrain';

export interface TerrainFeatureLayer {
  group: THREE.Group;
  tick(dtMs: number): void;
}

const TEX_SIZE = 2048;

export function makeTerrainFeatureLayer(features: readonly TerrainFeature[]): TerrainFeatureLayer {
  const group = new THREE.Group();
  group.name = 'terrain-features';
  const texture = makeTerrainOverlayTexture(features);
  const mat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WORLD.width, WORLD.depth), mat);
  mesh.name = 'terrain-texture-overlay';
  mesh.position.set(WORLD.width / 2, 0.084, WORLD.depth / 2);
  mesh.rotation.x = -Math.PI / 2;
  group.add(mesh);
  return {
    group,
    tick(): void {
      // Static bitmap terrain. Movement/pulse made it read like UI, not map material.
    },
  };
}

function makeTerrainOverlayTexture(features: readonly TerrainFeature[]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = TEX_SIZE;
  canvas.height = TEX_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, TEX_SIZE, TEX_SIZE);

  for (const feature of features) {
    const rand = mulberry32(seedFor(feature.kind, feature.id));
    for (const visual of feature.visuals) {
      drawTransition(ctx, feature.kind, visual, rand);
    }
  }
  for (const feature of features) {
    const rand = mulberry32(seedFor(feature.kind, feature.id) + 77);
    for (const visual of feature.visuals) {
      drawSurface(ctx, feature.kind, visual, rand);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function drawTransition(ctx: CanvasRenderingContext2D, kind: TerrainFeatureKind, visual: TerrainVisual, rand: () => number): void {
  const p = palette(kind);
  if (visual.type === 'capsule') {
    const pts = [toPx(visual.ax, visual.ay), toPx(visual.bx, visual.by)];
    const radius = visual.radius * tilePx();
    drawBlobChain(ctx, pts, radius + tilePx() * 0.52, p.bank, 0.22, rand, 1.05);
    drawBlobChain(ctx, pts, radius + tilePx() * 0.28, p.wet, 0.16, rand, 0.96);
    drawBlobChain(ctx, pts, radius + tilePx() * 0.12, p.ground, 0.045, rand, 1.2);
  } else {
    const c = toPx(visual.cx, visual.cy);
    drawBlob(ctx, c.x, c.y, visual.rx * tilePx(), visual.ry * tilePx(), p.bank, 0.25, rand, 1.34);
    drawBlob(ctx, c.x, c.y, visual.rx * tilePx(), visual.ry * tilePx(), p.wet, 0.18, rand, 1.12);
  }
}

function drawSurface(ctx: CanvasRenderingContext2D, kind: TerrainFeatureKind, visual: TerrainVisual, rand: () => number): void {
  const p = palette(kind);
  const pattern = makeSurfacePattern(ctx, kind);
  if (visual.type === 'capsule') {
    const pts = [toPx(visual.ax, visual.ay), toPx(visual.bx, visual.by)];
    const radius = visual.radius * tilePx() * 0.74;
    drawBlobChain(ctx, pts, radius, p.deep, kind === 'river' ? 0.66 : 0.72, rand, 0.9);
    if (pattern) drawBlobChain(ctx, pts, radius * 0.86, pattern, kind === 'river' ? 0.3 : 0.34, rand, 0.8);
    drawVeins(ctx, pts, p.hot, kind === 'lava' ? 0.1 : 0.04, rand);
  } else {
    const c = toPx(visual.cx, visual.cy);
    drawBlob(ctx, c.x, c.y, visual.rx * tilePx(), visual.ry * tilePx(), p.deep, kind === 'acid' ? 0.78 : 0.72, rand, 0.82);
    if (pattern) drawBlob(ctx, c.x, c.y, visual.rx * tilePx(), visual.ry * tilePx(), pattern, kind === 'acid' ? 0.56 : 0.48, rand, 0.68);
    for (let i = 0; i < 34; i++) {
      ctx.fillStyle = rgba(p.hot, 0.05 + rand() * 0.1);
      ctx.beginPath();
      ctx.arc(c.x + (rand() - 0.5) * visual.rx * tilePx(), c.y + (rand() - 0.5) * visual.ry * tilePx(), 2 + rand() * 9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawBlobChain(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ x: number; y: number }>,
  radius: number,
  style: string | CanvasPattern,
  alpha: number,
  rand: () => number,
  scale: number,
): void {
  if (pts.length < 2) return;
  const a = pts[0]!;
  const b = pts[1]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(8, Math.ceil(len / Math.max(12, radius * 0.42)));
  const nx = len > 0 ? -dy / len : 0;
  const ny = len > 0 ? dx / len : 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const taper = smoothTaper(t);
    const meander = Math.sin(t * Math.PI * 2.0 + rand() * 0.4) * radius * 0.18;
    const x = a.x + dx * t + nx * (meander + (rand() - 0.5) * radius * 0.16);
    const y = a.y + dy * t + ny * (meander + (rand() - 0.5) * radius * 0.16);
    const r = radius * taper * (0.72 + rand() * 0.42) * scale;
    drawBlob(ctx, x, y, r * (0.85 + rand() * 0.36), r * (0.72 + rand() * 0.42), style, alpha, rand, 1);
  }
}

function drawBlob(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  style: string | CanvasPattern,
  alpha: number,
  rand: () => number,
  scale: number,
): void {
  const pts = 30;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = style;
  ctx.beginPath();
  for (let i = 0; i <= pts; i++) {
    const t = (i / pts) * Math.PI * 2;
    const wobble = scale * (0.9 + rand() * 0.18);
    const x = cx + Math.cos(t) * rx * wobble;
    const y = cy + Math.sin(t) * ry * wobble;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawVeins(ctx: CanvasRenderingContext2D, pts: Array<{ x: number; y: number }>, color: string, alpha: number, rand: () => number): void {
  const a = pts[0]!;
  const b = pts[1]!;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const nx = len > 0 ? -dy / len : 0;
  const ny = len > 0 ? dx / len : 0;
  for (let i = 0; i < 8; i++) {
    const offset = (rand() - 0.5) * tilePx() * 0.6;
    ctx.save();
    ctx.globalAlpha = alpha * (0.55 + rand() * 0.7);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1 + rand() * 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      const x = a.x + dx * t + nx * (offset + Math.sin(t * Math.PI * 3 + i) * tilePx() * 0.12);
      const y = a.y + dy * t + ny * (offset + Math.sin(t * Math.PI * 3 + i) * tilePx() * 0.12);
      if (j === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function smoothTaper(t: number): number {
  const edge = Math.min(t, 1 - t);
  return 0.62 + 0.38 * Math.min(1, edge / 0.18);
}

function makeSurfacePattern(ctx: CanvasRenderingContext2D, kind: TerrainFeatureKind): CanvasPattern | null {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const pctx = c.getContext('2d')!;
  const p = palette(kind);
  pctx.fillStyle = p.deep;
  pctx.fillRect(0, 0, 256, 256);
  const rand = mulberry32(kind === 'river' ? 991 : kind === 'lava' ? 1193 : 1523);
  for (let i = 0; i < 140; i++) {
    pctx.strokeStyle = rgba(i % 5 === 0 ? p.hot : p.mid, kind === 'lava' ? 0.12 + rand() * 0.18 : 0.05 + rand() * 0.1);
    pctx.lineWidth = 1 + rand() * (kind === 'lava' ? 2.6 : 1.4);
    pctx.beginPath();
    const x = rand() * 256;
    const y = rand() * 256;
    const len = 30 + rand() * 110;
    pctx.moveTo(x, y);
    pctx.bezierCurveTo(x + len * 0.3, y + rand() * 24 - 12, x + len * 0.7, y + rand() * 24 - 12, x + len, y + rand() * 28 - 14);
    pctx.stroke();
  }
  return ctx.createPattern(c, 'repeat');
}

function toPx(tx: number, ty: number): { x: number; y: number } {
  return { x: (tx * MAP.tileSize / WORLD.width) * TEX_SIZE, y: (ty * MAP.tileSize / WORLD.depth) * TEX_SIZE };
}

function tilePx(): number {
  return (MAP.tileSize / WORLD.width) * TEX_SIZE;
}

function palette(kind: TerrainFeatureKind): { deep: string; mid: string; hot: string; wet: string; bank: string; ground: string } {
  if (kind === 'lava') return { deep: '#401206', mid: '#a63718', hot: '#ff8b3d', wet: '#633121', bank: '#503429', ground: '#20301f' };
  if (kind === 'acid') return { deep: '#1f4d0e', mid: '#6c9d21', hot: '#b7ff55', wet: '#4e672d', bank: '#3e5029', ground: '#20301f' };
  return { deep: '#08344a', mid: '#1e6d86', hot: '#8adfff', wet: '#3d645e', bank: '#526f5c', ground: '#20301f' };
}

function rgba(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

function seedFor(kind: TerrainFeatureKind, id: string): number {
  let seed = kind === 'river' ? 1000 : kind === 'lava' ? 2000 : 3000;
  for (let i = 0; i < id.length; i++) seed = (seed * 31 + id.charCodeAt(i)) >>> 0;
  return seed;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeDebugTerrainTileLayer(features: readonly TerrainFeature[]): THREE.Group {
  const group = new THREE.Group();
  group.name = 'terrain-feature-tiles';
  for (const feature of features) {
    const colors = TERRAIN_RENDER_COLORS[feature.kind];
    const geom = new THREE.BoxGeometry(MAP.tileSize * 0.96, 0.025, MAP.tileSize * 0.96);
    const mat = new THREE.MeshBasicMaterial({
      color: colors.base,
      transparent: true,
      opacity: colors.opacity * 0.45,
      depthWrite: false,
    });
    const mesh = new THREE.InstancedMesh(geom, mat, feature.tiles.length);
    mesh.name = `terrain:${feature.kind}:${feature.id}`;
    const mx = new THREE.Matrix4();
    feature.tiles.forEach((tile, index) => {
      mx.makeTranslation((tile.tx + 0.5) * MAP.tileSize, 0.08, (tile.ty + 0.5) * MAP.tileSize);
      mesh.setMatrixAt(index, mx);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
  return group;
}
