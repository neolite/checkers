import type { FactionId } from '@config/palette';
import type { SpawnBuildingKind, SpawnContentProvider, SpawnUnitKind } from '@engine/core/spawnService';
import { BUILDING_STATS, isBuildingKind } from '@game/rts/content/buildings';
import { FACTIONS } from '@game/rts/content/factions';
import { UNIT_STATS, isUnitKind, type UnitStats } from '@game/rts/content/units';

export function applyRtsFactionMods(kind: SpawnUnitKind, factionId: FactionId): UnitStats {
  if (!isUnitKind(kind)) throw new Error(`Unknown RTS unit kind: ${kind}`);
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
  buildingStats: (kind: SpawnBuildingKind) => {
    if (!isBuildingKind(kind)) throw new Error(`Unknown RTS building kind: ${kind}`);
    return BUILDING_STATS[kind];
  },
};
