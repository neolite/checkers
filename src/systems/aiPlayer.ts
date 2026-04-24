import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import type { Building, Unit } from '@entities/types';
import type { FactionId } from '@config/palette';
import type { BuildingKind } from '@config/buildings';
import type { Role } from '@config/gameplay';
import { BUILDING_STATS } from '@config/buildings';
import { FACTIONS } from '@config/factions';
import { UNIT_STATS } from '@config/units';
import { MAP } from '@config/gameplay';
import { spawnBuilding } from '@systems/production';
import { dist } from '@utils/math';

// Skeleton bot. Every 2.5s it inspects its own state and:
//   - queues up economy (refinery + power) until it has 2 harvesters + 2 power
//   - builds a barracks, then pumps infantry
//   - then a factory, pumping tanks
//   - aggression: once tanks ≥ 3 or infantry ≥ 8, everything attack-moves the nearest enemy
export class AIPlayerSystem implements ISystem {
  readonly name = 'aiPlayer';

  init(_w: World): void { /* noop */ }

  update(w: World, _dtMs: number): void {
    for (const id of Object.keys(w.factions) as FactionId[]) {
      const fs = w.factions[id];
      if (fs.isHuman) continue;
      if (!fs.alive) continue;
      if (w.tNow - fs.aiLastThinkMs < 2500) continue;
      fs.aiLastThinkMs = w.tNow;
      this.think(w, id);
    }
  }

  private think(w: World, id: FactionId): void {
    const meta = FACTIONS[id];
    const fs = w.factions[id];
    const ownBuildings: Building[] = [];
    const ownUnits: Unit[] = [];
    w.buildings.forEachAlive((b) => { if (b.faction === id) ownBuildings.push(b); });
    w.units.forEachAlive((u) => { if (u.faction === id) ownUnits.push(u); });
    const hq = ownBuildings.find((b) => b.kind === 'hq');
    if (!hq || !hq.completed) return;

    const completedOf = (k: BuildingKind) => ownBuildings.filter((b) => b.kind === k && b.completed).length;
    const totalOf = (k: BuildingKind) => ownBuildings.filter((b) => b.kind === k).length;
    const workerCount = ownUnits.filter((u) => u.stats.role === 'worker').length;
    const inf = ownUnits.filter((u) => u.stats.role === 'infantry' || u.stats.role === 'drone').length;
    const tank = ownUnits.filter((u) => u.stats.role === 'tank').length;

    // Decide what to build next.
    const wants: { kind: BuildingKind; priority: number }[] = [];
    if (totalOf('refinery') === 0) wants.push({ kind: 'refinery', priority: 10 });
    if (fs.powerProduced - fs.powerConsumed < 10) wants.push({ kind: 'power', priority: 9 });
    if (totalOf('barracks') === 0 && completedOf('hq') > 0) wants.push({ kind: 'barracks', priority: 8 });
    if (totalOf('factory') === 0 && completedOf('barracks') > 0) wants.push({ kind: 'factory', priority: 6 });
    if (totalOf('turret') < 2 && completedOf('barracks') > 0) wants.push({ kind: 'turret', priority: 4 });
    if (totalOf('tech') === 0 && completedOf('factory') > 0) wants.push({ kind: 'tech', priority: 3 });

    wants.sort((a, b) => b.priority - a.priority);
    for (const want of wants) {
      if (this.tryPlace(w, id, want.kind, hq)) break;
    }

    // Train workers up to 4.
    if (workerCount < 4) {
      this.tryTrain(w, hq, 'worker');
    }

    // Train army. Cap to avoid pool exhaustion.
    const barracks = ownBuildings.find((b) => b.kind === 'barracks' && b.completed && b.productionQueue.length < 3);
    if (barracks && inf < 10) {
      this.tryTrain(w, barracks, 'infantry');
    }
    const factory = ownBuildings.find((b) => b.kind === 'factory' && b.completed && b.productionQueue.length < 2);
    if (factory && tank < 6) {
      this.tryTrain(w, factory, 'tank');
    }
    const tech = ownBuildings.find((b) => b.kind === 'tech' && b.completed && b.productionQueue.length < 1);
    if (tech && ownUnits.filter((u) => u.stats.role === 'special').length < 2) {
      this.tryTrain(w, tech, 'special');
    }

    // Aggression: attack-move army towards nearest enemy HQ once threshold met.
    if ((inf >= 6 || tank >= 3) && w.tNow > fs.aiStage) {
      fs.aiStage = w.tNow + 9000; // cooldown
      const targetHq = this.findEnemyHq(w, id);
      if (targetHq) {
        ownUnits.forEach((u) => {
          if (u.stats.role === 'worker') return;
          u.state = 'attackMove';
          u.destX = targetHq.x;
          u.destY = targetHq.y;
          u.targetLocked = false;
          u.targetId = null;
          u.flowGoalTx = -1;
          u.flowGoalTy = -1;
        });
      }
    }

    // Silence unused import warnings in some compilation modes.
    void UNIT_STATS; void meta;
  }

