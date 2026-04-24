import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import type { Unit, Building, ResourceNode } from '@entities/types';
import { ECONOMY, MAP } from '@config/gameplay';
import { dist, dist2 } from '@utils/math';
import { BUILDING_STATS } from '@config/buildings';
import { spawnBuilding } from '@systems/production';

// FSM transitions run here. Movement/combat systems consume the resulting fields.
export class UnitAISystem implements ISystem {
  readonly name = 'unitAI';

  init(_w: World): void {
    // No event subscriptions — operates on pool state each tick.
  }

  update(w: World, dtMs: number): void {
    w.units.forEachAlive((u) => {
      switch (u.state) {
        case 'idle':        this.tickIdle(w, u); break;
        case 'move':        this.tickMove(w, u); break;
        case 'attackMove':  this.tickAttackMove(w, u); break;
        case 'attack':      this.tickAttack(w, u); break;
        case 'harvest':     this.tickHarvest(w, u, dtMs); break;
        case 'returnCargo': this.tickReturnCargo(w, u); break;
        case 'build':       this.tickBuild(w, u); break;
      }
    });
  }

  // Worker locked to a construction site. State clears when site completes / is destroyed.
  private tickBuild(w: World, u: Unit): void {
    if (u.buildTargetId === null) { u.state = 'idle'; return; }
    const b = w.buildings.findById(u.buildTargetId);
    if (!b) { u.buildTargetId = null; u.state = 'idle'; u.holdPosition = false; return; }
    if (b.completed) { u.buildTargetId = null; u.state = 'idle'; u.holdPosition = false; return; }
    const d = dist(u.x, u.y, b.x, b.y);
    // Move toward site until next to footprint edge.
    const edge = b.stats.radius + u.stats.radius + 0.5;
    if (d > edge + 0.2) {
      u.destX = b.x; u.destY = b.y;
    } else {
      u.destX = null; u.destY = null;
      u.vx = 0; u.vy = 0;
    }
  }

  // Auto-engage nearest enemy within sight.
  private tickIdle(w: World, u: Unit): void {
    if (u.stats.harvest && !u.holdPosition) {
      // Workers auto-resume harvest.
      const node = pickNearestResource(w, u);
      if (node) {
        u.state = 'harvest';
        u.resourceNodeId = node.id;
        u.destX = node.x;
        u.destY = node.y;
        return;
      }
    }
    if (!u.stats.weapon) return;
    const sight = u.stats.sightRange ?? u.stats.weapon.range + 2;
    const target = pickNearestEnemy(w, u, sight);
    if (target) {
      if (u.holdPosition) {
        // Fire in place if in range; do not chase.
        const d2 = (u.x - target.x) ** 2 + (u.y - target.y) ** 2;
        if (d2 <= u.stats.weapon.range * u.stats.weapon.range) {
          u.state = 'attack';
          u.targetId = target.id;
          u.targetIsBuilding = target.isBuilding;
          u.destX = null; u.destY = null;
          u.targetLocked = false;
        }
        return;
      }
      u.state = 'attack';
      u.targetId = target.id;
      u.targetIsBuilding = target.isBuilding;
      u.destX = target.x; u.destY = target.y;
      u.targetLocked = false;
    }
  }

  private tickMove(w: World, u: Unit): void {
    if (u.destX === null || u.destY === null) { u.state = 'idle'; return; }
    const d = dist(u.x, u.y, u.destX, u.destY);
    if (d < 1.2) {
      // If a morph is pending (Swarm drone), perform the transformation here:
      // consume the drone, spawn the building at this tile.
      if (u.pendingMorphKind) {
        performMorph(w, u);
        return;
      }
      u.state = 'idle';
      u.destX = null; u.destY = null;
      u.vx = 0; u.vy = 0;
      // If it's a worker with a refinery home, try harvest next.
      if (u.stats.harvest && u.cargo === 0) {
        const node = pickNearestResource(w, u);
        if (node) {
          u.state = 'harvest';
          u.resourceNodeId = node.id;
          u.destX = node.x; u.destY = node.y;
        }
      }
    }
  }

  private tickAttackMove(w: World, u: Unit): void {
    if (!u.stats.weapon) { this.tickMove(w, u); return; }
    // Scan for enemies around current pos.
    const sight = u.stats.sightRange ?? u.stats.weapon.range + 2;
    const target = pickNearestEnemy(w, u, sight);
    if (target) {
      u.targetId = target.id;
      u.targetIsBuilding = target.isBuilding;
      u.destX = target.x; u.destY = target.y;
      u.state = 'attack';
      u.targetLocked = false;
      return;
    }
    this.tickMove(w, u);
  }

