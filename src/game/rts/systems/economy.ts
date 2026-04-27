import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import { FACTION_IDS } from '@config/palette';
import { powerSnapshot } from '@game/rts/power';

// Recalculates power produced/consumed and credits trickle. Minimal.
export class EconomySystem implements ISystem {
  readonly name = 'economy';

  init(_w: World): void { /* noop */ }

  update(w: World, _dtMs: number): void {
    for (const id of FACTION_IDS) {
      const snap = powerSnapshot(w, id);
      w.factions[id].powerProduced = snap.produced;
      w.factions[id].powerConsumed = snap.consumed;
    }
  }
}
