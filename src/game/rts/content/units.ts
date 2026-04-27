import type { Role, WeaponClass, ArmorClass, WeaponBehavior } from '@config/gameplay';

// Kinds are the concrete flavors that a faction role → kind mapping resolves to.
// Gameplay code reasons in roles; rendering + stats use kinds.
export type UnitKind =
  // worker
  | 'harvesterHuman' | 'harvesterSwarm' | 'harvesterTitan'
  // infantry
  | 'ranger' | 'raider' | 'paladin'
  // tank
  | 'battleTank' | 'scorpionBike' | 'siegeWalker'
  // special
  | 'commando' | 'burrower' | 'railgun'
  // extras
  | 'atTrooper'  // vanguard extraBarracksUnit
  | 'swarmlet'   // swarm extraBarracksUnit (drone/suicide)
  | 'atGrenadier'; // titan extraBarracksUnit

export interface Weapon {
  klass: WeaponClass;
  behavior?: WeaponBehavior;
  damage: number;
  range: number;
  cdMs: number;
  projectileSpeed: number; // 0 = contact-fuse
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

export interface Harvest {
  capacity: number;
  gatherMs: number;
}

export interface UnitStats {
  kind: UnitKind;
  role: Role;
  displayName: string;
  maxHp: number;
  armor: ArmorClass;
  radius: number;   // world-space collision radius
  speed: number;    // world units per sec
  altitude: number; // 0 ground; > 0 flying (Y height in three.js)
  cost: number;
  power: number;
  buildMs: number;
  builtBy: 'barracks' | 'factory' | 'hq' | 'airpad';
  sightRange?: number;
  weapon?: Weapon;
  harvest?: Harvest;
}

const inf = (over: Partial<UnitStats> & Pick<UnitStats, 'kind' | 'displayName'>): UnitStats => ({
  role: 'infantry', maxHp: 60, armor: 'light', radius: 0.5, speed: 5, altitude: 0,
  cost: 100, power: 1, buildMs: 4000, builtBy: 'barracks', sightRange: 14,
  weapon: { klass: 'aInfantry', behavior: 'projectile', damage: 10, range: 10, cdMs: 900, projectileSpeed: 30, targetsGround: true },
  ...over,
});

const tank = (over: Partial<UnitStats> & Pick<UnitStats, 'kind' | 'displayName'>): UnitStats => ({
  role: 'tank', maxHp: 180, armor: 'heavy', radius: 0.9, speed: 4, altitude: 0,
  cost: 400, power: 4, buildMs: 7000, builtBy: 'factory', sightRange: 13,
  weapon: { klass: 'aArmor', behavior: 'rocket', damage: 28, range: 11, cdMs: 1400, projectileSpeed: 28, splash: 0.6, targetsGround: true },
  ...over,
});

const worker = (over: Partial<UnitStats> & Pick<UnitStats, 'kind' | 'displayName'>): UnitStats => ({
  role: 'worker', maxHp: 80, armor: 'light', radius: 0.55, speed: 4.5, altitude: 0,
  cost: 120, power: 1, buildMs: 3500, builtBy: 'hq', sightRange: 10,
  harvest: { capacity: 90, gatherMs: 4500 },
  ...over,
});

export const UNIT_STATS: Record<UnitKind, UnitStats> = {
  // Workers
  harvesterHuman: worker({ kind: 'harvesterHuman', displayName: 'Harvester' }),
  harvesterSwarm: worker({ kind: 'harvesterSwarm', displayName: 'Drone Miner', speed: 5.2, maxHp: 60, cost: 100, harvest: { capacity: 70, gatherMs: 4200 } }),
  harvesterTitan: worker({ kind: 'harvesterTitan', displayName: 'Reclaimer', speed: 4.0, maxHp: 100, harvest: { capacity: 110, gatherMs: 4800 } }),

  // Infantry
  ranger:   inf({ kind: 'ranger',   displayName: 'Ranger' }),
  raider:   inf({ kind: 'raider',   displayName: 'Raider',   maxHp: 35, speed: 7.5, cost: 75, buildMs: 3000, radius: 0.42,
                  weapon: { klass: 'aInfantry', behavior: 'contact', damage: 8, range: 1.5, cdMs: 650, projectileSpeed: 0, targetsGround: true } }),
  paladin:  inf({ kind: 'paladin',  displayName: 'Paladin',  maxHp: 130, armor: 'medium', speed: 3.8, cost: 170, power: 2, radius: 0.62,
                  weapon: { klass: 'aInfantry', behavior: 'contact', damage: 13, range: 1.7, cdMs: 1000, projectileSpeed: 0, splash: 0.75, targetsGround: true } }),

  // Tanks
  battleTank:   tank({ kind: 'battleTank',   displayName: 'Battle Tank',
                       weapon: { klass: 'aArmor', behavior: 'rocket', damage: 28, range: 11, cdMs: 1400, projectileSpeed: 30, splash: 0.9, targetsGround: true } }),
  scorpionBike: tank({ kind: 'scorpionBike', displayName: 'Scorpion Bike', maxHp: 110, armor: 'light', speed: 6.5, cost: 300, buildMs: 6200, radius: 0.75,
                       weapon: { klass: 'aArmor', behavior: 'bounce', damage: 18, range: 10, cdMs: 1000, projectileSpeed: 38, bounceCount: 2, width: 5.5, targetsGround: true } }),
  siegeWalker:  tank({ kind: 'siegeWalker',  displayName: 'Siege Walker', maxHp: 260, speed: 2.8, cost: 520, buildMs: 9000, radius: 1.0,
                       weapon: { klass: 'aStructure', behavior: 'arc', damage: 44, range: 14, cdMs: 2000, projectileSpeed: 18, splash: 2.4, arcHeight: 5.5, targetsGround: true } }),

  // Specials
  commando: inf({ kind: 'commando', displayName: 'Commando', role: 'special', maxHp: 130, armor: 'medium', speed: 5.0, cost: 500, buildMs: 8000,
                  power: 4,
                  weapon: { klass: 'aStructure', behavior: 'rocket', damage: 35, range: 9, cdMs: 1300, projectileSpeed: 24, splash: 0.5, targetsGround: true } }),
  burrower: inf({ kind: 'burrower', displayName: 'Burrower', role: 'special', maxHp: 70, armor: 'light', speed: 7.0, cost: 320, buildMs: 6500, radius: 0.5,
                  power: 3,
                  weapon: { klass: 'aArmor', behavior: 'contact', damage: 20, range: 1.8, cdMs: 900, projectileSpeed: 0, targetsGround: true } }),
  railgun:  inf({ kind: 'railgun',  displayName: 'Railgun Frame', role: 'special', maxHp: 200, armor: 'heavy', speed: 3.2, cost: 620, buildMs: 9500, radius: 0.9,
                  power: 6,
                  weapon: { klass: 'aArmor', behavior: 'line', damage: 62, range: 18, cdMs: 2200, projectileSpeed: 0, width: 0.45, pierce: 4, targetsGround: true } }),

  // Faction-unique extras
  atTrooper: inf({ kind: 'atTrooper', displayName: 'AT Trooper', maxHp: 55, cost: 180, buildMs: 5000,
                   weapon: { klass: 'aArmor', behavior: 'rocket', damage: 14, range: 9, cdMs: 1100, projectileSpeed: 22, splash: 0.35, targetsGround: true } }),
  swarmlet:  inf({ kind: 'swarmlet',  displayName: 'Swarmlet', role: 'drone', maxHp: 18, armor: 'light', speed: 8.5, cost: 90, buildMs: 2400,
                   radius: 0.35,
                   weapon: { klass: 'aStructure', behavior: 'contact', damage: 80, range: 1.2, cdMs: 1000, projectileSpeed: 0, splash: 1.5, selfDestruct: true, targetsGround: true } }),
  atGrenadier: inf({ kind: 'atGrenadier', displayName: 'Grenadier', maxHp: 80, armor: 'medium', speed: 3.5, cost: 200, power: 2, buildMs: 5200, radius: 0.58,
                     weapon: { klass: 'aArmor', behavior: 'arc', damage: 18, range: 6.2, cdMs: 1250, projectileSpeed: 18, splash: 1.2, arcHeight: 3.5, targetsGround: true } }),
};

export function isUnitKind(kind: string): kind is UnitKind {
  return kind in UNIT_STATS;
}
