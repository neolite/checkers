import type { BuildingKind } from '@config/buildings';
import type { UnitKind } from '@config/units';
import type { FactionId } from '@config/palette';

// How this faction erects structures.
//  supervised: the selected worker walks to the site and is LOCKED there until the building
//              finishes. While locked, it cannot harvest or attack — attending the site.
//  quickset:   the worker stops by the site to stake it, then returns to whatever it was doing;
//              construction proceeds autonomously after staking.
//  morph:      the drone IS the building. On placement the worker is consumed and the new
//              structure materializes at its position; no separate builder handoff.
export type BuildMode = 'supervised' | 'quickset' | 'morph';

export interface FactionMeta {
  id: FactionId;
  displayName: string;
  tag: string;
  description: string;

  // Role → Kind mapping (core RPS slots)
  workerKind: UnitKind;
  infantryKind: UnitKind;
  tankKind: UnitKind;
  specialKind: UnitKind;

  // Which structures this faction may erect.
  availableBuildings: readonly BuildingKind[];

  // Optional unique trained units attached to specific buildings.
  extraBarracksUnit?: UnitKind;
  extraFactoryUnit?: UnitKind;

  // Global stat scalars — the one-dimensional identity knobs.
  mods: { hpMul: number; speedMul: number; costMul: number };

  // Per-faction construction discipline.
  buildMode: BuildMode;
}

export const FACTIONS: Record<FactionId, FactionMeta> = {
  vanguard: {
    id: 'vanguard',
    displayName: 'Vanguard Coalition',
    tag: 'Baseline · versatile',
    description: 'Well-rounded humans. Balanced HP, speed and cost. AT Trooper adds early anti-armor without a factory. Build mode: supervised — harvester locks on the site until it finishes.',
    workerKind: 'harvesterHuman',
    infantryKind: 'ranger',
    tankKind: 'battleTank',
    specialKind: 'commando',
    availableBuildings: ['hq', 'power', 'refinery', 'barracks', 'factory', 'tech', 'turret'],
    extraBarracksUnit: 'atTrooper',
    mods: { hpMul: 1.0, speedMul: 1.0, costMul: 1.0 },
    buildMode: 'supervised',
  },
  swarm: {
    id: 'swarm',
    displayName: 'Hive Swarm',
    tag: 'Swarm · fast & fragile',
    description: 'Cheap, fast, fragile raiders. Barracks also train Swarmlets — suicide drones. Build mode: morph — a drone BECOMES the building (consumed on placement).',
    workerKind: 'harvesterSwarm',
    infantryKind: 'raider',
    tankKind: 'scorpionBike',
    specialKind: 'burrower',
    availableBuildings: ['hq', 'power', 'refinery', 'barracks', 'factory', 'tech', 'turret'],
    extraBarracksUnit: 'swarmlet',
    mods: { hpMul: 0.85, speedMul: 1.15, costMul: 0.85 },
    buildMode: 'morph',
  },
  titan: {
    id: 'titan',
    displayName: 'Titan Directorate',
    tag: 'Heavy · slow & tough',
    description: 'Armored industrial arm. Slower but far tougher. Factory also builds the Flak Truck. Build mode: quickset — worker stakes the site then returns to work; construction proceeds on its own.',
    workerKind: 'harvesterTitan',
    infantryKind: 'paladin',
    tankKind: 'siegeWalker',
    specialKind: 'railgun',
    availableBuildings: ['hq', 'power', 'refinery', 'barracks', 'factory', 'tech', 'turret'],
    extraFactoryUnit: 'flakTruck',
    mods: { hpMul: 1.2, speedMul: 0.88, costMul: 1.1 },
    buildMode: 'quickset',
  },
};