  private tryPlace(w: World, id: FactionId, kind: BuildingKind, hq: Building): boolean {
    const stats = BUILDING_STATS[kind];
    const fs = w.factions[id];
    const meta = FACTIONS[id];
    const mods = meta.mods;
    const cost = Math.round(stats.cost * mods.costMul);
    if (fs.credits < cost) return false;
    // Find a worker — morph consumes one, supervised needs one to attend.
    const worker = this.findAvailableWorker(w, id);
    if (!worker) return false; // Can't build until a worker exists.

    const baseTx = hq.tileX;
    const baseTy = hq.tileY;
    for (let r = 2; r < 10; r++) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const tx = baseTx + Math.round(Math.cos(ang) * (r + 2));
        const ty = baseTy + Math.round(Math.sin(ang) * (r + 2));
        let ok = true;
        for (let dy = 0; dy < stats.tileH; dy++) {
          for (let dx = 0; dx < stats.tileW; dx++) {
            if (!w.navGrid.inBounds(tx + dx, ty + dy) || w.navGrid.isBlocked(tx + dx, ty + dy)) { ok = false; break; }
          }
          if (!ok) break;
        }
        if (!ok) continue;
        fs.credits -= cost;
        const b = spawnBuilding(w, id, kind, tx, ty, false);
        if (!b) return false;
        if (meta.buildMode === 'morph') {
          worker.hp = 0; // consume drone
        } else if (meta.buildMode === 'supervised') {
          worker.buildTargetId = b.id;
          worker.state = 'build';
          worker.destX = b.x; worker.destY = b.y;
          b.builderUnitId = worker.id;
        } else {
          worker.state = 'move';
          worker.destX = b.x; worker.destY = b.y;
        }
        return true;
      }
    }
    return false;
  }

  private findAvailableWorker(w: World, id: FactionId): import('@entities/types').Unit | null {
    let out: import('@entities/types').Unit | null = null;
    w.units.forEachAlive((u) => {
      if (u.faction !== id) return;
      if (u.stats.role !== 'worker') return;
      if (u.state === 'build') return;
      if (!out) out = u;
    });
    return out;
  }

  private tryTrain(w: World, b: Building, role: Role): void {
    if (!b.completed) return;
    if (!b.stats.trains || !b.stats.trains.includes(role)) return;
    if (b.productionQueue.length >= 3) return;
    const meta = FACTIONS[b.faction];
    const kind =
      role === 'worker' ? meta.workerKind :
      role === 'infantry' ? meta.infantryKind :
      role === 'tank' ? meta.tankKind :
      role === 'special' ? meta.specialKind : null;
    if (!kind) return;
    const stats = UNIT_STATS[kind];
    const cost = Math.round(stats.cost * meta.mods.costMul);
    const fs = w.factions[b.faction];
    if (fs.credits < cost) return;
    fs.credits -= cost;
    b.productionQueue.push(role);
    if (b.productionMsLeft <= 0 && b.productionQueue.length === 1) {
      b.productionMsLeft = Math.round(stats.buildMs * meta.mods.costMul);
      w.bus.emit('production:started', { buildingId: b.id, role });
    }
  }

  private findEnemyHq(w: World, ownId: FactionId): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    const origin = this.findOwnHq(w, ownId);
    if (!origin) return null;
    w.buildings.forEachAlive((b) => {
      if (b.faction === ownId) return;
      if (b.kind !== 'hq') return;
      const d = dist(b.x, b.y, origin.x, origin.y);
      if (d < bestD) { best = b; bestD = d; }
    });
    return best;
  }

  private findOwnHq(w: World, ownId: FactionId): Building | null {
    let hq: Building | null = null;
    w.buildings.forEachAlive((b) => {
      if (b.faction === ownId && b.kind === 'hq') hq = b;
    });
    return hq;
  }
}

// Minor silence for eslint.
void MAP;
