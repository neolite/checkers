import type { ArmorClass, Role, WeaponBehavior, WeaponClass } from '@config/gameplay';

export type EntityKind = string;
export type UnitKind = EntityKind;
export type BuildingKind = EntityKind;

export interface WeaponStats {
  klass: WeaponClass;
  behavior?: WeaponBehavior;
  damage: number;
  range: number;
  cdMs: number;
  projectileSpeed: number;
  splash?: number;
  selfDestruct?: boolean;
  width?: number;
  pierce?: number;
  coneAngleDeg?: number;
  chainJumps?: number;
  chainRange?: number;
  bounceCount?: number;
  arcHeight?: number;
  targetsAir?: boolean;
  targetsGround?: boolean;
}

export interface HarvestStats {
  capacity: number;
  gatherMs: number;
}

export interface UnitStats {
  kind: UnitKind;
  role: Role;
  displayName: string;
  maxHp: number;
  armor: ArmorClass;
  radius: number;
  speed: number;
  altitude: number;
  cost: number;
  power: number;
  buildMs: number;
  builtBy: string;
  sightRange?: number;
  weapon?: WeaponStats;
  harvest?: HarvestStats;
}

export interface BuildingStats {
  kind: BuildingKind;
  displayName: string;
  maxHp: number;
  tileW: number;
  tileH: number;
  radius: number;
  cost: number;
  buildMs: number;
  power: number;
  prereq?: BuildingKind;
  trains?: readonly Role[];
  armor: ArmorClass;
  sightRange: number;
  weapon?: WeaponStats;
}
