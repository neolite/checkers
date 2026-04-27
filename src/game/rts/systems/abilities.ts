import type { World } from '@engine/world';
import type { Building, Unit } from '@entities/types';
import { WORLD } from '@config/gameplay';
import { applyDamage } from '@systems/combat';
import { clamp, dist2, normalize } from '@utils/math';

const POUNCE_RANGE = 8;
const POUNCE_DISTANCE = 5.5;
const POUNCE_COOLDOWN_MS = 6000;
const BURROW_AMBUSH_RANGE = 5.5;
const BURROW_AMBUSH_DAMAGE = 28;
const BURROW_AMBUSH_CLASS = 'aArmor' as const;
const DETONATE_RADIUS_FALLBACK = 1.5;

export function tryPounce(w: World, u: Unit): boolean {
  if (u.kind !== 'raider') return false;
  if (u.burrowed) return false;
  if (u.pounceCooldownMs > 0) return false;
  const target = findPounceTarget(w, u);
  if (!target) return false;

  const [nx, ny] = normalize(target.x - u.x, target.y - u.y);
  const d = Math.hypot(target.x - u.x, target.y - u.y);
  const stopShort = target.radius + u.stats.radius + 0.2;
  const leap = Math.max(0, Math.min(POUNCE_DISTANCE, d - stopShort));
  if (leap <= 0.1) return false;

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
  return true;
}

export function toggleBurrow(w: World, u: Unit): void {
  if (u.kind !== 'burrower') return;
  if (u.burrowed) {
    unburrow(u);
    return;
  }
  u.burrowed = true;
  u.ambushReady = true;
  u.state = 'idle';
  u.destX = null; u.destY = null;
  u.vx = 0; u.vy = 0;
  u.targetId = null;
  u.targetLocked = false;
  w.bus.emit('ui:notice', { text: 'Burrower hidden. It will ambush nearby enemies.', tone: 'info' });
}

export function unburrow(u: Unit): void {
  u.burrowed = false;
  u.ambushReady = false;
}

export function tickBurrowAmbush(w: World, u: Unit): void {
  if (!u.burrowed) return;
  const target = findNearestHostileUnit(w, u, BURROW_AMBUSH_RANGE);
  if (!target) {
    u.vx = 0; u.vy = 0;
    u.destX = null; u.destY = null;
    return;
  }
  unburrow(u);
  applyDamage(w, target.id, false, BURROW_AMBUSH_DAMAGE, BURROW_AMBUSH_CLASS, target.x, target.y);
  w.bus.emit('weapon:effect', {
    behavior: 'ambush',
    faction: u.faction,
    x: u.x,
    y: u.y,
    tx: target.x,
    ty: target.y,
    radius: BURROW_AMBUSH_RANGE,
  });
  u.state = 'attack';
  u.targetId = target.id;
  u.targetIsBuilding = false;
  u.targetLocked = false;
  u.destX = target.x;
  u.destY = target.y;
}

export function detonateUnit(w: World, u: Unit): void {
  if (u.kind !== 'swarmlet') return;
  const weapon = u.stats.weapon;
  if (!weapon) return;
  const radius = weapon.splash ?? DETONATE_RADIUS_FALLBACK;
  const behavior = weapon.behavior ?? (weapon.projectileSpeed === 0 ? 'contact' : 'projectile');
  w.bus.emit('weapon:fired', { attackerId: u.id, attackerIsBuilding: false, targetId: u.id, behavior });
  w.bus.emit('projectile:impact', { x: u.x, y: u.y, targetId: u.id, damage: weapon.damage, klass: weapon.klass, behavior });
  applyRadialDamage(w, u, weapon.damage, weapon.klass, radius);
  u.hp = 0;
}

function findPounceTarget(w: World, u: Unit): { id: number; x: number; y: number; radius: number; isBuilding: boolean } | null {
  if (u.targetId !== null) {
    if (u.targetIsBuilding) {
      const b = w.buildings.findById(u.targetId);
      if (b && w.areHostile(b.faction, u.faction)) return { id: b.id, x: b.x, y: b.y, radius: b.stats.radius, isBuilding: true };
    } else {
      const t = w.units.findById(u.targetId);
      if (t && !t.burrowed && w.areHostile(t.faction, u.faction)) return { id: t.id, x: t.x, y: t.y, radius: t.stats.radius, isBuilding: false };
    }
  }

  let bestUnit: Unit | null = null;
  let bestD = POUNCE_RANGE * POUNCE_RANGE;
  w.units.forEachAlive((o) => {
    if (o.burrowed) return;
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

function findNearestHostileUnit(w: World, u: Unit, range: number): Unit | null {
  let best: Unit | null = null;
  let bestD = range * range;
  w.units.forEachAlive((o) => {
    if (o.burrowed) return;
    if (!w.areHostile(o.faction, u.faction)) return;
    const d = dist2(u.x, u.y, o.x, o.y);
    if (d < bestD) { best = o; bestD = d; }
  });
  return best;
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
