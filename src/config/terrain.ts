import { MAP } from '@config/gameplay';

export type TerrainFeatureKind = 'river' | 'lava' | 'acid';

export interface TerrainTile {
  tx: number;
  ty: number;
}

export interface TerrainFeature {
  id: string;
  kind: TerrainFeatureKind;
  tiles: readonly TerrainTile[];
  visuals: readonly TerrainVisual[];
}

export type TerrainVisual =
  | { type: 'capsule'; ax: number; ay: number; bx: number; by: number; radius: number }
  | { type: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

export const TERRAIN_KIND_INDEX: Record<TerrainFeatureKind, number> = {
  river: 1,
  lava: 2,
  acid: 3,
} as const;

export const TERRAIN_MINIMAP_COLORS: Record<TerrainFeatureKind, string> = {
  river: '#245d7a',
  lava: '#8f3727',
  acid: '#57792d',
} as const;

export const TERRAIN_RENDER_COLORS: Record<TerrainFeatureKind, { base: number; rim: number; opacity: number }> = {
  river: { base: 0x245d7a, rim: 0x62c7ff, opacity: 0.46 },
  lava: { base: 0x8f3727, rim: 0xff8a3d, opacity: 0.52 },
  acid: { base: 0x57792d, rim: 0xb7ff5a, opacity: 0.44 },
} as const;

export function generateTerrainFeatures(): TerrainFeature[] {
  return [
    capsuleFeature('river-south-bend', 'river', [[16, 42], [28, 47], [43, 43]], 1.35),
    capsuleFeature('lava-central-cut', 'lava', [[24, 29], [35, 35], [44, 31]], 1.1),
    capsuleFeature('lava-north-scar', 'lava', [[35, 18], [45, 23]], 0.9),
    ellipseFeature('acid-west-pool', 'acid', 18, 25, 2.4, 1.7),
    ellipseFeature('acid-east-pool', 'acid', 49, 48, 2.3, 1.6),
  ];
}

function capsuleFeature(id: string, kind: TerrainFeatureKind, points: Array<[number, number]>, radius: number): TerrainFeature {
  return {
    id,
    kind,
    tiles: capsulePolyline(points, radius),
    visuals: points.slice(0, -1).map((p, i) => {
      const n = points[i + 1]!;
      return { type: 'capsule', ax: p[0], ay: p[1], bx: n[0], by: n[1], radius };
    }),
  };
}

function ellipseFeature(id: string, kind: TerrainFeatureKind, cx: number, cy: number, rx: number, ry: number): TerrainFeature {
  return { id, kind, tiles: ellipse(cx, cy, rx, ry), visuals: [{ type: 'ellipse', cx, cy, rx, ry }] };
}

function capsulePolyline(points: Array<[number, number]>, radius: number): TerrainTile[] {
  const out = new Map<string, TerrainTile>();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const minX = Math.max(0, Math.floor(Math.min(a[0], b[0]) - radius - 1));
    const maxX = Math.min(MAP.tilesX - 1, Math.ceil(Math.max(a[0], b[0]) + radius + 1));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b[1]) - radius - 1));
    const maxY = Math.min(MAP.tilesY - 1, Math.ceil(Math.max(a[1], b[1]) + radius + 1));
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (distanceToSegment(tx + 0.5, ty + 0.5, a[0], a[1], b[0], b[1]) <= radius) {
          out.set(`${tx},${ty}`, { tx, ty });
        }
      }
    }
  }
  return [...out.values()];
}

function ellipse(cx: number, cy: number, rx: number, ry: number): TerrainTile[] {
  const out: TerrainTile[] = [];
  const minX = Math.max(0, Math.floor(cx - rx - 1));
  const maxX = Math.min(MAP.tilesX - 1, Math.ceil(cx + rx + 1));
  const minY = Math.max(0, Math.floor(cy - ry - 1));
  const maxY = Math.min(MAP.tilesY - 1, Math.ceil(cy + ry + 1));
  for (let ty = minY; ty <= maxY; ty++) {
    for (let tx = minX; tx <= maxX; tx++) {
      const nx = (tx + 0.5 - cx) / rx;
      const ny = (ty + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) out.push({ tx, ty });
    }
  }
  return out;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 <= 0 ? 0 : Math.max(0, Math.min(1, (wx * vx + wy * vy) / len2));
  const dx = px - (ax + vx * t);
  const dy = py - (ay + vy * t);
  return Math.hypot(dx, dy);
}
