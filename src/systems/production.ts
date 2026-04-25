import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import type { Building, Unit } from '@entities/types';
import type { Role } from '@config/gameplay';
import type { UnitKind } from '@config/units';
import { UNIT_STATS } from '@config/units';
import { FACTIONS } from '@config/factions';
import { applyFactionMods } from '@entities/create';
import { BUILDING_STATS } from '@config/buildings';
import { MAP } from '@config/gameplay';
import { initUnit } from '@entities/create';
import { initBuilding } from '@entities/create';
import { AI_TUNING } from '@config/gameplay';

// Building construction + unit training.
// NOTE: "production" in this codebase covers BOTH finishing buildings under construction
// AND training units from completed production buildings.
export class ProductionSystem implements ISystem {
  readonly name = 'production';

  init(w: World): void {
    w.bus.on('input:placeBuilding', ({ x, y, kind }) => {
      const faction = FACTIONS[w.playerFaction];
      const stats = BUILDING_STATS[kind];
      if (stats.prereq && !hasCompleted(w, w.playerFaction, stats.prereq)) return;
      const cost = Math.round(stats.cost * faction.mods.costMul);
      const fs = w.factions[w.playerFaction];
      if (fs.credits < cost) return;
      const tx = Math.floor(x / MAP.tileSize) - Math.floor(stats.tileW / 2);
      const ty = Math.floor(y / MAP.tileSize) - Math.floor(stats.tileH / 2);
      for (let dy = 0; dy < stats.tileH; dy++) {
        for (let dx = 0; dx < stats.tileW; dx++) {
          if (!w.navGrid.inBounds(tx + dx, ty + dy)) return;
          if (w.navGrid.isBlocked(tx + dx, ty + dy)) return;
        }
      }
      // Pick the nearest eligible worker from the current selection.
      // If no worker is selected, find any own worker on the map — gameplay still works.
      const worker = pickBuilder(w, x, y);
      if (!worker) return;

      fs.credits -= cost;

      if (faction.buildMode === 'morph') {
        // Zerg-style: the click names the spot; the drone walks there and THEN
        // transforms into the building. UnitAI picks up pendingMorphKind on arrival.
        // Place the goal at the tile center the player clicked (stats-aware).
        const goalX = (tx + stats.tileW / 2) * MAP.tileSize;
        const goalY = (ty + stats.tileH / 2) * MAP.tileSize;
        worker.state = 'move';
        worker.destX = goalX;
        worker.destY = goalY;
        worker.pendingMorphKind = kind;
        worker.resourceNodeId = null;
        worker.holdPosition = false;
        worker.targetId = null;
        worker.targetLocked = false;
        return;
      }

      if (faction.buildMode === 'quickset') {
        const b = spawnBuilding(w, w.playerFaction, kind, tx, ty, false);
        if (!b) return;
        // Worker pops over, stakes, and returns to idle work on its own.
        worker.state = 'move';
        worker.destX = b.x;
        worker.destY = b.y;
        worker.holdPosition = false;
        worker.buildTargetId = null;
        b.builderUnitId = null; // autonomous
        return;
      }

      // supervised
      const b = spawnBuilding(w, w.playerFaction, kind, tx, ty, false);
      if (!b) return;
      // Lock the worker to this build site. UnitAI.tickBuild keeps it there.
      worker.buildTargetId = b.id;
      worker.state = 'build';
      worker.destX = b.x;
      worker.destY = b.y;
      worker.resourceNodeId = null;
      worker.targetId = null;
      worker.targetLocked = false;
      worker.holdPosition = false;
      b.builderUnitId = worker.id;
      b.buildMsLeft = stats.buildMs; // freeze — ProductionSystem will only decrement while builder nearby
    });

    w.bus.on('input:trainUnit', ({ buildingId, role, kindKey }) => {
      const b = w.buildings.findById(buildingId);
      if (!b) return;
      if (!b.completed) return;
      if (b.faction !== w.playerFaction) return;
      if (!b.stats.trains || !b.stats.trains.includes(role)) {
        // Could be an override (extraBarracksUnit / extraFactoryUnit) — allow via kindKey path.
        if (!kindKey) return;
      }
      const faction = FACTIONS[w.playerFaction];
      const kind = resolveKind(role, faction, kindKey);
      if (!kind) return;
      const baseStats = UNIT_STATS[kind];
      const cost = baseStats.cost;
      const fs = w.factions[w.playerFaction];
      if (fs.credits < cost) return;
      fs.credits -= cost;
      b.productionQueue.push({ role, kind });
      if (b.productionMsLeft <= 0 && b.productionQueue.length === 1) {
        b.productionMsLeft = baseStats.buildMs;
        w.bus.emit('production:started', { buildingId: b.id, role });
      }
    });
  }

