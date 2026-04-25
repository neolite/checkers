import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import type { Unit } from '@entities/types';
import type { AbilityName } from '@config/gameplay';
import { TAU } from '@utils/math';
import { MAP } from '@config/gameplay';
import { detonateUnit, toggleBurrow, tryPounce, unburrow } from '@systems/abilities';

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
        unburrow(u);
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

    w.bus.on('input:commandAttack', ({ targetId, targetIsBuilding }) => {
      const units = this.selectedMovable(w);
      if (units.length === 0) return;
      // Figure out target coords + isBuilding.
      const ub = targetIsBuilding ? null : w.units.findById(targetId);
      const bb = targetIsBuilding ? w.buildings.findById(targetId) : null;
      if (!ub && !bb) return;
      const tx = ub ? ub.x : bb!.x;
      const ty = ub ? ub.y : bb!.y;
      for (const u of units) {
        unburrow(u);
        u.state = 'attack';
        u.destX = tx; u.destY = ty;
        u.targetLocked = true;
        u.targetId = targetId;
        u.targetIsBuilding = targetIsBuilding;
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

    w.bus.on('input:ability', ({ ability }) => {
      this.useAbility(w, ability);
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

  update(w: World, dtMs: number): void {
    w.units.forEachAlive((u) => {
      if (u.pounceCooldownMs > 0) u.pounceCooldownMs = Math.max(0, u.pounceCooldownMs - dtMs);
    });
  }

  private useAbility(w: World, ability: AbilityName): void {
    if (ability === 'pounce') {
      this.pounceSelected(w);
    } else if (ability === 'detonate') {
      this.detonateSelected(w);
    } else if (ability === 'burrow') {
      this.burrowSelected(w);
    }
  }

  private pounceSelected(w: World): void {
    for (const id of w.selectedUnits) {
      const u = w.units.findById(id);
      if (!u || u.faction !== w.playerFaction) continue;
      tryPounce(w, u);
    }
  }

  private detonateSelected(w: World): void {
    for (const id of [...w.selectedUnits]) {
      const u = w.units.findById(id);
      if (!u || u.faction !== w.playerFaction) continue;
      detonateUnit(w, u);
    }
  }

  private burrowSelected(w: World): void {
    for (const id of w.selectedUnits) {
      const u = w.units.findById(id);
      if (!u || u.faction !== w.playerFaction) continue;
      toggleBurrow(w, u);
    }
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
