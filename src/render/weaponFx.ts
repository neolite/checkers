import * as THREE from 'three';
import type { World } from '@engine/world';
import { FACTION_COLORS } from '@config/palette';
import { sampleFog } from '@render/fogOverlay';
import { VfxManager } from '@vfx/VfxManager';
import type { VfxAttachmentTarget } from '@vfx/types';

export interface WeaponFxHandle {
  tick(dtMs: number): void;
  destroy(): void;
}

export function mountWeaponFx(world: World, scene: THREE.Scene): WeaponFxHandle {
  const vfx = new VfxManager(scene, world.three.camera, (target) => resolveAttachment(world, target));
  const offs = [
    world.bus.on('weapon:effect', (ev) => {
      if (!canSeePoint(world, ev.x, ev.y) && !canSeePoint(world, ev.tx, ev.ty)) return;
      const color = FACTION_COLORS[ev.faction].accent;
      if (ev.behavior === 'line') {
        vfx.play('weapon_beam_line', { x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, color, width: ev.width ?? 0.45 });
      } else if (ev.behavior === 'cone') {
        vfx.play('weapon_cone_burst', { x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, color, radius: ev.radius ?? 5, angleDeg: ev.angleDeg ?? 50 });
      } else if (ev.behavior === 'chain') {
        const pts = ev.points ?? [{ x: ev.x, y: ev.y }, { x: ev.tx, y: ev.ty }];
        for (let i = 0; i < pts.length - 1; i++) {
          vfx.play('weapon_beam_electric', { x: pts[i]!.x, y: pts[i]!.y, tx: pts[i + 1]!.x, ty: pts[i + 1]!.y, color: 0x7cefff, width: 0.25 });
        }
      } else if (ev.behavior === 'bounce') {
        vfx.play('weapon_beam_electric', { x: ev.x, y: ev.y, tx: ev.tx, ty: ev.ty, color, width: 0.18 });
      } else if (ev.behavior === 'ambush') {
        vfx.play('ambush_reveal', { x: ev.tx, y: ev.ty, color: 0xffb15e, radius: ev.radius ?? 4.5 });
      }
    }),
    world.bus.on('projectile:impact', (ev) => {
      if (!canSeePoint(world, ev.x, ev.y)) return;
      const radius = ev.behavior === 'arc' ? 2.6 : ev.behavior === 'rocket' ? 1.8 : ev.behavior === 'bounce' ? 1.0 : 0.7;
      const color = ev.behavior === 'chain' || ev.behavior === 'bounce'
        ? 0x7cefff
        : ev.klass === 'aStructure'
          ? 0xffa45e
          : ev.klass === 'aArmor'
            ? 0x8ec8ff
            : 0xfff0a0;
      const preset = ev.behavior === 'rocket'
        ? 'impact_rocket'
        : ev.behavior === 'arc' || ev.klass === 'aStructure'
          ? 'impact_shell'
          : ev.behavior === 'bounce' || ev.behavior === 'chain'
            ? 'impact_plasma'
            : 'impact_spark';
      vfx.play(preset, { x: ev.x, y: ev.y, color, radius });
    }),
    world.bus.on('unit:damaged', ({ id }) => {
      const u = world.units.findById(id);
      if (!u) return;
      const hpRatio = u.hp / u.stats.maxHp;
      const target = { id: u.id, isBuilding: false };
      const color = FACTION_COLORS[u.faction].accent;
      if (hpRatio < 0.6) vfx.ensureAttached(target, 'damage_smoke_loop', { x: u.x, y: u.y, color, radius: u.stats.radius });
      if (hpRatio < 0.3) vfx.ensureAttached(target, 'damage_fire_loop', { x: u.x, y: u.y, color, radius: u.stats.radius });
      if (hpRatio > 0.7) vfx.detach(target);
    }),
    world.bus.on('building:damaged', ({ id }) => {
      const b = world.buildings.findById(id);
      if (!b) return;
      const hpRatio = b.hp / b.stats.maxHp;
      const target = { id: b.id, isBuilding: true };
      const color = FACTION_COLORS[b.faction].accent;
      if (hpRatio < 0.6) vfx.ensureAttached(target, 'damage_smoke_loop', { x: b.x, y: b.y, color, radius: b.stats.radius });
      if (hpRatio < 0.3) vfx.ensureAttached(target, 'damage_fire_loop', { x: b.x, y: b.y, color, radius: b.stats.radius });
      if (hpRatio > 0.7) vfx.detach(target);
    }),
    world.bus.on('unit:died', ({ id, x, y, faction }) => {
      vfx.detach({ id, isBuilding: false });
      if (!canSeePoint(world, x, y)) return;
      vfx.play('unit_death_small', { x, y, color: FACTION_COLORS[faction].accent, radius: 1.2 });
    }),
    world.bus.on('building:destroyed', ({ id, x, y, faction }) => {
      vfx.detach({ id, isBuilding: true });
      if (!canSeePoint(world, x, y)) return;
      vfx.play('building_death_large', { x, y, color: FACTION_COLORS[faction].accent, radius: 3.4 });
    }),
  ];

  return {
    tick(dtMs: number): void {
      vfx.tick(dtMs);
    },
    destroy(): void {
      for (const off of offs) off();
      vfx.destroy();
    },
  };
}

function resolveAttachment(world: World, target: VfxAttachmentTarget): { x: number; y: number; z: number; visible: boolean } | null {
  if (target.isBuilding) {
    const b = world.buildings.findById(target.id);
    if (!b) return null;
    return { x: b.x, y: b.y, z: 4.6, visible: b.completed && canSeePoint(world, b.x, b.y) };
  }
  const u = world.units.findById(target.id);
  if (!u) return null;
  return { x: u.x, y: u.y, z: Math.max(1.2, u.stats.altitude + 1.8), visible: !u.burrowed && canSeePoint(world, u.x, u.y) };
}

function canSeePoint(world: World, x: number, y: number): boolean {
  return sampleFog(world.factions[world.playerFaction].fog, x, y) === 2;
}
