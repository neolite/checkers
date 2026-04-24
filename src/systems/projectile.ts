import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import { applyDamage, applySplashDamage } from '@systems/combat';

export class ProjectileSystem implements ISystem {
  readonly name = 'projectile';

  init(_w: World): void { /* noop */ }

  update(w: World, dtMs: number): void {
    const dt = dtMs / 1000;
    const alive = w.projectiles;
    alive.forEachAlive((p) => {
      if (p.vx === 0 && p.vy === 0 && p.vz === 0) {
        // Stationary — detonate on spawn.
        detonate(w, p, p.x, p.y);
        return;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.ttlMs -= dtMs;
      if (p.ttlMs <= 0) { alive.release(p); return; }

      // Target chase: re-check distance each tick.
      let targetX = 0, targetY = 0, targetRadius = 0, dead = false;
      if (p.targetIsBuilding) {
        const b = w.buildings.findById(p.targetId);
        if (!b) dead = true;
        else { targetX = b.x; targetY = b.y; targetRadius = b.stats.radius; }
      } else {
        const t = w.units.findById(p.targetId);
        if (!t) dead = true;
        else { targetX = t.x; targetY = t.y; targetRadius = t.stats.radius; }
      }
      if (dead) {
        // Lose target — just let the projectile expire.
        return;
      }
      const dx = targetX - p.x;
      const dy = targetY - p.y;
      const hitRadius = targetRadius + 0.35;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        detonate(w, p, p.x, p.y);
      }
    });
  }
}

function detonate(w: World, p: import('@entities/types').Projectile, x: number, y: number): void {
  w.bus.emit('projectile:impact', { x, y, targetId: p.targetId, damage: p.damage });
  applyDamage(w, p.targetId, p.targetIsBuilding, p.damage, p.klass, x, y);
  if (p.splash > 0) {
    applySplashDamage(w, p.ownerFaction, p.targetId, p.targetIsBuilding, p.damage, p.klass, p.splash, x, y);
  }
  w.projectiles.release(p);
}
