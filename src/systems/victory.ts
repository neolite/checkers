import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import { FACTION_IDS } from '@config/palette';

// Victory check runs BEFORE cleanup, so freshly zero-HP HQs trigger endings
// before the pool releases them.
export class VictorySystem implements ISystem {
  readonly name = 'victory';

  init(_w: World): void {}

  update(w: World, _dtMs: number): void {
    if (w.victoryDetermined) return;
    const hqAlive: Record<string, boolean> = {};
    for (const id of FACTION_IDS) hqAlive[id] = false;

    w.buildings.forEachAlive((b) => {
      if (b.kind === 'hq' && b.hp > 0) hqAlive[b.faction] = true;
    });

    for (const id of FACTION_IDS) {
      const fs = w.factions[id];
      if (fs.alive && !hqAlive[id]) {
        fs.alive = false;
        w.bus.emit('hq:destroyed', { faction: id });
        if (id === w.playerFaction) {
          w.bus.emit('game:defeat', { loser: id });
          w.victoryDetermined = true;
        }
      }
    }

    // Count surviving factions.
    const survivors = FACTION_IDS.filter((id) => w.factions[id].alive);
    if (survivors.length <= 1 && !w.victoryDetermined) {
      const winner = survivors[0];
      if (winner) {
        w.bus.emit('game:victory', { winner });
      }
      w.victoryDetermined = true;
    }
  }
}
