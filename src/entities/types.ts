import type { UnitKind, UnitStats } from '@config/units';
import type { BuildingKind, BuildingStats } from '@config/buildings';
import type { FactionId } from '@config/palette';
import type { Role } from '@config/gameplay';

export type UnitStateName = 'idle' | 'move' | 'attackMove' | 'attack' | 'harvest' | 'returnCargo' | 'build';

export interface ProductionOrder {
  role: Role;
  kind: UnitKind;
}

export interface Unit {
  id: number;
  alive: boolean;
  kind: UnitKind;
  faction: FactionId;
  stats: UnitStats;
  // Position & orientation (entity space; render converts).
  x: number;
  y: number;
  rotation: number;
  vx: number;
  vy: number;
  // Combat
  hp: number;
  cooldownMs: number;
  targetLocked: boolean;
  targetId: number | null;
  targetIsBuilding: boolean;
  // Movement intent
  state: UnitStateName;
  destX: number | null;
  destY: number | null;
  // Harvest state
  cargo: number;
  gatherMs: number; // counts down while gathering
  resourceNodeId: number | null;
  homeRefineryId: number | null;
  // Flow-field tag — which goal tile its current field targets.
  flowGoalTx: number;
  flowGoalTy: number;
  // User-commanded hold-position: idle without auto-engage movement.
  holdPosition: boolean;
  // Supervised-build linkage: if set, this worker is locked to a building site.
  buildTargetId: number | null;
  // Morph mode (Swarm): when set, the drone will consume itself into a building
  // of this kind as soon as it reaches destX/destY.
  pendingMorphKind: import('@config/buildings').BuildingKind | null;
}

export interface Building {
  id: number;
  alive: boolean;
  kind: BuildingKind;
  faction: FactionId;
  stats: BuildingStats;
  // Placement: top-left tile + footprint.
  tileX: number;
  tileY: number;
  // World-space center (cached).
  x: number;
  y: number;
  hp: number;
  completed: boolean;   // false while under construction
  buildMsLeft: number;
  // Production queue (concrete unit kind, FIFO).
  productionQueue: ProductionOrder[];
  productionMsLeft: number;
  // Turret combat
  cooldownMs: number;
  targetId: number | null;
  targetIsBuilding: boolean;
  // Rally point in world coords (optional)
  rallyX: number | null;
  rallyY: number | null;
  // Supervised-build linkage: if set, construction only advances while this worker is adjacent.
  builderUnitId: number | null;
}

export interface Projectile {
  id: number;
  alive: boolean;
  x: number;
  y: number;
  z: number; // altitude
  vx: number;
  vy: number;
  vz: number;
  ownerId: number;
  ownerFaction: FactionId;
  targetId: number;
  targetIsBuilding: boolean;
  damage: number;
  klass: 'aInfantry' | 'aArmor' | 'aStructure';
  splash: number; // 0 = none
  ttlMs: number;
}

export interface ResourceNode {
  id: number;
  alive: boolean;
  x: number;
  y: number;
  amount: number;
}
