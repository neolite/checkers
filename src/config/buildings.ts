import type { Role, WeaponBehavior } from '@config/gameplay';

export type BuildingKind =
  | 'hq' | 'power' | 'refinery' | 'barracks' | 'factory' | 'tech' | 'turret';

export interface BuildingStats {
  kind: BuildingKind;
  displayName: string;
  maxHp: number;
  tileW: number;
  tileH: number;
  radius: number; // approximate footprint radius for selection/collision
  cost: number;
  buildMs: number;
  power: number; // + produces, − consumes
  prereq?: BuildingKind;
  trains?: readonly Role[];
  armor: 'structure' | 'heavy';
  sightRange: number;
  // Optional anti-anything weapon (turret only).
  weapon?: {
    klass: 'aInfantry' | 'aArmor' | 'aStructure';
    behavior?: WeaponBehavior;
    damage: number;
    range: number;
    cdMs: number;
    projectileSpeed: number;
    splash?: number;
    chainJumps?: number;
    chainRange?: number;
    targetsGround?: boolean;
    targetsAir?: boolean;
  };
}

export const BUILDING_STATS: Record<BuildingKind, BuildingStats> = {
  hq: {
    kind: 'hq', displayName: 'HQ', maxHp: 1800, tileW: 4, tileH: 4, radius: 4.5,
    cost: 0, buildMs: 0, power: 20, trains: ['worker'],
    armor: 'structure', sightRange: 16,
  },
  power: {
    kind: 'power', displayName: 'Power', maxHp: 360, tileW: 2, tileH: 2, radius: 2.2,
    cost: 140, buildMs: 6000, power: 60, prereq: 'hq', armor: 'structure', sightRange: 6,
  },
  refinery: {
    kind: 'refinery', displayName: 'Refinery', maxHp: 700, tileW: 3, tileH: 3, radius: 3.2,
    cost: 300, buildMs: 9000, power: -10, prereq: 'hq', armor: 'structure', sightRange: 10,
  },
  barracks: {
    kind: 'barracks', displayName: 'Barracks', maxHp: 520, tileW: 2, tileH: 2, radius: 2.2,
    cost: 220, buildMs: 7500, power: -15, prereq: 'hq', trains: ['infantry'], armor: 'structure', sightRange: 8,
  },
  factory: {
    kind: 'factory', displayName: 'Factory', maxHp: 850, tileW: 3, tileH: 3, radius: 3.2,
    cost: 500, buildMs: 12000, power: -25, prereq: 'barracks', trains: ['tank'], armor: 'structure', sightRange: 8,
  },
  tech: {
    kind: 'tech', displayName: 'Tech Center', maxHp: 480, tileW: 2, tileH: 2, radius: 2.2,
    cost: 400, buildMs: 10000, power: -20, prereq: 'factory', trains: ['special'], armor: 'structure', sightRange: 10,
  },
  turret: {
    kind: 'turret', displayName: 'Turret', maxHp: 360, tileW: 1, tileH: 1, radius: 1.3,
    cost: 220, buildMs: 5000, power: -10, prereq: 'barracks',
    armor: 'heavy', sightRange: 14,
    weapon: { klass: 'aArmor', behavior: 'chain', damage: 18, range: 11, cdMs: 1500, projectileSpeed: 0, chainJumps: 2, chainRange: 4.5, targetsGround: true },
  },
};
