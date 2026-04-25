import type { VfxPreset } from '@vfx/types';

export const VFX_PRESETS: readonly VfxPreset[] = [
  {
    id: 'weapon_beam_line',
    durationMs: 150,
    budgetClass: 'cheap',
    layers: [
      { type: 'beam', width: 0.45, lifeMs: 150 },
    ],
  },
  {
    id: 'weapon_beam_electric',
    durationMs: 180,
    budgetClass: 'cheap',
    layers: [
      { type: 'beam', width: 0.25, lifeMs: 180, electric: true },
    ],
  },
  {
    id: 'weapon_cone_burst',
    durationMs: 180,
    budgetClass: 'cheap',
    layers: [
      { type: 'cone', radius: 5, angleDeg: 50, lifeMs: 180, opacity: 0.24 },
    ],
  },
  {
    id: 'ambush_reveal',
    durationMs: 320,
    budgetClass: 'normal',
    layers: [
      { type: 'shockwave', color: 0xffb15e, radius: 4.5, lifeMs: 320 },
      { type: 'decal', texture: 'scorch', color: 0xff9a4a, radius: 2.5, opacity: 0.22, lifeMs: 9000, randomRotation: true },
    ],
  },
  {
    id: 'impact_spark',
    durationMs: 520,
    budgetClass: 'cheap',
    layers: [
      { type: 'sprite', texture: 'spark', size: 1.1, lifeMs: 220, opacity: 0.9, grow: 0.75, randomRotation: true },
      { type: 'shockwave', radius: 0.85, lifeMs: 220 },
      { type: 'decal', texture: 'scorch', radius: 0.8, opacity: 0.22, lifeMs: 16000, randomRotation: true },
    ],
  },
  {
    id: 'impact_shell',
    durationMs: 1100,
    budgetClass: 'normal',
    layers: [
      { type: 'sprite', texture: 'flame', size: 2.7, lifeMs: 260, opacity: 0.9, grow: 0.85, randomRotation: true },
      { type: 'sprite', texture: 'smoke', color: 0x77736b, size: 2.1, lifeMs: 900, opacity: 0.46, grow: 1.4, randomRotation: true, y: 1.1 },
      { type: 'shockwave', radius: 2.4, lifeMs: 260 },
      { type: 'decal', texture: 'crater', color: 0x5b4a3a, radius: 1.55, opacity: 0.48, lifeMs: 45000, randomRotation: true },
    ],
  },
  {
    id: 'impact_rocket',
    durationMs: 1300,
    budgetClass: 'normal',
    layers: [
      { type: 'sprite', texture: 'flame', size: 3.4, lifeMs: 300, opacity: 0.95, grow: 0.95, randomRotation: true },
      { type: 'sprite', texture: 'smoke', color: 0x5f5a52, size: 2.6, lifeMs: 1100, opacity: 0.55, grow: 1.7, randomRotation: true, y: 1.15 },
      { type: 'shockwave', radius: 2.9, lifeMs: 300 },
      { type: 'decal', texture: 'crater', color: 0x4e3b2e, radius: 2.0, opacity: 0.55, lifeMs: 60000, randomRotation: true },
    ],
  },
  {
    id: 'impact_plasma',
    durationMs: 900,
    budgetClass: 'normal',
    layers: [
      { type: 'sprite', texture: 'magic', color: 0x7cefff, size: 2.1, lifeMs: 280, opacity: 0.9, grow: 1.0, randomRotation: true },
      { type: 'shockwave', color: 0x7cefff, radius: 2.1, lifeMs: 320 },
      { type: 'decal', texture: 'scorch', color: 0x66d8ff, radius: 1.4, opacity: 0.32, lifeMs: 30000, randomRotation: true },
    ],
  },
  {
    id: 'unit_death_small',
    durationMs: 950,
    budgetClass: 'normal',
    layers: [
      { type: 'sprite', texture: 'spark', color: 0xffe0aa, size: 1.8, lifeMs: 220, opacity: 0.9, grow: 0.7, randomRotation: true },
      { type: 'sprite', texture: 'smoke', color: 0x5d5d5d, size: 1.5, lifeMs: 820, opacity: 0.42, grow: 1.6, randomRotation: true },
      { type: 'decal', texture: 'scorch', color: 0x443a34, radius: 1.0, opacity: 0.32, lifeMs: 30000, randomRotation: true },
    ],
  },
  {
    id: 'building_death_large',
    durationMs: 1500,
    budgetClass: 'expensive',
    layers: [
      { type: 'sprite', texture: 'flame', color: 0xff9a3f, size: 5.2, lifeMs: 360, opacity: 0.95, grow: 1.0, randomRotation: true, y: 2.2 },
      { type: 'sprite', texture: 'smoke', color: 0x55514c, size: 4.2, lifeMs: 1400, opacity: 0.58, grow: 1.7, randomRotation: true, y: 2.6 },
      { type: 'shockwave', color: 0xffa45e, radius: 5.0, lifeMs: 420 },
      { type: 'decal', texture: 'crater', color: 0x3d332d, radius: 3.6, opacity: 0.62, lifeMs: 90000, randomRotation: true },
    ],
  },
  {
    id: 'damage_smoke_loop',
    durationMs: 1200,
    budgetClass: 'cheap',
    loop: true,
    layers: [
      { type: 'sprite', texture: 'smoke', color: 0x6a6a66, size: 1.25, lifeMs: 1200, opacity: 0.32, grow: 0.9, randomRotation: true, y: 2.8 },
    ],
  },
  {
    id: 'damage_fire_loop',
    durationMs: 900,
    budgetClass: 'normal',
    loop: true,
    layers: [
      { type: 'sprite', texture: 'flame', color: 0xff8a36, size: 1.05, lifeMs: 900, opacity: 0.52, grow: 0.6, randomRotation: true, y: 2.4 },
      { type: 'sprite', texture: 'smoke', color: 0x4d4d4d, size: 1.45, lifeMs: 1300, opacity: 0.28, grow: 0.9, randomRotation: true, y: 3.0 },
    ],
  },
];
