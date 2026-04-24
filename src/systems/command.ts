import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import type { Unit } from '@entities/types';
import { TAU } from '@utils/math';
import { MAP } from '@config/gameplay';

// Translate input intents into unit state transitions.
export class CommandSystem implements ISystem {
  readonly name = 'command';

  init(w: World): void {
    w.bus.on('input:commandMove', ({ x, y, attackMove }) => {
      const units = this.selectedMovable(w);
      if (units.length === 0) return;
      const ringPoints = ringOffsets(x, y, units.length);
      for (let i = 0; i < units.length; i++) {
        const u = units[i]!;
        const [dx, dy] = ringPoints[i]!;
        u.state = attackMove ? 'attackMove' : 'move';
        u.destX = dx; u.destY = dy;
        u.targetLocked = false;
        u.targetId = null;
        u.targetIsBuilding = false;
        // Clear harvest assignment — the user overrides auto harvest.
        u.resourceNodeId = null;
        u.homeRefineryId = null;
        u.flowGoalTx = -1;
        u.flowGoalTy = -1;
        u.holdPosition = false;
      }
    });

    w.bus.on('input:commandAttack', ({ targetId }) => {
      const units = this.selectedMovable(w);
      if (units.length === 0) return;
      // Figure out target coords + isBuilding.
      const ub = w.units.findById(targetId);
      const bb = ub ? null : w.buildings.findById(targetId);
      if (!ub && !bb) return;
      const tx = ub ? ub.x : bb!.x;
      const ty = ub ? ub.y : bb!.y;
      const isBuilding = !ub;
      for (const u of units) {
        u.state = 'attack';
        u.destX = tx; u.destY = ty;
        u.targetLocked = true;
        u.targetId = targetId;
        u.targetIsBuilding = isBuilding;
        u.flowGoalTx = -1;
        u.flowGoalTy = -1;
        u.holdPosition = false;
      }
    });

    w.bus.on('input:commandStop', () => {
      const units = this.selectedMovable(w);
      for (const u of units) {
        u.state = 'idle';
        u.destX = null; u.destY = null;
        u.targetLocked = false;
        u.targetId = null;
        u.targetIsBuilding = false;
        u.vx = 0; u.vy = 0;
      }
    });

    // Hold Position: like stop, but refuse to move to chase targets. We tag with holdPos.
    w.bus.on('input:commandHold', () => {
      const units = this.selectedMovable(w);
      for (const u of units) {
        u.state = 'idle';
        u.destX = null; u.destY = null;
        u.vx = 0; u.vy = 0;
        u.targetLocked = false;
        u.holdPosition = true;
      }
    });

    // Harvest command (RMB on resource) — send selected workers to it.
    w.bus.on('input:commandHarvest', ({ resourceId }) => {
      const node = w.resources.findById(resourceId);
      if (!node) return;
      for (const id of w.selectedUnits) {
        const u = w.units.findById(id);
        if (!u || u.faction !== w.playerFaction) continue;
        if (!u.stats.harvest) continue;
        u.state = 'harvest';
        u.resourceNodeId = node.id;
        u.destX = node.x;
        u.destY = node.y;
        u.holdPosition = false;
      }
    });

    // Building rally-point (RMB on ground while only buildings are selected).
    w.bus.on('input:setRally', ({ x, y }) => {
      for (const id of w.selectedBuildings) {
        const b = w.buildings.findById(id);
        if (!b || b.faction !== w.playerFaction) continue;
        b.rallyX = x; b.rallyY = y;
      }
    });
  }

  update(_w: World, _dtMs: number): void {
    // Event-driven.
  }

  private selectedMovable(w: World): Unit[] {
    const out: Unit[] = [];
    for (const id of w.selectedUnits) {
      const u = w.units.findById(id);
      if (!u || u.faction !== w.playerFaction) continue;
      // Supervised builders are locked to their site — players can't redirect them mid-build.
      if (u.state === 'build') continue;
      // Swarm morph drones are already committed to becoming a building.
      if (u.pendingMorphKind !== null) continue;
      out.push(u);
    }
    return out;
  }
}

// Spread units on a ring around destination so they don't stack.
function ringOffsets(cx: number, cy: number, n: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  if (n === 0) return out;
  if (n === 1) { out.push([cx, cy]); return out; }
  const step = MAP.tileSize * 1.2;
  // Rings: first unit at center, then 8 around, then 16, etc.
  out.push([cx, cy]);
  let ring = 1;
  while (out.length < n) {
    const perimeter = 8 * ring;
    for (let i = 0; i < perimeter && out.length < n; i++) {
      const angle = (i / perimeter) * TAU;
      const r = ring * step;
      out.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r]);
    }
    ring += 1;
  }
  return out;
}
