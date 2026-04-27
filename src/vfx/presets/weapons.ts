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
    id: 'tactical_nuke_marker',
    durationMs: 900,
    budgetClass: 'normal',
    layers: [
      { type: 'mesh', shape: 'disc', color: 0xff9a42, radius: 5.0, opacity: 0.20, grow: 1.18, lifeMs: 850, y: 0.05 },
      { type: 'mesh', shape: 'ring', color: 0xffe08a, radius: 4.2, opacity: 0.52, grow: 1.55, lifeMs: 760, y: 0.16 },
      { type: 'shockwave', color: 0xffe18a, radius: 8.5, lifeMs: 760, y: 0.12 },
      { type: 'shockwave', color: 0xff8a36, radius: 5.2, lifeMs: 520, y: 0.16 },
      { type: 'decal', texture: 'scorch', color: 0xffb35e, radius: 5.2, opacity: 0.24, lifeMs: 1300, randomRotation: true },
    ],
  },
  {
    id: 'tactical_nuke_strike',
    durationMs: 5200,
    budgetClass: 'expensive',
    layers: [
      { type: 'light', color: 0xfff1c9, intensity: 13.0, distance: 50, lifeMs: 420, y: 7.2 },
      { type: 'sprite', texture: 'spark', color: 0xffffff, size: 9.4, lifeMs: 120, opacity: 1.0, grow: 0.42, randomRotation: true, y: 5.2 },
      { type: 'mesh', shape: 'disc', color: 0xffcc7a, radius: 7.8, opacity: 0.54, grow: 1.5, lifeMs: 760, material: 'fire', y: 0.06 },
      { type: 'mesh', shape: 'ring', color: 0xffffff, radius: 3.0, opacity: 0.86, grow: 2.55, lifeMs: 340, y: 0.2 },
      { type: 'mesh', shape: 'ring', color: 0xff8a3a, radius: 8.0, opacity: 0.46, grow: 1.82, lifeMs: 1020, y: 0.22 },
      { type: 'shockwave', color: 0xffe0a2, radius: 10.8, lifeMs: 760, y: 0.16 },
      { type: 'shockwave', color: 0xff6e35, radius: 6.6, lifeMs: 430, y: 0.2 },
      { type: 'shockwave', color: 0xffffff, radius: 3.2, lifeMs: 190, y: 0.26 },
      { type: 'mesh', shape: 'column', color: 0xffc170, radius: 1.75, height: 25, opacity: 0.40, grow: 1.18, lifeMs: 1250, delayMs: 80, rise: 1.8, material: 'fire', y: 0.2 },
      { type: 'sprite', texture: 'flame', color: 0xff8f36, size: 10.0, lifeMs: 640, delayMs: 80, opacity: 0.9, grow: 1.25, randomRotation: true, rise: 1.4, y: 3.2 },
      { type: 'mesh', shape: 'dome', color: 0xfff0ba, radius: 6.4, opacity: 0.34, grow: 1.20, lifeMs: 720, delayMs: 120, material: 'fire', y: 1.15 },
      { type: 'mesh', shape: 'cap', color: 0xff8a42, radius: 6.0, opacity: 0.24, grow: 1.14, lifeMs: 1350, delayMs: 220, rise: 3.8, material: 'fire', y: 8.2 },
      { type: 'mesh', shape: 'cap', color: 0x2a1511, radius: 9.0, opacity: 0.94, grow: 1.30, lifeMs: 5000, delayMs: 360, rise: 7.0, blending: 'normal', material: 'smoke', y: 8.2 },
      { type: 'mesh', shape: 'dome', color: 0x21110f, radius: 4.2, opacity: 0.86, grow: 1.14, lifeMs: 4700, delayMs: 420, rise: 8.2, blending: 'normal', material: 'smoke', y: 5.5 },
      { type: 'mesh', shape: 'dome', color: 0x261410, radius: 4.0, opacity: 0.78, grow: 1.28, lifeMs: 4500, delayMs: 520, offsetX: -3.0, offsetZ: 1.5, rise: 6.4, blending: 'normal', material: 'smoke', y: 8.9 },
      { type: 'mesh', shape: 'dome', color: 0x2c1712, radius: 3.8, opacity: 0.76, grow: 1.30, lifeMs: 4400, delayMs: 560, offsetX: 3.1, offsetZ: -1.2, rise: 6.0, blending: 'normal', material: 'smoke', y: 9.2 },
      { type: 'mesh', shape: 'dome', color: 0x171211, radius: 3.4, opacity: 0.72, grow: 1.28, lifeMs: 4300, delayMs: 620, offsetX: 0.4, offsetZ: -3.2, rise: 5.6, blending: 'normal', material: 'smoke', y: 9.6 },
      { type: 'sprite', texture: 'smoke', color: 0x5d5750, size: 9.2, lifeMs: 4000, delayMs: 420, opacity: 0.52, grow: 2.1, randomRotation: true, rise: 6.0, y: 5.2 },
      { type: 'sprite', texture: 'smoke', color: 0x34302c, size: 7.8, lifeMs: 4300, delayMs: 520, opacity: 0.38, grow: 2.65, randomRotation: true, rise: 7.8, y: 8.5 },
      { type: 'sprite', texture: 'smoke', color: 0x4d4741, size: 5.8, lifeMs: 3900, delayMs: 700, opacity: 0.30, grow: 2.35, randomRotation: true, offsetX: -4.0, offsetZ: 1.4, rise: 4.8, y: 9.4 },
      { type: 'sprite', texture: 'smoke', color: 0x554a42, size: 5.6, lifeMs: 3800, delayMs: 740, opacity: 0.30, grow: 2.35, randomRotation: true, offsetX: 3.7, offsetZ: -1.8, rise: 4.6, y: 9.8 },
      { type: 'decal', texture: 'crater', color: 0x241b18, radius: 5.8, opacity: 0.78, lifeMs: 90000, randomRotation: true },
      { type: 'decal', texture: 'scorch', color: 0xff7a30, radius: 9.5, opacity: 0.30, lifeMs: 45000, randomRotation: true },
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
