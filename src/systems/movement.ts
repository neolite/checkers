import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import type { Unit } from '@entities/types';
import { MAP, WORLD } from '@config/gameplay';
import { clamp, normalize, dist } from '@utils/math';

// Flow-field pathfinder + soft separation. The three-stage pipeline inside
// a single system: 1) steer toward dest (via flow field when available),
// 2) integrate velocity, 3) apply pairwise separation so crowds don't stack.
export class MovementSystem implements ISystem {
  readonly name = 'movement';

  init(_w: World): void { /* noop */ }

  update(w: World, dtMs: number): void {
    const dt = dtMs / 1000;

    // Step 1: steering — produce desired velocity vectors.
    w.units.forEachAlive((u) => {
      if (u.destX === null || u.destY === null) {
        // Damp existing velocity so units don't drift forever.
        u.vx *= 0.65;
        u.vy *= 0.65;
        if (Math.abs(u.vx) < 0.01) u.vx = 0;
        if (Math.abs(u.vy) < 0.01) u.vy = 0;
        return;
      }
      const goalTx = Math.floor(u.destX / MAP.tileSize);
      const goalTy = Math.floor(u.destY / MAP.tileSize);
      let desiredX = 0;
      let desiredY = 0;
      // Short-range: if we're already close, steer directly.
      const d = dist(u.x, u.y, u.destX, u.destY);
      if (d < MAP.tileSize * 1.5) {
        const [nx, ny] = normalize(u.destX - u.x, u.destY - u.y);
        desiredX = nx; desiredY = ny;
      } else {
        // Use flow field from this goal tile. Cached in world.
        const field = w.getFlowField(goalTx, goalTy, w.tNow);
        const [tx, ty] = w.navGrid.worldToTile(u.x, u.y);
        const [fx, fy] = field.sample(tx, ty);
        if (fx === 0 && fy === 0) {
          // No flow data at this tile — fallback to direct steering.
          const [nx, ny] = normalize(u.destX - u.x, u.destY - u.y);
          desiredX = nx; desiredY = ny;
        } else {
          desiredX = fx; desiredY = fy;
        }
      }
      // Set velocity (instantly — no acceleration smoothing for this prototype).
      const speed = u.stats.speed;
      u.vx = desiredX * speed;
      u.vy = desiredY * speed;
      u.rotation = Math.atan2(u.vy, u.vx);
    });

    // Step 2: integrate.
    w.units.forEachAlive((u) => {
      if (u.vx !== 0 || u.vy !== 0) {
        u.x += u.vx * dt;
        u.y += u.vy * dt;
        // World bounds.
        u.x = clamp(u.x, 0.5, WORLD.width - 0.5);
        u.y = clamp(u.y, 0.5, WORLD.depth - 0.5);
      }
    });

    // Step 3: soft separation (O(N²) over alive units; capped by pool).
    // We use a pairwise push so overlapping units spread apart.
    const alive: Unit[] = [];
    w.units.forEachAlive((u) => alive.push(u));
    for (let i = 0; i < alive.length; i++) {
      const a = alive[i]!;
      for (let j = i + 1; j < alive.length; j++) {
        const b = alive[j]!;
        const minDist = a.stats.radius + b.stats.radius;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 === 0) {
          // Tiny jitter so we don't divide by zero in the normalize below.
          dx = (Math.random() - 0.5) * 0.02;
          dy = (Math.random() - 0.5) * 0.02;
        } else if (dist2 > minDist * minDist) {
          continue;
        }
        const d = Math.sqrt(dist2) || 1e-4;
        const push = (minDist - d) * 0.5;
        const pushX = (dx / d) * push;
        const pushY = (dy / d) * push;
        a.x += pushX; a.y += pushY;
        b.x -= pushX; b.y -= pushY;
      }
    }

    // Also push units out of building footprints if they stepped inside.
    w.buildings.forEachAlive((b) => {
      for (const u of alive) {
        if (u.hp <= 0) continue;
        const dx = u.x - b.x;
        const dy = u.y - b.y;
        const d2 = dx * dx + dy * dy;
        const minDist = b.stats.radius + u.stats.radius + 0.15;
        if (d2 >= minDist * minDist) continue;
        const d = Math.sqrt(d2) || 1e-4;
        const push = (minDist - d);
        u.x += (dx / d) * push;
        u.y += (dy / d) * push;
      }
    });
  }
}
