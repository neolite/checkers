import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import type { Projectile } from '@entities/types';
import { applyDamage, applySplashDamage, findBounceTarget, getTargetInfo, retargetProjectile } from '@systems/combat';

export class ProjectileSystem implements ISystem {
  readonly name = 'projectile';

  init(_w: World): void { /* noop */ }

  update(w: World, dtMs: number): void {
    const dt = dtMs / 1000;
    const alive = w.projectiles;
    alive.forEachAlive((p) => {
      p.ageMs += dtMs;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      if (p.behavior === 'arc') {
        const t = Math.max(0, Math.min(1, p.ageMs / Math.max(1, p.lifeMs)));
        p.z = 1.1 + Math.sin(t * Math.PI) * p.arcHeight;
      } else if (p.behavior === 'rocket') {
        p.z = 1.3 + Math.sin(p.ageMs / 80) * 0.06;
      } else {
        p.z += p.vz * dt;
      }

      p.ttlMs -= dtMs;
      if (p.ttlMs <= 0) { alive.release(p); return; }

      if (p.behavior === 'arc') {
        if (p.ageMs >= p.lifeMs || distance2(p.x, p.y, p.targetX, p.targetY) <= 0.45 * 0.45) {
          detonate(w, p, p.targetX, p.targetY);
        }
        return;
      }

      const target = getTargetInfo(w, p.targetId, p.targetIsBuilding);
      if (!target) return;
      p.targetX = target.x;
      p.targetY = target.y;
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const hitRadius = target.radius + (p.behavior === 'rocket' ? 0.5 : 0.35);
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        detonate(w, p, p.x, p.y);
      }
    });
  }
}

function detonate(w: World, p: Projectile, x: number, y: number): void {
  w.bus.emit('projectile:impact', { x, y, targetId: p.targetId, damage: p.damage, klass: p.klass, behavior: p.behavior });
  applyDamage(w, p.targetId, p.targetIsBuilding, p.damage, p.klass, x, y);
  if (p.splash > 0) {
    applySplashDamage(w, p.ownerFaction, p.targetId, p.targetIsBuilding, p.damage, p.klass, p.splash, x, y);
  }

  if (p.behavior === 'bounce' && p.bounceLeft > 0) {
    const next = findBounceTarget(w, p.ownerFaction, x, y, p.width || 5, p.targetId, p.targetIsBuilding);
    if (next) {
      p.bounceLeft -= 1;
      p.damage *= 0.72;
      retargetProjectile(p, next, Math.max(8, Math.hypot(p.vx, p.vy) * 1.08));
      w.bus.emit('weapon:effect', {
        behavior: 'bounce',
        faction: p.ownerFaction,
        x,
        y,
        tx: next.x,
        ty: next.y,
        width: p.width || 5,
      });
      return;
    }
  }
  w.projectiles.release(p);
}

function distance2(x1: number, y1: number, x2: number, y2: number): number {
  return (x1 - x2) ** 2 + (y1 - y2) ** 2;
}
