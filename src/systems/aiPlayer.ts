import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import type { Building, Unit } from '@entities/types';
import type { FactionId } from '@config/palette';
import type { BuildingKind } from '@config/buildings';
import type { Role } from '@config/gameplay';
import { BUILDING_STATS } from '@config/buildings';
import { FACTIONS } from '@config/factions';
import { UNIT_STATS } from '@config/units';
import { MAP, AI_TUNING } from '@config/gameplay';
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
      if (w.tNow - fs.aiLastThinkMs < AI_TUNING.thinkIntervalMs) continue;
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
    const infantryCap = id === 'swarm' ? 12 : AI_TUNING.armyCapInfantry;
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

    // Train workers up to cap.
    if (workerCount < AI_TUNING.workerTarget) {
      this.tryTrain(w, hq, 'worker');
    }

    // Train army. Caps keep the bot sane and prevent pool exhaustion.
    const barracks = ownBuildings.find((b) => b.kind === 'barracks' && b.completed && b.productionQueue.length < 2);
    if (barracks && inf < infantryCap) {
      this.tryTrainKind(w, barracks, this.pickBarracksKind(id, ownUnits, inf));
    }
    const factory = ownBuildings.find((b) => b.kind === 'factory' && b.completed && b.productionQueue.length < 1);
    if (factory && tank < AI_TUNING.armyCapTank) {
      this.tryTrain(w, factory, 'tank');
    }
    const tech = ownBuildings.find((b) => b.kind === 'tech' && b.completed && b.productionQueue.length < 1);
    if (tech && ownUnits.filter((u) => u.stats.role === 'special').length < AI_TUNING.armyCapSpecial) {
      this.tryTrain(w, tech, 'special');
    }

    // Aggression: only after warmup, and only at a calmer cadence.
    const warm = w.tNow >= AI_TUNING.warmupMs;
    if (warm && (inf >= infantryCap - 1 || tank >= AI_TUNING.armyCapTank - 1) && w.tNow > fs.aiStage) {
      fs.aiStage = w.tNow + AI_TUNING.aggressionCooldownMs;
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

  private pickBarracksKind(id: FactionId, ownUnits: Unit[], infantryCount: number): import('@config/units').UnitKind {
    const meta = FACTIONS[id];
    const extra = meta.extraBarracksUnit;
    if (!extra) return meta.infantryKind;

    const extraCount = ownUnits.filter((u) => u.kind === extra).length;
    const coreCount = ownUnits.filter((u) => u.kind === meta.infantryKind).length;
    if (id === 'swarm') {
      if (coreCount < 4) return meta.infantryKind;
      if (extraCount < 3) return extra;
      return infantryCount % 3 === 2 ? extra : meta.infantryKind;
    }
    if (coreCount < 3) return meta.infantryKind;
    if (extraCount < 2) return extra;
    return infantryCount % 4 === 3 ? extra : meta.infantryKind;
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
    this.tryTrainKind(w, b, kind);
  }

  private tryTrainKind(w: World, b: Building, kind: import('@config/units').UnitKind): void {
    if (!b.completed) return;
    if (b.productionQueue.length >= 3) return;
    const meta = FACTIONS[b.faction];
    const stats = UNIT_STATS[kind];
    const role = stats.role;
    if (!b.stats.trains?.includes(role) && meta.extraBarracksUnit !== kind && meta.extraFactoryUnit !== kind) return;
    const cost = Math.round(stats.cost * meta.mods.costMul);
    const fs = w.factions[b.faction];
    if (fs.credits < cost) return;
    fs.credits -= cost;
    b.productionQueue.push({ role, kind });
    if (b.productionMsLeft <= 0 && b.productionQueue.length === 1) {
      b.productionMsLeft = Math.round(stats.buildMs * meta.mods.costMul * AI_TUNING.buildTimeMul);
      w.bus.emit('production:started', { buildingId: b.id, role });
    }
  }

  private findEnemyHq(w: World, ownId: FactionId): Building | null {
    let best: Building | null = null;
    let bestD = Infinity;
    const origin = this.findOwnHq(w, ownId);
    if (!origin) return null;
    w.buildings.forEachAlive((b) => {
      if (!w.areHostile(b.faction, ownId)) return;
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
