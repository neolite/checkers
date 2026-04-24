export type FactionId = 'vanguard' | 'swarm' | 'titan';
export const FACTION_IDS: readonly FactionId[] = ['vanguard', 'swarm', 'titan'] as const;

// Hex colors used both in three.js (via THREE.Color) and in CSS HUD.
export const FACTION_COLORS: Record<FactionId, { primary: number; accent: number; primaryCss: string; accentCss: string }> = {
  vanguard: { primary: 0x3d8bff, accent: 0x9ec8ff, primaryCss: '#3d8bff', accentCss: '#9ec8ff' },
  swarm: { primary: 0xff8a3d, accent: 0xffe08a, primaryCss: '#ff8a3d', accentCss: '#ffe08a' },
  titan: { primary: 0xa074ff, accent: 0xd7c2ff, primaryCss: '#a074ff', accentCss: '#d7c2ff' },
};

export const NEUTRAL_COLORS = {
  terrain: 0x3a4a38,
  terrainHi: 0x4a5b44,
  resource: 0x55e0c6,
  resourceRim: 0xd2fff2,
  enemy: 0xff4a4a,
  ally: 0x5effa0,
} as const;

export const PLAYER_COLOR = 0x5effa0;
export const ENEMY_COLOR = 0xff4a4a;