  update(w: World, dtMs: number): void {
    // Construction tick
    w.buildings.forEachAlive((b) => {
      if (!b.completed) {
        const canProgress = constructionCanProgress(w, b);
        if (canProgress) {
          b.buildMsLeft -= dtMs;
          b.hp = Math.min(b.stats.maxHp, b.hp + (b.stats.maxHp / Math.max(1, b.stats.buildMs)) * dtMs);
        }
        if (b.buildMsLeft <= 0) {
          b.completed = true;
          b.hp = b.stats.maxHp;
          // Release any locked builder.
          if (b.builderUnitId !== null) {
            const bu = w.units.findById(b.builderUnitId);
            if (bu) {
              bu.buildTargetId = null;
              bu.state = 'idle';
            }
            b.builderUnitId = null;
          }
          w.bus.emit('building:completed', { id: b.id, kind: b.kind, faction: b.faction });
        }
        return;
      }

      // Training tick
      if (b.productionQueue.length === 0) return;
      b.productionMsLeft -= dtMs;
      if (b.productionMsLeft <= 0) {
        const order = b.productionQueue.shift()!;
        const faction = FACTIONS[b.faction];
        spawnUnit(w, b, order.kind);
        // Kick off next in queue.
        if (b.productionQueue.length > 0) {
          const next = b.productionQueue[0]!;
          const aiMul = w.factions[b.faction].isHuman ? 1 : AI_TUNING.buildTimeMul;
          b.productionMsLeft = Math.round(UNIT_STATS[next.kind].buildMs * aiMul);
          w.bus.emit('production:started', { buildingId: b.id, role: next.role });
        } else {
          b.productionMsLeft = 0;
          w.bus.emit('production:completed', { buildingId: b.id });
        }
      }
    });
  }
}

function resolveKind(role: Role, meta: ReturnType<typeof _factionMeta>, override: UnitKind | null): UnitKind | null {
  if (override) return override;
  switch (role) {
    case 'worker': return meta.workerKind;
    case 'infantry': return meta.infantryKind;
    case 'tank': return meta.tankKind;
    case 'special': return meta.specialKind;
    case 'drone': return null; // drones handled as overrides (swarmlet) — no default kind
  }
  return null;
}

// Type helper to get FactionMeta shape without import loop.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _factionMeta(): import('@config/factions').FactionMeta {
  return FACTIONS.vanguard;
}

function hasCompleted(w: World, faction: import('@config/palette').FactionId, kind: import('@config/buildings').BuildingKind): boolean {
  let found = false;
  w.buildings.forEachAlive((b) => {
    if (b.faction === faction && b.kind === kind && b.completed) found = true;
  });
  return found;
}

// Pick the closest available worker from the player's current selection; fall back
// to any own worker if none is selected so the UX isn't too punishing.
function pickBuilder(w: World, wx: number, wy: number): import('@entities/types').Unit | null {
  const candidates: import('@entities/types').Unit[] = [];
  for (const id of w.selectedUnits) {
    const u = w.units.findById(id);
    if (!u) continue;
    if (u.faction !== w.playerFaction) continue;
    if (u.stats.role !== 'worker') continue;
    if (u.state === 'build') continue; // already locked to a site
    if (u.pendingMorphKind !== null) continue;
    candidates.push(u);
  }
  if (candidates.length === 0) {
    w.units.forEachAlive((u) => {
      if (u.faction === w.playerFaction && u.stats.role === 'worker' && u.state !== 'build') {
        if (u.pendingMorphKind !== null) return;
        candidates.push(u);
      }
    });
  }
  if (candidates.length === 0) return null;
  let best = candidates[0]!;
  let bestD = (best.x - wx) ** 2 + (best.y - wy) ** 2;
  for (let i = 1; i < candidates.length; i++) {
    const u = candidates[i]!;
    const d = (u.x - wx) ** 2 + (u.y - wy) ** 2;
    if (d < bestD) { best = u; bestD = d; }
  }
  return best;
}

