import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import type { Unit, Building, Projectile } from '@entities/types';
import type { Weapon } from '@game/rts/content/units';
import type { FactionId } from '@config/palette';
import type { WeaponBehavior, WeaponClass } from '@config/gameplay';
import { dist, dist2 } from '@utils/math';
import { damageMultiplier } from '@game/rts/content/matrix';

interface TargetInfo {
  id: number;
  isBuilding: boolean;
  x: number;
  y: number;
  radius: number;
  hp: number;
  faction: FactionId;
}

interface AreaHit {
  id: number;
  isBuilding: boolean;
  x: number;
  y: number;
  radius: number;
  t: number;
}

// Handles weapon cooldowns, LoS checks, projectile spawning and instant weapon geometry.
export class CombatSystem implements ISystem {
  readonly name = 'combat';

  init(_w: World): void { /* noop */ }

  update(w: World, dtMs: number): void {
    w.units.forEachAlive((u) => {
      if (u.cooldownMs > 0) u.cooldownMs -= dtMs;
      if (u.burrowed) return;
      if (!u.stats.weapon) return;
      if (u.targetId === null) return;
      if (u.cooldownMs > 0) return;

      const target = getTargetInfo(w, u.targetId, u.targetIsBuilding);
      if (!target || target.hp <= 0) return;
      if (!w.areHostile(target.faction, u.faction)) return;
      const d = dist(u.x, u.y, target.x, target.y);
      const edgeDistance = Math.max(0, d - target.radius - u.stats.radius);
      if (edgeDistance > u.stats.weapon.range + 0.2) return;

      fireWeapon(w, {
        ownerId: u.id,
        ownerFaction: u.faction,
        attackerIsBuilding: false,
        x: u.x,
        y: u.y,
        radius: u.stats.radius,
        weapon: u.stats.weapon,
        target,
      });
      u.cooldownMs = u.stats.weapon.cdMs;
      u.rotation = Math.atan2(target.y - u.y, target.x - u.x);
      if (u.stats.weapon.selfDestruct) u.hp = 0;
    });

    w.buildings.forEachAlive((b) => {
      if (!b.completed) return;
      if (!b.stats.weapon) return;
      if (b.cooldownMs > 0) b.cooldownMs -= dtMs;
      if (b.targetId !== null) {
        const t = w.units.findById(b.targetId);
        if (!t || t.hp <= 0 || t.burrowed) b.targetId = null;
      }
      if (b.targetId === null) {
        const t = pickNearestEnemyUnit(w, b, b.stats.weapon.range);
        if (t) { b.targetId = t.id; b.targetIsBuilding = false; }
      }
      if (b.targetId === null) return;
      if (b.cooldownMs > 0) return;
      const target = getTargetInfo(w, b.targetId, b.targetIsBuilding);
      if (!target) return;
      if (dist(b.x, b.y, target.x, target.y) > b.stats.weapon.range + target.radius) return;
      fireWeapon(w, {
        ownerId: b.id,
        ownerFaction: b.faction,
        attackerIsBuilding: true,
        x: b.x,
        y: b.y,
        radius: b.stats.radius,
        weapon: b.stats.weapon,
        target,
      });
      b.cooldownMs = b.stats.weapon.cdMs;
    });
  }
}

function fireWeapon(
  w: World,
  shot: {
    ownerId: number;
    ownerFaction: FactionId;
    attackerIsBuilding: boolean;
    x: number;
    y: number;
    radius: number;
    weapon: Weapon;
    target: TargetInfo;
  },
): void {
  const behavior = weaponBehavior(shot.weapon);
  w.bus.emit('weapon:fired', {
    attackerId: shot.ownerId,
    attackerIsBuilding: shot.attackerIsBuilding,
    targetId: shot.target.id,
    behavior,
  });

  if (behavior === 'contact') {
    directImpact(w, shot.ownerFaction, shot.target, shot.weapon, behavior, shot.target.x, shot.target.y);
    return;
  }
  if (behavior === 'line') {
    fireLine(w, shot.ownerFaction, shot.x, shot.y, shot.weapon, shot.target);
    return;
  }
  if (behavior === 'cone') {
    fireCone(w, shot.ownerFaction, shot.x, shot.y, shot.weapon, shot.target);
    return;
  }
  if (behavior === 'chain') {
    fireChain(w, shot.ownerFaction, shot.x, shot.y, shot.weapon, shot.target);
    return;
  }
  spawnProjectile(w, shot.ownerId, shot.ownerFaction, shot.attackerIsBuilding, shot.x, shot.y, shot.weapon, shot.target, behavior);
}

