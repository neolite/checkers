import type { World } from '@engine/world';
import { BUILDING_STATS, type BuildingKind } from '@game/rts/content/buildings';
import { UNIT_STATS, isUnitKind, type UnitKind } from '@game/rts/content/units';
import type { FactionId } from '@config/palette';

export interface PowerSnapshot {
  produced: number;
  consumed: number;
  net: number;
}

export function powerSnapshot(w: World, faction: FactionId): PowerSnapshot {
  let produced = 0;
  let consumed = 0;
  w.buildings.forEachAlive((b) => {
    if (b.faction !== faction) return;
    if (b.stats.power >= 0) {
      if (b.completed) produced += b.stats.power;
    } else {
      consumed += -b.stats.power;
    }
    for (const order of b.productionQueue) {
      if (!isUnitKind(order.kind)) continue;
      consumed += UNIT_STATS[order.kind].power;
    }
  });
  w.units.forEachAlive((u) => {
    if (u.faction !== faction) return;
    consumed += u.stats.power;
  });
  return { produced, consumed, net: produced - consumed };
}

export function buildingPowerNeed(kind: BuildingKind): number {
  return Math.max(0, -BUILDING_STATS[kind].power);
}

export function unitPowerNeed(kind: UnitKind): number {
  return UNIT_STATS[kind].power;
}

export function canPowerBuilding(w: World, faction: FactionId, kind: BuildingKind): boolean {
  const need = buildingPowerNeed(kind);
  if (need === 0) return true;
  const snap = powerSnapshot(w, faction);
  return snap.produced >= snap.consumed + need;
}

export function canPowerUnit(w: World, faction: FactionId, kind: UnitKind): boolean {
  const need = unitPowerNeed(kind);
  if (need === 0) return true;
  const snap = powerSnapshot(w, faction);
  return snap.produced >= snap.consumed + need;
}

export function powerShortfallForBuilding(w: World, faction: FactionId, kind: BuildingKind): number {
  const need = buildingPowerNeed(kind);
  const snap = powerSnapshot(w, faction);
  return Math.max(0, snap.consumed + need - snap.produced);
}

export function powerShortfallForUnit(w: World, faction: FactionId, kind: UnitKind): number {
  const need = unitPowerNeed(kind);
  const snap = powerSnapshot(w, faction);
  return Math.max(0, snap.consumed + need - snap.produced);
}