function gridValid(w: World, tx: number, ty: number, tw: number, th: number): boolean {
  for (let dy = 0; dy < th; dy++) {
    for (let dx = 0; dx < tw; dx++) {
      if (!w.navGrid.inBounds(tx + dx, ty + dy)) return false;
      if (w.navGrid.isBlocked(tx + dx, ty + dy)) return false;
    }
  }
  return true;
}

// Construction progress policy per build mode.
// supervised: builder must be alive AND near the footprint for construction to advance.
// quickset + morph: always progress (b.builderUnitId === null).
function constructionCanProgress(w: World, b: import('@entities/types').Building): boolean {
  if (b.builderUnitId === null) return true;
  const builder = w.units.findById(b.builderUnitId);
  if (!builder) {
    // Builder lost — stall supervised construction until player reassigns.
    // (For now also clear the link to avoid permanent stall.)
    b.builderUnitId = null;
    return true;
  }
  const d = Math.hypot(builder.x - b.x, builder.y - b.y);
  const edge = b.stats.radius + builder.stats.radius + 0.9;
  return d <= edge;
}

export function spawnBuilding(w: World, faction: import('@config/palette').FactionId, kind: import('@config/buildings').BuildingKind, tileX: number, tileY: number, preBuilt: boolean): Building | null {
  const b = w.buildings.acquire();
  if (!b) return null;
  const stats = BUILDING_STATS[kind];
  const worldX = (tileX + stats.tileW / 2) * MAP.tileSize;
  const worldY = (tileY + stats.tileH / 2) * MAP.tileSize;
  initBuilding(b, kind, faction, stats, tileX, tileY, worldX, worldY, preBuilt);
  w.navGrid.stampRect(tileX, tileY, stats.tileW, stats.tileH, true);
  w.bus.emit('building:placed', { id: b.id, kind, faction });
  if (preBuilt) {
    w.bus.emit('building:completed', { id: b.id, kind, faction });
  }
  return b;
}

export function spawnUnit(w: World, b: Building, kind: UnitKind): Unit | null {
  const u = w.units.acquire();
  if (!u) return null;
  const faction = FACTIONS[b.faction];
  const stats = applyFactionMods(kind, faction.mods);
  // Choose a spawn cell in a ring around building footprint.
  const { x, y } = findFreeSpawnAdjacent(w, b);
  initUnit(u, kind, b.faction, stats, x, y);
  // Rally point: if set, move toward it.
  if (b.rallyX !== null && b.rallyY !== null) {
    u.state = 'move';
    u.destX = b.rallyX;
    u.destY = b.rallyY;
  }
  w.bus.emit('unit:spawned', { id: u.id, kind, faction: b.faction, x, y });
  return u;
}

function findFreeSpawnAdjacent(w: World, b: Building): { x: number; y: number } {
  // Start just outside footprint on the +Z side, spiral out until tile is free.
  const startX = b.x;
  const startY = b.y + (b.stats.tileH / 2 + 0.6) * MAP.tileSize;
  for (let r = 0; r < 6; r++) {
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      const wx = startX + Math.cos(ang) * (r + 0.5) * MAP.tileSize;
      const wy = startY + Math.sin(ang) * (r + 0.5) * MAP.tileSize;
      const [tx, ty] = w.navGrid.worldToTile(wx, wy);
      if (!w.navGrid.isBlocked(tx, ty)) return { x: wx, y: wy };
    }
  }
  return { x: startX, y: startY };
}