function spawnProjectile(
  w: World,
  ownerId: number,
  ownerFaction: FactionId,
  ownerIsBuilding: boolean,
  x: number,
  y: number,
  weapon: Weapon,
  target: TargetInfo,
  behavior: WeaponBehavior,
): void {
  const p = w.projectiles.acquire();
  if (!p) return;
  const dx = target.x - x;
  const dy = target.y - y;
  const len = Math.hypot(dx, dy) || 1;
  const speed = Math.max(1, weapon.projectileSpeed || 1);
  p.x = x; p.y = y; p.z = ownerIsBuilding ? 1.8 : 1.2;
  p.vx = (dx / len) * speed;
  p.vy = (dy / len) * speed;
  p.vz = 0;
  p.ownerId = ownerId;
  p.ownerFaction = ownerFaction;
  p.targetId = target.id;
  p.targetIsBuilding = target.isBuilding;
  p.damage = weapon.damage;
  p.klass = weapon.klass;
  p.behavior = behavior;
  p.splash = weapon.splash ?? 0;
  p.width = weapon.width ?? 0;
  p.bounceLeft = weapon.bounceCount ?? 0;
  p.arcHeight = weapon.arcHeight ?? (behavior === 'arc' ? 4 : 0);
  p.startX = x; p.startY = y;
  p.targetX = target.x; p.targetY = target.y;
  p.ageMs = 0;
  p.lifeMs = Math.max(180, (len / speed) * 1000);
  p.ttlMs = Math.max(1000, p.lifeMs + 500);
}

function directImpact(w: World, ownerFaction: FactionId, target: TargetInfo, weapon: Weapon, behavior: WeaponBehavior, x: number, y: number): void {
  w.bus.emit('projectile:impact', { x, y, targetId: target.id, damage: weapon.damage, klass: weapon.klass, behavior });
  applyDamage(w, target.id, target.isBuilding, weapon.damage, weapon.klass, x, y);
  if ((weapon.splash ?? 0) > 0) {
    applySplashDamage(w, ownerFaction, target.id, target.isBuilding, weapon.damage, weapon.klass, weapon.splash!, x, y);
  }
}

function fireLine(w: World, ownerFaction: FactionId, x: number, y: number, weapon: Weapon, target: TargetInfo): void {
  const dx = target.x - x;
  const dy = target.y - y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = dx / len;
  const ny = dy / len;
  const endX = x + nx * weapon.range;
  const endY = y + ny * weapon.range;
  const hits = collectSegmentHits(w, ownerFaction, x, y, endX, endY, weapon.width ?? 0.45)
    .slice(0, weapon.pierce ?? 4);
  hits.forEach((hit, index) => {
    applyDamage(w, hit.id, hit.isBuilding, weapon.damage * Math.pow(0.72, index), weapon.klass, hit.x, hit.y);
  });
  w.bus.emit('weapon:effect', { behavior: 'line', faction: ownerFaction, x, y, tx: endX, ty: endY, width: weapon.width ?? 0.45 });
}

function fireCone(w: World, ownerFaction: FactionId, x: number, y: number, weapon: Weapon, target: TargetInfo): void {
  const angle = Math.atan2(target.y - y, target.x - x);
  const half = ((weapon.coneAngleDeg ?? 45) * Math.PI / 180) / 2;
  const hits = collectAllHostiles(w, ownerFaction);
  for (const hit of hits) {
    const dx = hit.x - x;
    const dy = hit.y - y;
    const d = Math.hypot(dx, dy);
    if (d > weapon.range + hit.radius) continue;
    const a = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
    if (Math.abs(a) > half) continue;
    const primary = hit.id === target.id && hit.isBuilding === target.isBuilding;
    applyDamage(w, hit.id, hit.isBuilding, weapon.damage * (primary ? 1 : 0.68), weapon.klass, hit.x, hit.y);
  }
  w.bus.emit('weapon:effect', {
    behavior: 'cone',
    faction: ownerFaction,
    x,
    y,
    tx: x + Math.cos(angle) * weapon.range,
    ty: y + Math.sin(angle) * weapon.range,
    radius: weapon.range,
    angleDeg: weapon.coneAngleDeg ?? 45,
  });
}

