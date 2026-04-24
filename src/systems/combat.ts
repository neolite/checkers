import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import type { Unit, Building, Projectile } from '@entities/types';
import { dist, dist2 } from '@utils/math';
import { damageMultiplier } from '@config/matrix';

// Handles weapon cooldowns, LoS checks, projectile spawning (via Projectile pool)
// and direct-damage (contact-fuse / hitscan proxy) application.
export class CombatSystem implements ISystem {
  readonly name = 'combat';

  init(_w: World): void { /* noop */ }

  update(w: World, dtMs: number): void {
    // Tick unit weapons.
    w.units.forEachAlive((u) => {
      if (u.cooldownMs > 0) u.cooldownMs -= dtMs;
      if (!u.stats.weapon) return;
      if (u.targetId === null) return;
      if (u.cooldownMs > 0) return;
      // Target data.
      let tx = 0, ty = 0, targetHp = 0, dead = false;
      if (u.targetIsBuilding) {
        const b = w.buildings.findById(u.targetId);
        if (!b) dead = true;
        else { tx = b.x; ty = b.y; targetHp = b.hp; }
      } else {
        const t = w.units.findById(u.targetId);
        if (!t) dead = true;
        else { tx = t.x; ty = t.y; targetHp = t.hp; }
      }
      if (dead || targetHp <= 0) return;
      // Range check.
      const d = dist(u.x, u.y, tx, ty);
      if (d > u.stats.weapon.range + 0.2) return;

      // Fire.
      u.cooldownMs = u.stats.weapon.cdMs;
      u.rotation = Math.atan2(ty - u.y, tx - u.x);
      w.bus.emit('weapon:fired', { attackerId: u.id, targetId: u.targetId });

      if (u.stats.weapon.projectileSpeed === 0) {
        // Contact-fuse (e.g. melee, suicide drone, burrower): apply damage directly and self-destruct if suicide.
        applyDamage(w, u.targetId, u.targetIsBuilding, u.stats.weapon.damage, u.stats.weapon.klass, u.x, u.y);
        // Swarmlets go kamikaze: die on impact.
        if (u.kind === 'swarmlet') {
          u.hp = 0;
        }
      } else {
        // Spawn projectile.
        const p = w.projectiles.acquire();
        if (!p) return;
        const dx = tx - u.x;
        const dy = ty - u.y;
        const dirLen = Math.hypot(dx, dy) || 1;
        p.x = u.x; p.y = u.y; p.z = 1.2;
        p.vx = (dx / dirLen) * u.stats.weapon.projectileSpeed;
        p.vy = (dy / dirLen) * u.stats.weapon.projectileSpeed;
        p.vz = 0;
        p.ownerId = u.id;
        p.targetId = u.targetId;
        p.targetIsBuilding = u.targetIsBuilding;
        p.damage = u.stats.weapon.damage;
        p.klass = u.stats.weapon.klass;
        p.splash = u.stats.weapon.splash ?? 0;
        p.ttlMs = 4000;
      }
    });

    // Tick building turrets.
    w.buildings.forEachAlive((b) => {
      if (!b.completed) return;
      if (!b.stats.weapon) return;
      if (b.cooldownMs > 0) b.cooldownMs -= dtMs;
      // Auto-target nearest enemy in range.
      if (b.targetId !== null) {
        const t = w.units.findById(b.targetId);
        if (!t || t.hp <= 0) { b.targetId = null; }
      }
      if (b.targetId === null) {
        const t = pickNearestEnemyUnit(w, b, b.stats.weapon.range);
        if (t) { b.targetId = t.id; b.targetIsBuilding = false; }
      }
      if (b.targetId === null) return;
      if (b.cooldownMs > 0) return;
      const t = w.units.findById(b.targetId);
      if (!t) return;
      const d = dist(b.x, b.y, t.x, t.y);
      if (d > b.stats.weapon.range) return;
      b.cooldownMs = b.stats.weapon.cdMs;
      w.bus.emit('weapon:fired', { attackerId: b.id, targetId: t.id });
      const p = w.projectiles.acquire();
      if (!p) return;
      const dx = t.x - b.x;
      const dy = t.y - b.y;
      const dirLen = Math.hypot(dx, dy) || 1;
      p.x = b.x; p.y = b.y; p.z = 1.8;
      p.vx = (dx / dirLen) * b.stats.weapon.projectileSpeed;
      p.vy = (dy / dirLen) * b.stats.weapon.projectileSpeed;
      p.vz = 0;
      p.ownerId = b.id;
      p.targetId = t.id;
      p.targetIsBuilding = false;
      p.damage = b.stats.weapon.damage;
      p.klass = b.stats.weapon.klass;
      p.splash = 0;
      p.ttlMs = 4000;
    });
  }
}

function pickNearestEnemyUnit(w: World, b: Building, range: number): Unit | null {
  let best: Unit | null = null;
  let bestD = range * range;
  w.units.forEachAlive((u) => {
    if (u.faction === b.faction) return;
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
  klass: 'aInfantry' | 'aArmor' | 'aStructure',
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
    if (b.hp <= 0) {
      b.hp = 0;
    }
  } else {
    const u = w.units.findById(targetId);
    if (!u) return;
    const mult = damageMultiplier(klass, u.stats.armor);
    const final = Math.max(0, Math.round(rawDamage * mult));
    u.hp -= final;
    w.bus.emit('unit:damaged', { id: u.id, amount: final, x: impactX, y: impactY });
    if (u.hp <= 0) u.hp = 0;
  }
}
