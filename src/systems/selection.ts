import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import { worldToScreen } from '@render/picking';

export class SelectionSystem implements ISystem {
  readonly name = 'selection';

  init(w: World): void {
    w.bus.on('input:selectSingle', ({ id, additive }) => {
      if (!additive) {
        w.selectedUnits.clear();
        w.selectedBuildings.clear();
      }
      if (id === null) return;
      const u = w.units.findById(id);
      if (u && u.faction === w.playerFaction) {
        w.selectedUnits.add(u.id);
        return;
      }
      const b = w.buildings.findById(id);
      if (b && b.faction === w.playerFaction) {
        // Allow selecting own incomplete buildings too — player wants to watch
        // construction progress. Command card gates actions by `b.completed`.
        w.selectedBuildings.clear();
        w.selectedBuildings.add(b.id);
      }
    });

    w.bus.on('input:selectBox', ({ minX, minY, maxX, maxY, additive }) => {
      if (!additive) {
        w.selectedUnits.clear();
        w.selectedBuildings.clear();
      }
      const camera = w.three.camera;
      if (!camera) return;
      const width = window.innerWidth;
      const height = window.innerHeight;
      let any = false;
      w.units.forEachAlive((u) => {
        if (u.faction !== w.playerFaction) return;
        const p = worldToScreen(camera, u.x, u.stats.altitude, u.y, width, height);
        if (p.behind) return;
        if (p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY) {
          w.selectedUnits.add(u.id);
          any = true;
        }
      });
      // Drag-select never selects buildings (standard RTS convention).
      if (any) w.selectedBuildings.clear();
    });

    w.bus.on('input:select', ({ ids, additive }) => {
      if (!additive) w.selectedUnits.clear();
      for (const id of ids) {
        const u = w.units.findById(id);
        if (u && u.faction === w.playerFaction) w.selectedUnits.add(id);
      }
    });

    w.bus.on('unit:died', ({ id }) => {
      w.selectedUnits.delete(id);
    });
    w.bus.on('building:destroyed', ({ id }) => {
      w.selectedBuildings.delete(id);
    });
  }

  update(_w: World, _dtMs: number): void {
    // no-op — event-driven
  }
}
