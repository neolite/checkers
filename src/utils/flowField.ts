import { MAP } from '@config/gameplay';

// Nav grid is tile-centered. Each tile holds a "cost" (0 = passable, 255 = blocked).
// A flow field is an integrator-distance map from a goal; units read it at their tile
// and walk along the steepest descent.

export const IMPASSABLE = 255;

export class NavGrid {
  readonly w: number;
  readonly h: number;
  readonly cost: Uint8Array; // static/semi-static cost (0 = open, IMPASSABLE = blocked)

  constructor() {
    this.w = MAP.tilesX;
    this.h = MAP.tilesY;
    this.cost = new Uint8Array(this.w * this.h);
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  isBlocked(tx: number, ty: number): boolean {
    if (!this.inBounds(tx, ty)) return true;
    return this.cost[this.idx(tx, ty)] === IMPASSABLE;
  }

  setBlocked(tx: number, ty: number, blocked: boolean): void {
    if (!this.inBounds(tx, ty)) return;
    this.cost[this.idx(tx, ty)] = blocked ? IMPASSABLE : 0;
  }

  // Stamp a rectangle of tiles — used when buildings appear/disappear.
  stampRect(tx: number, ty: number, w: number, h: number, blocked: boolean): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.setBlocked(tx + dx, ty + dy, blocked);
      }
    }
  }

  worldToTile(wx: number, wy: number): [number, number] {
    // wx,wy are in world units, origin 0,0, map extends over WORLD.width/depth.
    // Convert to tile coords (clamped).
    const tx = Math.floor(wx / MAP.tileSize);
    const ty = Math.floor(wy / MAP.tileSize);
    return [
      tx < 0 ? 0 : tx >= this.w ? this.w - 1 : tx,
      ty < 0 ? 0 : ty >= this.h ? this.h - 1 : ty,
    ];
  }

  tileToWorld(tx: number, ty: number): [number, number] {
    return [(tx + 0.5) * MAP.tileSize, (ty + 0.5) * MAP.tileSize];
  }
}

// Flow field: integrator distance from goal, computed by BFS with 8-neighborhood
// and ortho/diag cost (10/14) ala grid A* heuristic.
// unreachable = 0xFFFF.
export const UNREACHABLE = 0xFFFF;

export class FlowField {
  readonly w: number;
  readonly h: number;
  // integrator distance grid (uint16)
  readonly dist: Uint16Array;
  // dir = packed (dx+1) | ((dy+1) << 2) ; stored as int8 directions (-1,0,1)
  readonly dirX: Int8Array;
  readonly dirY: Int8Array;
  goalTx: number = -1;
  goalTy: number = -1;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.dist = new Uint16Array(w * h);
    this.dirX = new Int8Array(w * h);
    this.dirY = new Int8Array(w * h);
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  // Build by BFS from goal tile. Diagonal moves cost 14, ortho 10.
  // We use a simple bucketed queue over ascending distance.
  rebuild(grid: NavGrid, goalTx: number, goalTy: number): void {
    const w = this.w, h = this.h;
    const dist = this.dist;
    const dirX = this.dirX;
    const dirY = this.dirY;
    // Clear.
    dist.fill(UNREACHABLE);
    dirX.fill(0);
    dirY.fill(0);
    this.goalTx = goalTx;
    this.goalTy = goalTy;
    if (goalTx < 0 || goalTy < 0 || goalTx >= w || goalTy >= h) return;

    // Fallback: if goal tile is blocked, find nearest open tile within a small radius.
    if (grid.isBlocked(goalTx, goalTy)) {
      let found = false;
      outer:
      for (let r = 1; r < 8; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const nx = goalTx + dx;
            const ny = goalTy + dy;
            if (grid.inBounds(nx, ny) && !grid.isBlocked(nx, ny)) {
              goalTx = nx;
              goalTy = ny;
              this.goalTx = nx;
              this.goalTy = ny;
              found = true;
              break outer;
            }
          }
        }
      }
      if (!found) return;
    }

    // Simple Dijkstra: two alternating buckets is complex; use an array as a min-heap via indexed "open" queue.
    // Scale: grid 64*64 = 4096 tiles — a flat priority queue via indexed bucket works.
    // We'll use a simple binary-heap.
    interface HeapNode { idx: number; d: number; }
    const heap: HeapNode[] = [];
    const pushHeap = (node: HeapNode): void => {
      heap.push(node);
      let i = heap.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (heap[p]!.d <= heap[i]!.d) break;
        const tmp = heap[p]!;
        heap[p] = heap[i]!;
        heap[i] = tmp;
        i = p;
      }
    };
    const popHeap = (): HeapNode | undefined => {
      if (heap.length === 0) return undefined;
      const top = heap[0]!;
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1;
          const r = l + 1;
          let min = i;
          if (l < heap.length && heap[l]!.d < heap[min]!.d) min = l;
          if (r < heap.length && heap[r]!.d < heap[min]!.d) min = r;
          if (min === i) break;
          const tmp = heap[min]!;
          heap[min] = heap[i]!;
          heap[i] = tmp;
          i = min;
        }
      }
      return top;
    };

    const goalIdx = goalTy * w + goalTx;
    dist[goalIdx] = 0;
    pushHeap({ idx: goalIdx, d: 0 });

    // Neighbor offsets: 4 ortho, 4 diag
    const NX = [ 1, -1,  0,  0,  1, -1,  1, -1];
    const NY = [ 0,  0,  1, -1,  1,  1, -1, -1];
    const NC = [10, 10, 10, 10, 14, 14, 14, 14];

    while (heap.length > 0) {
      const top = popHeap();
      if (!top) break;
      if (top.d > dist[top.idx]!) continue;
      const tx = top.idx % w;
      const ty = (top.idx - tx) / w;
      for (let k = 0; k < 8; k++) {
        const nx = tx + NX[k]!;
        const ny = ty + NY[k]!;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nIdx = ny * w + nx;
        if (grid.cost[nIdx] === IMPASSABLE) continue;
        // Corner-cutting guard: forbid diagonal if either ortho neighbor is blocked.
        if (k >= 4) {
          const a = grid.cost[ty * w + nx];
          const b = grid.cost[ny * w + tx];
          if (a === IMPASSABLE || b === IMPASSABLE) continue;
        }
        const nd = top.d + NC[k]!;
        if (nd >= UNREACHABLE) continue;
        if (nd < dist[nIdx]!) {
          dist[nIdx] = nd;
          // Flow direction points from neighbor back towards current (so units step that way).
          dirX[nIdx] = -NX[k]! as -1 | 0 | 1;
          dirY[nIdx] = -NY[k]! as -1 | 0 | 1;
          pushHeap({ idx: nIdx, d: nd });
        }
      }
    }
  }

  // Returns a unit vector in world-space towards the goal from tile (tx,ty).
  // If no flow data, returns a direct vector towards the goal world position.
  sample(tx: number, ty: number): [number, number] {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return [0, 0];
    const i = ty * this.w + tx;
    const dx = this.dirX[i]!;
    const dy = this.dirY[i]!;
    if (dx === 0 && dy === 0) return [0, 0];
    const len = Math.hypot(dx, dy);
    return [dx / len, dy / len];
  }

  isReachable(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return false;
    return this.dist[ty * this.w + tx]! !== UNREACHABLE;
  }
}