  private tickAttack(w: World, u: Unit): void {
    // Validate target.
    if (u.targetId === null) { u.state = 'idle'; u.destX = null; u.destY = null; return; }
    let tx = 0, ty = 0, targetRadius = 0;
    let armed = true;
    let dead = false;
    let hp = 0;
    if (u.targetIsBuilding) {
      const b = w.buildings.findById(u.targetId);
      if (!b) { dead = true; }
      else { tx = b.x; ty = b.y; targetRadius = b.stats.radius; hp = b.hp; }
    } else {
      const t = w.units.findById(u.targetId);
      if (!t) { dead = true; }
      else { tx = t.x; ty = t.y; targetRadius = t.stats.radius; hp = t.hp; armed = !!t.stats.weapon; }
    }
    if (dead || hp <= 0) {
      u.targetId = null;
      u.targetLocked = false;
      u.state = 'idle';
      u.destX = null; u.destY = null;
      return;
    }

    // If we're free to re-target (not locked) and target is unarmed while a bigger threat is in sight — switch.
    if (!u.targetLocked && !u.targetIsBuilding && !armed && u.stats.weapon) {
      const sight = u.stats.sightRange ?? u.stats.weapon.range + 2;
      const alt = pickNearestArmedEnemy(w, u, sight);
      if (alt) {
        u.targetId = alt.id;
        u.targetIsBuilding = false;
        u.destX = alt.x; u.destY = alt.y;
        return;
      }
    }

    // Stay within weapon range — else approach (unless holding position).
    const w2 = u.stats.weapon;
    if (!w2) { u.state = 'idle'; return; }
    const range = w2.range;
    const standoff = Math.max(targetRadius + u.stats.radius + 0.5, range - 1.0);
    const d = dist(u.x, u.y, tx, ty);
    if (u.holdPosition) {
      // Fire only if in range; drop target otherwise.
      if (d > range) {
        u.targetId = null;
        u.state = 'idle';
      } else {
        u.vx = 0; u.vy = 0;
        u.destX = null; u.destY = null;
      }
      return;
    }
    if (d > standoff) {
      u.destX = tx; u.destY = ty;
    } else {
      u.vx = 0; u.vy = 0;
      u.destX = null; u.destY = null;
    }
  }

  private tickHarvest(w: World, u: Unit, dtMs: number): void {
    // States inside harvest:
    //  - If cargo full → go to refinery.
    //  - If near node → tick gather timer.
    //  - Else → move to node (destX/Y already set).
    if (!u.stats.harvest) { u.state = 'idle'; return; }
    if (u.cargo >= u.stats.harvest.capacity) {
      u.state = 'returnCargo';
      return;
    }
    const node = u.resourceNodeId !== null ? w.resources.findById(u.resourceNodeId) : null;
    if (!node) {
      const next = pickNearestResource(w, u);
      if (!next) { u.state = 'idle'; return; }
      u.resourceNodeId = next.id;
      u.destX = next.x; u.destY = next.y;
      return;
    }
    const d = dist(u.x, u.y, node.x, node.y);
    if (d > 1.5) {
      u.destX = node.x; u.destY = node.y;
      return;
    }
    u.vx = 0; u.vy = 0;
    u.destX = null; u.destY = null;
    u.gatherMs -= dtMs;
    if (u.gatherMs <= 0) {
      const amount = Math.min(u.stats.harvest.capacity - u.cargo, 20);
      u.cargo += amount;
      node.amount -= amount;
      u.gatherMs = u.stats.harvest.gatherMs / 3; // three "scoops" per load
      w.bus.emit('cargo:gathered', { unitId: u.id, amount });
      if (node.amount <= 0) {
        w.resources.release(node);
        u.resourceNodeId = null;
      }
    }
  }

  private tickReturnCargo(w: World, u: Unit): void {
    if (!u.stats.harvest) { u.state = 'idle'; return; }
    if (u.cargo <= 0) {
      u.state = 'harvest';
      u.destX = null; u.destY = null;
      return;
    }
    // Find nearest own refinery (or HQ fallback).
    const refinery = findOwnRefinery(w, u);
    if (!refinery) { u.state = 'idle'; return; }
    u.homeRefineryId = refinery.id;
    u.destX = refinery.x; u.destY = refinery.y;
    const edgeDist = dist(u.x, u.y, refinery.x, refinery.y) - refinery.stats.radius;
    if (edgeDist < ECONOMY.depositDistance) {
      // Deposit.
      const credits = u.cargo;
      u.cargo = 0;
      w.factions[u.faction].credits += credits;
      w.bus.emit('credits:deposited', { faction: u.faction, amount: credits, x: refinery.x, y: refinery.y });
      u.state = 'harvest';
      u.destX = null; u.destY = null;
      u.resourceNodeId = null; // force re-pick fresh node
    }
  }
}