function fireChain(w: World, ownerFaction: FactionId, x: number, y: number, weapon: Weapon, target: TargetInfo): void {
  const points = [{ x, y }];
  const hitKeys = new Set<string>();
  let current: TargetInfo | null = target;
  let raw = weapon.damage;
  const jumps = Math.max(1, (weapon.chainJumps ?? 3) + 1);
  for (let i = 0; i < jumps && current; i++) {
    hitKeys.add(targetKey(current));
    applyDamage(w, current.id, current.isBuilding, raw, weapon.klass, current.x, current.y);
    points.push({ x: current.x, y: current.y });
    raw *= 0.72;
    current = findNearestChainTarget(w, ownerFaction, current.x, current.y, weapon.chainRange ?? 5, hitKeys);
  }
  w.bus.emit('weapon:effect', { behavior: 'chain', faction: ownerFaction, x, y, tx: target.x, ty: target.y, points });
}

export function applySplashDamage(
  w: World,
  attackerFaction: FactionId,
  primaryTargetId: number,
  primaryTargetIsBuilding: boolean,
  rawDamage: number,
  klass: WeaponClass,
  splash: number,
  impactX: number,
  impactY: number,
): void {
  const rawPct = 0.6;
  const r2 = splash * splash;
  w.units.forEachAlive((u) => {
    if (!w.areHostile(u.faction, attackerFaction)) return;
    if (!primaryTargetIsBuilding && u.id === primaryTargetId) return;
    if (dist2(u.x, u.y, impactX, impactY) <= r2) {
      applyDamage(w, u.id, false, rawDamage * rawPct, klass, u.x, u.y);
    }
  });
  w.buildings.forEachAlive((b) => {
    if (!b.completed) return;
    if (!w.areHostile(b.faction, attackerFaction)) return;
    if (primaryTargetIsBuilding && b.id === primaryTargetId) return;
    if (dist2(b.x, b.y, impactX, impactY) <= (splash + b.stats.radius) ** 2) {
      applyDamage(w, b.id, true, rawDamage * rawPct, klass, b.x, b.y);
    }
  });
}

function pickNearestEnemyUnit(w: World, b: Building, range: number): Unit | null {
  let best: Unit | null = null;
  let bestD = range * range;
  w.units.forEachAlive((u) => {
    if (u.burrowed) return;
    if (!w.areHostile(u.faction, b.faction)) return;
    const d = dist2(u.x, u.y, b.x, b.y);
    if (d < bestD) { best = u; bestD = d; }
  });
  return best;
}

export function applyDamage(
  w: World,
  targetId: number,
  isBuilding: boolean,
  rawDamage: number,
  klass: WeaponClass,
  impactX: number,
  impactY: number,
): void {
  if (isBuilding) {
    const b = w.buildings.findById(targetId);
    if (!b) return;
    const mult = damageMultiplier(klass, b.stats.armor);
    const final = Math.max(0, Math.round(rawDamage * mult));
    b.hp -= final;
    w.bus.emit('building:damaged', { id: b.id, amount: final, x: impactX, y: impactY });
    if (b.hp <= 0) b.hp = 0;
  } else {
    const u = w.units.findById(targetId);
    if (!u) return;
    const mult = damageMultiplier(klass, u.stats.armor);
    const mitigation = u.burrowed ? 0.4 : 1;
    const final = Math.max(0, Math.round(rawDamage * mult * mitigation));
    u.hp -= final;
    w.bus.emit('unit:damaged', { id: u.id, amount: final, x: impactX, y: impactY });
    if (u.hp <= 0) u.hp = 0;
  }
}

