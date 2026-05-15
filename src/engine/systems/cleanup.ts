import type { ISystem } from '@engine/systems/iface';
import type { World } from '@engine/world';
import type { RenderBridge } from '@render/sync';

// Releases dead entities back to their pools, unstamps nav grid for demolished buildings,
// and tells the render bridge to drop their meshes.
export class CleanupSystem implements ISystem {
  readonly name = 'cleanup';
  private bridge: RenderBridge;

  constructor(bridge: RenderBridge) {
    this.bridge = bridge;
  }

  init(_w: World): void {}

  update(w: World, _dtMs: number): void {
    // Units
    w.units.forEachAlive((u) => {
      if (u.hp <= 0) {
        // If this unit was supervising a building, clear the link so construction can
        // either resume (if quickset rules) or stall pending a fresh builder.
        if (u.buildTargetId !== null) {
          const b = w.buildings.findById(u.buildTargetId);
          if (b && b.builderUnitId === u.id) b.builderUnitId = null;
        }
        w.bus.emit('unit:died', { id: u.id, x: u.x, y: u.y, faction: u.faction });
        this.bridge.removeUnit(u.id);
        w.selectedUnits.delete(u.id);
        w.units.release(u);
      }
    });
    // Buildings
    w.buildings.forEachAlive((b) => {
      if (b.hp <= 0) {
        w.bus.emit('building:destroyed', { id: b.id, kind: b.kind, faction: b.faction, x: b.x, y: b.y });
        w.navGrid.stampRect(b.tileX, b.tileY, b.stats.tileW, b.stats.tileH, false);
        this.bridge.removeBuilding(b.id);
        w.selectedBuildings.delete(b.id);
        w.buildings.release(b);
      }
    });
    // Resources (depleted handled inside UnitAI; just drop stale views).
    w.resources.forEachAlive((r) => {
      if (!r.alive || r.amount <= 0) {
        this.bridge.removeResource(r.id);
        w.resources.release(r);
      }
    });

    // Flow-field GC
    w.gcFlowFields(w.tNow);
  }
}