// Consume a Swarm drone into its pending building — at the worker's current
// tile. Used by tickMove when the drone reaches the queued morph destination.
function performMorph(w: World, u: Unit): void {
  const kind = u.pendingMorphKind!;
  const stats = BUILDING_STATS[kind];
  const tx = Math.floor(u.x / MAP.tileSize) - Math.floor(stats.tileW / 2);
  const ty = Math.floor(u.y / MAP.tileSize) - Math.floor(stats.tileH / 2);
  // If the exact tile is no longer placeable (building went up between click and
  // arrival), scan a small neighborhood for the nearest valid footprint.
  let placeTx = tx, placeTy = ty;
  if (!footprintClear(w, tx, ty, stats.tileW, stats.tileH)) {
    let found = false;
    outer:
    for (let r = 1; r <= 4 && !found; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (footprintClear(w, tx + dx, ty + dy, stats.tileW, stats.tileH)) {
            placeTx = tx + dx; placeTy = ty + dy;
            found = true;
            break outer;
          }
        }
      }
    }
    if (!found) {
      // Drop the morph intent — drone keeps living as an idle worker.
      u.pendingMorphKind = null;
      u.state = 'idle';
      u.destX = null; u.destY = null;
      return;
    }
  }
  const b = spawnBuilding(w, u.faction, kind, placeTx, placeTy, false);
  if (b) {
    b.builderUnitId = null; // autonomous build
  }
  u.hp = 0; // cleanup releases the pool slot next tick
  u.pendingMorphKind = null;
}

function footprintClear(w: World, tx: number, ty: number, tw: number, th: number): boolean {
  for (let dy = 0; dy < th; dy++) {
    for (let dx = 0; dx < tw; dx++) {
      if (!w.navGrid.inBounds(tx + dx, ty + dy)) return false;
      if (w.navGrid.isBlocked(tx + dx, ty + dy)) return false;
    }
  }
  return true;
}

function pickNearestResource(w: World, u: Unit): ResourceNode | null {
  let best: ResourceNode | null = null;
  let bestD = Infinity;
  w.resources.forEachAlive((r) => {
    if (r.amount <= 0) return;
    const d = dist2(u.x, u.y, r.x, r.y);
    if (d < bestD) { best = r; bestD = d; }
  });
  return best;
}

function findOwnRefinery(w: World, u: Unit): Building | null {
  let best: Building | null = null;
  let bestD = Infinity;
  w.buildings.forEachAlive((b) => {
    if (b.faction !== u.faction) return;
    if (!b.completed) return;
    if (b.kind !== 'refinery' && b.kind !== 'hq') return;
    const d = dist2(u.x, u.y, b.x, b.y);
    if (d < bestD) { best = b; bestD = d; }
  });
  return best;
}

function pickNearestEnemy(w: World, u: Unit, sight: number): { id: number; x: number; y: number; isBuilding: boolean } | null {
  let best: { id: number; x: number; y: number; isBuilding: boolean } | null = null;
  let bestD = sight * sight;
  w.units.forEachAlive((o) => {
    if (!w.areHostile(o.faction, u.faction)) return;
    const d = dist2(u.x, u.y, o.x, o.y);
    if (d < bestD) { best = { id: o.id, x: o.x, y: o.y, isBuilding: false }; bestD = d; }
  });
  if (!best) {
    w.buildings.forEachAlive((b) => {
      if (!w.areHostile(b.faction, u.faction)) return;
      if (!b.completed) return;
      const d = dist2(u.x, u.y, b.x, b.y);
      if (d < bestD) { best = { id: b.id, x: b.x, y: b.y, isBuilding: true }; bestD = d; }
    });
  }
  return best;
}

function pickNearestArmedEnemy(w: World, u: Unit, sight: number): { id: number; x: number; y: number } | null {
  let best: { id: number; x: number; y: number } | null = null;
  let bestD = sight * sight;
  w.units.forEachAlive((o) => {
    if (!w.areHostile(o.faction, u.faction)) return;
    if (!o.stats.weapon) return;
    const d = dist2(u.x, u.y, o.x, o.y);
    if (d < bestD) { best = { id: o.id, x: o.x, y: o.y }; bestD = d; }
  });
  return best;
}
