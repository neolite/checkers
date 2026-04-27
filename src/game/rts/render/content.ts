import type { Building, Projectile, Unit } from '@entities/types';
import { MAP } from '@config/gameplay';
import type { RenderContentProvider } from '@render/sync';
import { makeBuildingMesh, makeProjectileMesh, makeResourceMesh, makeUnitMesh } from '@game/rts/render/meshes';
import type { BuildingKind } from '@game/rts/content/buildings';
import type { UnitKind } from '@game/rts/content/units';

export const RTS_RENDER_CONTENT: RenderContentProvider = {
  makeUnitMesh: (unit: Unit, primary: number, accent: number) => makeUnitMesh(unit.kind as UnitKind, primary, accent),
  makeBuildingMesh: (building: Building, primary: number, accent: number) =>
    makeBuildingMesh(building.kind as BuildingKind, building.faction, primary, accent, MAP.tileSize),
  makeProjectileMesh: (projectile: Projectile, color: number) => makeProjectileMesh(color, projectile.behavior),
  makeResourceMesh: (color: number) => makeResourceMesh(color),
};