export function getTargetInfo(w: World, id: number, isBuilding: boolean): TargetInfo | null {
  if (isBuilding) {
    const b = w.buildings.findById(id);
    if (!b) return null;
    return { id: b.id, isBuilding: true, x: b.x, y: b.y, radius: b.stats.radius, hp: b.hp, faction: b.faction };
  }
  const u = w.units.findById(id);
  if (!u || u.burrowed) return null;
  return { id: u.id, isBuilding: false, x: u.x, y: u.y, radius: u.stats.radius, hp: u.hp, faction: u.faction };
}

function weaponBehavior(weapon: Weapon): WeaponBehavior {
  if (weapon.behavior) return weapon.behavior;
  return weapon.projectileSpeed === 0 ? 'contact' : 'projectile';
}

function collectSegmentHits(w: World, ownerFaction: FactionId, x1: number, y1: number, x2: number, y2: number, width: number): AreaHit[] {
  return collectAllHostiles(w, ownerFaction)
    .map((hit) => ({ ...hit, t: segmentProjection(x1, y1, x2, y2, hit.x, hit.y) }))
    .filter((hit) => hit.t >= 0 && hit.t <= 1 && pointSegmentDistance(x1, y1, x2, y2, hit.x, hit.y) <= width + hit.radius)
    .sort((a, b) => a.t - b.t);
}

function collectAllHostiles(w: World, ownerFaction: FactionId): AreaHit[] {
  const out: AreaHit[] = [];
  w.units.forEachAlive((u) => {
    if (u.burrowed) return;
    if (!w.areHostile(u.faction, ownerFaction)) return;
    out.push({ id: u.id, isBuilding: false, x: u.x, y: u.y, radius: u.stats.radius, t: 0 });
  });
  w.buildings.forEachAlive((b) => {
    if (!b.completed) return;
    if (!w.areHostile(b.faction, ownerFaction)) return;
    out.push({ id: b.id, isBuilding: true, x: b.x, y: b.y, radius: b.stats.radius, t: 0 });
  });
  return out;
}

function findNearestChainTarget(w: World, ownerFaction: FactionId, x: number, y: number, range: number, hitKeys: Set<string>): TargetInfo | null {
  let best: TargetInfo | null = null;
  let bestD = range * range;
  for (const hit of collectAllHostiles(w, ownerFaction)) {
    const info = getTargetInfo(w, hit.id, hit.isBuilding);
    if (!info) continue;
    if (hitKeys.has(targetKey(info))) continue;
    const d = dist2(x, y, info.x, info.y);
    if (d < bestD) { best = info; bestD = d; }
  }
  return best;
}

function targetKey(t: TargetInfo): string {
  return `${t.isBuilding ? 'b' : 'u'}:${t.id}`;
}

function segmentProjection(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  return ((px - x1) * dx + (py - y1) * dy) / len2;
}

function pointSegmentDistance(x1: number, y1: number, x2: number, y2: number, px: number, py: number): number {
  const t = Math.max(0, Math.min(1, segmentProjection(x1, y1, x2, y2, px, py)));
  const sx = x1 + (x2 - x1) * t;
  const sy = y1 + (y2 - y1) * t;
  return Math.hypot(px - sx, py - sy);
}

export function retargetProjectile(p: Projectile, target: TargetInfo, speed: number): void {
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  p.vx = (dx / len) * speed;
  p.vy = (dy / len) * speed;
  p.targetId = target.id;
  p.targetIsBuilding = target.isBuilding;
  p.targetX = target.x;
  p.targetY = target.y;
  p.startX = p.x;
  p.startY = p.y;
  p.ageMs = 0;
  p.lifeMs = Math.max(180, (len / speed) * 1000);
  p.ttlMs = Math.max(1000, p.lifeMs + 500);
}

export function findBounceTarget(w: World, ownerFaction: FactionId, x: number, y: number, range: number, skipId: number, skipIsBuilding: boolean): TargetInfo | null {
  let best: TargetInfo | null = null;
  let bestD = range * range;
  for (const hit of collectAllHostiles(w, ownerFaction)) {
    if (hit.id === skipId && hit.isBuilding === skipIsBuilding) continue;
    const info = getTargetInfo(w, hit.id, hit.isBuilding);
    if (!info) continue;
    const d = dist2(x, y, info.x, info.y);
    if (d < bestD) { best = info; bestD = d; }
  }
  return best;
}
