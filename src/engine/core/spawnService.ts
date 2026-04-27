import type { World } from '@engine/world';
import type { Unit, Building, ResourceNode } from '@entities/types';
import type { FactionId } from '@config/palette';
import { MAP } from '@config/gameplay';
import { initBuilding, initUnit } from '@entities/create';

export type SpawnUnitKind = Unit['kind'];
export type SpawnBuildingKind = Building['kind'];

export interface SpawnContentProvider {
  unitStats(kind: SpawnUnitKind, faction: FactionId): Unit['stats'];
  buildingStats(kind: SpawnBuildingKind): Building['stats'];
}

export interface SpawnUnitInput { faction: FactionId; kind: SpawnUnitKind; x: number; y: number; }
export interface SpawnBuildingInput { faction: FactionId; kind: SpawnBuildingKind; tileX: number; tileY: number; preBuilt: boolean; }
export interface SpawnResourceInput { x: number; y: number; amount: number; }

export class SpawnService {
  constructor(
    private readonly world: World,
    private readonly content: SpawnContentProvider,
  ) {}

  unit(input: SpawnUnitInput): Unit | null {
    const u = this.initUnit(input);
    if (!u) return null;
    this.world.bus.emit('unit:spawned', { id: u.id, kind: input.kind, faction: input.faction, x: input.x, y: input.y });
    return u;
  }

  building(input: SpawnBuildingInput): Building | null {
    const b = this.world.buildings.acquire();
    if (!b) return null;
    const stats = this.content.buildingStats(input.kind);
    const worldX = (input.tileX + stats.tileW / 2) * MAP.tileSize;
    const worldY = (input.tileY + stats.tileH / 2) * MAP.tileSize;
    initBuilding(b, input.kind, input.faction, stats, input.tileX, input.tileY, worldX, worldY, input.preBuilt);
    this.world.navGrid.stampRect(input.tileX, input.tileY, stats.tileW, stats.tileH, true);
    this.world.bus.emit('building:placed', { id: b.id, kind: input.kind, faction: input.faction });
    if (input.preBuilt) {
      this.world.bus.emit('building:completed', { id: b.id, kind: input.kind, faction: input.faction });
    }
    return b;
  }

  resource(input: SpawnResourceInput): ResourceNode | null {
    const r = this.world.resources.acquire();
    if (!r) return null;
    r.x = input.x;
    r.y = input.y;
    r.amount = input.amount;
    return r;
  }

  unitAdjacentToBuilding(building: Building, kind: SpawnUnitKind): Unit | null {
    const { x, y } = findFreeSpawnAdjacent(this.world, building);
    const input = { faction: building.faction, kind, x, y };
    const u = this.initUnit(input);
    if (!u) return null;
    if (building.rallyX !== null && building.rallyY !== null) {
      u.state = 'move';
      u.destX = building.rallyX;
      u.destY = building.rallyY;
    }
    this.world.bus.emit('unit:spawned', { id: u.id, kind, faction: building.faction, x, y });
    return u;
  }

  private initUnit(input: SpawnUnitInput): Unit | null {
    const u = this.world.units.acquire();
    if (!u) return null;
    const stats = this.content.unitStats(input.kind, input.faction);
    initUnit(u, input.kind, input.faction, stats, input.x, input.y);
    return u;
  }
}

export function nearestOpenWorldPoint(world: World, x: number, y: number): { x: number; y: number } {
  const [tx, ty] = world.navGrid.worldToTile(x, y);
  if (!world.navGrid.isBlocked(tx, ty)) return { x, y };
  for (let r = 1; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (!world.navGrid.inBounds(nx, ny)) continue;
        if (world.navGrid.isBlocked(nx, ny)) continue;
        const [wx, wy] = world.navGrid.tileToWorld(nx, ny);
        return { x: wx, y: wy };
      }
    }
  }
  return { x, y };
}

function findFreeSpawnAdjacent(world: World, building: Building): { x: number; y: number } {
  // Start just outside footprint on the +Z side, spiral out until tile is free.
  const startX = building.x;
  const startY = building.y + (building.stats.tileH / 2 + 0.6) * MAP.tileSize;
  for (let r = 0; r < 6; r++) {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      const wx = startX + Math.cos(ang) * (r + 0.5) * MAP.tileSize;
      const wy = startY + Math.sin(ang) * (r + 0.5) * MAP.tileSize;
      const [tx, ty] = world.navGrid.worldToTile(wx, wy);
      if (!world.navGrid.isBlocked(tx, ty)) return { x: wx, y: wy };
    }
  }
  return { x: startX, y: startY };
}
