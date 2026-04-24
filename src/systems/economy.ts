import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import { FACTION_IDS } from '@config/palette';

// Recalculates power produced/consumed and credits trickle. Minimal.
export class EconomySystem implements ISystem {
  readonly name = 'economy';

  init(_w: World): void { /* noop */ }

  update(w: World, _dtMs: number): void {
    for (const id of FACTION_IDS) {
      w.factions[id].powerProduced = 0;
      w.factions[id].powerConsumed = 0;
    }
    w.buildings.forEachAlive((b) => {
      if (!b.completed) return;
      const fs = w.factions[b.faction];
      if (b.stats.power >= 0) fs.powerProduced += b.stats.power;
      else fs.powerConsumed += -b.stats.power;
    });
  }
}
