import type { Unit, Building, Projectile, ResourceNode } from '@entities/types';
import type { UnitKind, UnitStats } from '@game/rts/content/units';
import type { BuildingKind, BuildingStats } from '@game/rts/content/buildings';
import type { FactionId } from '@config/palette';

const EMPTY_UNIT_STATS: UnitStats = {
  kind: 'ranger',
  role: 'infantry',
  displayName: 'Unit',
  maxHp: 1,
  armor: 'light',
  radius: 0.5,
  speed: 0,
  altitude: 0,
  cost: 0,
  power: 0,
  buildMs: 0,
  builtBy: 'barracks',
};

const EMPTY_BUILDING_STATS: BuildingStats = {
  kind: 'power',
  displayName: 'Building',
  maxHp: 1,
  tileW: 1,
  tileH: 1,
  radius: 1,
  cost: 0,
  buildMs: 0,
  power: 0,
  armor: 'structure',
  sightRange: 0,
};

// Pool reset functions. These set every field; acquire() then marks alive.
export function resetUnit(u: Unit): void {
  u.kind = 'ranger';
  u.faction = 'vanguard';
  u.stats = EMPTY_UNIT_STATS;
  u.x = 0; u.y = 0; u.rotation = 0;
  u.vx = 0; u.vy = 0;
  u.hp = 1;
  u.cooldownMs = 0;
  u.pounceCooldownMs = 0;
  u.burrowed = false;
  u.ambushReady = false;
  u.targetLocked = false;
  u.targetId = null;
  u.targetIsBuilding = false;
  u.state = 'idle';
  u.destX = null; u.destY = null;
  u.cargo = 0;
  u.gatherMs = 0;
  u.resourceNodeId = null;
  u.homeRefineryId = null;
  u.flowGoalTx = -1;
  u.flowGoalTy = -1;
  u.holdPosition = false;
  u.buildTargetId = null;
  u.pendingMorphKind = null;
}

export function makeUnitSeed(id: number): Unit {
  const u: Unit = {
    id, alive: false,
    kind: 'ranger', faction: 'vanguard', stats: EMPTY_UNIT_STATS,
    x: 0, y: 0, rotation: 0, vx: 0, vy: 0,
    hp: 1, cooldownMs: 0, pounceCooldownMs: 0, burrowed: false, ambushReady: false,
    targetLocked: false, targetId: null, targetIsBuilding: false,
    state: 'idle', destX: null, destY: null,
    cargo: 0, gatherMs: 0, resourceNodeId: null, homeRefineryId: null,
    flowGoalTx: -1, flowGoalTy: -1,
    holdPosition: false, buildTargetId: null,
    pendingMorphKind: null,
  };
  return u;
}

export function initUnit(u: Unit, kind: UnitKind, faction: FactionId, stats: UnitStats, x: number, y: number): void {
  u.kind = kind;
  u.faction = faction;
  u.stats = stats;
  u.x = x; u.y = y;
  u.rotation = 0;
  u.vx = 0; u.vy = 0;
  u.hp = stats.maxHp;
  u.cooldownMs = 0;
  u.pounceCooldownMs = 0;
  u.burrowed = false;
  u.ambushReady = false;
  u.targetLocked = false;
  u.targetId = null;
  u.targetIsBuilding = false;
  u.state = 'idle';
  u.destX = null; u.destY = null;
  u.cargo = 0;
  u.gatherMs = 0;
  u.resourceNodeId = null;
  u.homeRefineryId = null;
  u.flowGoalTx = -1;
  u.flowGoalTy = -1;
  u.holdPosition = false;
  u.buildTargetId = null;
  u.pendingMorphKind = null;
}

export function resetBuilding(b: Building): void {
  b.kind = 'power';
  b.faction = 'vanguard';
  b.stats = EMPTY_BUILDING_STATS;
  b.tileX = 0; b.tileY = 0;
  b.x = 0; b.y = 0;
  b.hp = 1;
  b.completed = false;
  b.buildMsLeft = 0;
  b.productionQueue = [];
  b.productionMsLeft = 0;
  b.cooldownMs = 0;
  b.targetId = null;
  b.targetIsBuilding = false;
  b.rallyX = null; b.rallyY = null;
  b.builderUnitId = null;
}

export function makeBuildingSeed(id: number): Building {
  return {
    id, alive: false,
    kind: 'power', faction: 'vanguard', stats: EMPTY_BUILDING_STATS,
    tileX: 0, tileY: 0, x: 0, y: 0,
    hp: 1, completed: false, buildMsLeft: 0,
    productionQueue: [], productionMsLeft: 0,
    cooldownMs: 0, targetId: null, targetIsBuilding: false,
    rallyX: null, rallyY: null,
    builderUnitId: null,
  };
}

export function initBuilding(b: Building, kind: BuildingKind, faction: FactionId, stats: BuildingStats, tileX: number, tileY: number, worldX: number, worldY: number, preBuilt: boolean): void {
  b.kind = kind;
  b.faction = faction;
  b.stats = stats;
  b.tileX = tileX;
  b.tileY = tileY;
  b.x = worldX;
  b.y = worldY;
  b.hp = preBuilt ? stats.maxHp : Math.max(1, Math.floor(stats.maxHp * 0.1));
  b.completed = preBuilt;
  b.buildMsLeft = preBuilt ? 0 : stats.buildMs;
  b.productionQueue = [];
  b.productionMsLeft = 0;
  b.cooldownMs = 0;
  b.targetId = null;
  b.targetIsBuilding = false;
  b.rallyX = null; b.rallyY = null;
  b.builderUnitId = null;
}

export function resetProjectile(p: Projectile): void {
  p.x = 0; p.y = 0; p.z = 0;
  p.vx = 0; p.vy = 0; p.vz = 0;
  p.ownerId = 0; p.ownerFaction = 'vanguard'; p.targetId = 0; p.targetIsBuilding = false;
  p.damage = 0; p.klass = 'aInfantry'; p.behavior = 'projectile'; p.splash = 0;
  p.width = 0; p.bounceLeft = 0; p.arcHeight = 0;
  p.startX = 0; p.startY = 0; p.targetX = 0; p.targetY = 0;
  p.ageMs = 0; p.lifeMs = 0;
  p.ttlMs = 0;
}

export function makeProjectileSeed(id: number): Projectile {
  return {
    id, alive: false,
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    ownerId: 0, ownerFaction: 'vanguard', targetId: 0, targetIsBuilding: false,
    damage: 0, klass: 'aInfantry', behavior: 'projectile', splash: 0,
    width: 0, bounceLeft: 0, arcHeight: 0,
    startX: 0, startY: 0, targetX: 0, targetY: 0, ageMs: 0, lifeMs: 0,
    ttlMs: 0,
  };
}

export function resetResourceNode(r: ResourceNode): void {
  r.x = 0; r.y = 0; r.amount = 0;
}

export function makeResourceNodeSeed(id: number): ResourceNode {
  return { id, alive: false, x: 0, y: 0, amount: 0 };
}
