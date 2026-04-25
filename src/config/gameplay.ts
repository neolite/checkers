// Pure data, no imports from src/*.

export const MAP = {
  tilesX: 64,
  tilesY: 64,
  tileSize: 2, // world units per nav tile
} as const;

export const WORLD = {
  width: MAP.tilesX * MAP.tileSize, // 128
  depth: MAP.tilesY * MAP.tileSize, // 128
} as const;

export const SIM = {
  fixedDtMs: 1000 / 30, // 30 Hz logic
  fogHz: 5,
  flowFieldHz: 1, // rebuild flow fields at most 1/s
} as const;

export const CAMERA = {
  height: 55,
  distance: 45,
  angleDeg: 55, // pitch
  panSpeed: 36, // world units/sec at edge
  edgePad: 18, // px
  zoomMin: 22,
  zoomMax: 85,
  zoomStep: 4,
} as const;

export const FOG = {
  gridW: MAP.tilesX,
  gridH: MAP.tilesY,
  unexplored: 0,
  explored: 1,
  visible: 2,
} as const;

export const ECONOMY = {
  startingCredits: 600,
  depositDistance: 1.5, // slack past refinery edge before auto-deposit fires
  harvesterCargoLoads: 1, // cycles per trip
} as const;

export const VICTORY = {
  hqKindKey: 'hq' as const,
} as const;

// AI difficulty knobs. Lower numbers = gentler AI.
export const AI_TUNING = {
  thinkIntervalMs: 4500,       // how often the bot re-plans (was 2500)
  buildTimeMul: 1.35,          // scales productionMsLeft for AI factions only
  aggressionCooldownMs: 18000, // delay between attack-moves
  armyCapInfantry: 7,
  armyCapTank: 4,
  armyCapSpecial: 2,
  workerTarget: 4,
  warmupMs: 45_000,            // do not push aggression for the first 45 s
} as const;

export const UI = {
  selectionMinPx: 5,
} as const;

export type WeaponClass = 'aInfantry' | 'aArmor' | 'aStructure';
export type ArmorClass = 'light' | 'medium' | 'heavy' | 'structure';
export type Role = 'infantry' | 'tank' | 'special' | 'worker' | 'drone';
export type AbilityName = 'pounce' | 'detonate';
