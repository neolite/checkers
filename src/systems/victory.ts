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
      }
    }

    // Team-level win condition. Last team standing wins; if the player's team is
    // extinct, game over. Works for both FFA (3 teams) and All-vs-You (2 teams).
    const aliveTeams = new Set<number>();
    for (const id of FACTION_IDS) {
      if (w.factions[id].alive) aliveTeams.add(w.factions[id].team);
    }
    const playerTeam = w.factions[w.playerFaction].team;
    if (!aliveTeams.has(playerTeam)) {
      w.bus.emit('game:defeat', { loser: w.playerFaction });
      w.victoryDetermined = true;
      return;
    }
    if (aliveTeams.size <= 1) {
      // Someone won — pick any surviving faction on that team as the visible winner.
      const winner = FACTION_IDS.find((id) => w.factions[id].alive) ?? null;
      if (winner) w.bus.emit('game:victory', { winner });
      w.victoryDetermined = true;
    }
  }
}
