import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import type { Unit, Building } from '@entities/types';
import type { AbilityName } from '@config/gameplay';
import { TAU, clamp, dist2, normalize } from '@utils/math';
import { MAP, WORLD } from '@config/gameplay';
import { applyDamage } from '@systems/combat';

const POUNCE_COOLDOWN_MS = 6000;
const POUNCE_RANGE = 8;
const POUNCE_DISTANCE = 5.5;
const DETONATE_RADIUS_FALLBACK = 1.5;

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
    }
  }

  private pounceSelected(w: World): void {
    for (const id of w.selectedUnits) {
      const u = w.units.findById(id);
      if (!u || u.faction !== w.playerFaction) continue;
      if (u.kind !== 'raider') continue;
      if (u.pounceCooldownMs > 0) continue;
      const target = findPounceTarget(w, u);
      if (!target) continue;

      const [nx, ny] = normalize(target.x - u.x, target.y - u.y);
      const d = Math.hypot(target.x - u.x, target.y - u.y);
      const stopShort = target.radius + u.stats.radius + 0.2;
      const leap = Math.max(0, Math.min(POUNCE_DISTANCE, d - stopShort));
      if (leap <= 0.1) continue;

      u.x = clamp(u.x + nx * leap, 0.5, WORLD.width - 0.5);
      u.y = clamp(u.y + ny * leap, 0.5, WORLD.depth - 0.5);
      u.rotation = Math.atan2(ny, nx);
      u.vx = 0; u.vy = 0;
      u.state = 'attack';
      u.destX = target.x; u.destY = target.y;
      u.targetId = target.id;
      u.targetIsBuilding = target.isBuilding;
      u.targetLocked = false;
      u.holdPosition = false;
      u.pounceCooldownMs = POUNCE_COOLDOWN_MS;
    }
  }

  private detonateSelected(w: World): void {
    for (const id of [...w.selectedUnits]) {
      const u = w.units.findById(id);
      if (!u || u.faction !== w.playerFaction) continue;
      if (u.kind !== 'swarmlet') continue;
      const weapon = u.stats.weapon;
      if (!weapon) continue;
      const radius = weapon.splash ?? DETONATE_RADIUS_FALLBACK;
      w.bus.emit('weapon:fired', { attackerId: u.id, attackerIsBuilding: false, targetId: u.id });
      w.bus.emit('projectile:impact', { x: u.x, y: u.y, targetId: u.id, damage: weapon.damage, klass: weapon.klass });
      applyRadialDamage(w, u, weapon.damage, weapon.klass, radius);
      u.hp = 0;
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

function findPounceTarget(w: World, u: Unit): { id: number; x: number; y: number; radius: number; isBuilding: boolean } | null {
  if (u.targetId !== null) {
    if (u.targetIsBuilding) {
      const b = w.buildings.findById(u.targetId);
      if (b && w.areHostile(b.faction, u.faction)) return { id: b.id, x: b.x, y: b.y, radius: b.stats.radius, isBuilding: true };
    } else {
      const t = w.units.findById(u.targetId);
      if (t && w.areHostile(t.faction, u.faction)) return { id: t.id, x: t.x, y: t.y, radius: t.stats.radius, isBuilding: false };
    }
  }

  let bestUnit: Unit | null = null;
  let bestD = POUNCE_RANGE * POUNCE_RANGE;
  w.units.forEachAlive((o) => {
    if (!w.areHostile(o.faction, u.faction)) return;
    const d = dist2(u.x, u.y, o.x, o.y);
    if (d < bestD) { bestUnit = o; bestD = d; }
  });
  if (bestUnit) {
    const t = bestUnit as Unit;
    return { id: t.id, x: t.x, y: t.y, radius: t.stats.radius, isBuilding: false };
  }

  let bestBuilding: Building | null = null;
  w.buildings.forEachAlive((b) => {
    if (!b.completed) return;
    if (!w.areHostile(b.faction, u.faction)) return;
    const d = dist2(u.x, u.y, b.x, b.y);
    if (d < bestD) { bestBuilding = b; bestD = d; }
  });
  if (!bestBuilding) return null;
  const b = bestBuilding as Building;
  return { id: b.id, x: b.x, y: b.y, radius: b.stats.radius, isBuilding: true };
}

function applyRadialDamage(
  w: World,
  source: Unit,
  rawDamage: number,
  klass: 'aInfantry' | 'aArmor' | 'aStructure',
  radius: number,
): void {
  w.units.forEachAlive((u) => {
    if (!w.areHostile(u.faction, source.faction)) return;
    const r = radius + u.stats.radius;
    if (dist2(source.x, source.y, u.x, u.y) <= r * r) {
      applyDamage(w, u.id, false, rawDamage, klass, u.x, u.y);
    }
  });
  w.buildings.forEachAlive((b) => {
    if (!b.completed) return;
    if (!w.areHostile(b.faction, source.faction)) return;
    const r = radius + b.stats.radius;
    if (dist2(source.x, source.y, b.x, b.y) <= r * r) {
      applyDamage(w, b.id, true, rawDamage, klass, b.x, b.y);
    }
  });
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
