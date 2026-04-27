import type { FactionId } from '@config/palette';
import type { SpawnBuildingKind, SpawnContentProvider, SpawnUnitKind } from '@engine/core/spawnService';
import { BUILDING_STATS } from '@game/rts/content/buildings';
import { FACTIONS } from '@game/rts/content/factions';
import { UNIT_STATS, type UnitStats } from '@game/rts/content/units';

export function applyRtsFactionMods(kind: SpawnUnitKind, factionId: FactionId): UnitStats {
  const base = UNIT_STATS[kind];
  const mods = FACTIONS[factionId].mods;
  return {
    ...base,
    maxHp: Math.round(base.maxHp * mods.hpMul),
    speed: base.speed * mods.speedMul,
  };
}

export const RTS_SPAWN_CONTENT: SpawnContentProvider = {
  unitStats: (kind: SpawnUnitKind, faction: FactionId) => applyRtsFactionMods(kind, faction),
  buildingStats: (kind: SpawnBuildingKind) => BUILDING_STATS[kind],
};
