import type { ISystem } from '@engine/systems/iface';
import type { World } from '@engine/world';
import { FOG, MAP, SIM } from '@config/gameplay';
import type { FogOverlay } from '@render/fogOverlay';
import { FACTION_IDS } from '@config/palette';

// Updates per-faction fog grids. Writes player-faction fog to the render overlay.
export class FogSystem implements ISystem {
  readonly name = 'fog';
  private lastRunMs = 0;
  private overlay: FogOverlay;

  constructor(overlay: FogOverlay) {
    this.overlay = overlay;
  }

  init(_w: World): void { /* noop */ }

  update(w: World, dtMs: number): void {
    this.lastRunMs += dtMs;
    const interval = 1000 / SIM.fogHz;
    if (this.lastRunMs < interval) return;
    this.lastRunMs = 0;

    // Down-step: visible → explored. Keep unexplored untouched.
    for (const id of FACTION_IDS) {
      const g = w.factions[id].fog;
      for (let i = 0; i < g.length; i++) {
        if (g[i] === FOG.visible) g[i] = FOG.explored;
      }
    }

    // Write "visible" tiles around each entity based on its sight.
    w.units.forEachAlive((u) => {
      const sight = u.stats.sightRange ?? (u.stats.weapon?.range ?? 0) + 4;
      if (sight <= 0) return;
      this.stampCircle(w.factions[u.faction].fog, u.x, u.y, sight);
    });
    w.buildings.forEachAlive((b) => {
      if (!b.completed) return;
      this.stampCircle(w.factions[b.faction].fog, b.x, b.y, b.stats.sightRange);
    });

    // Write buildings-under-construction with smaller sight so you can see your own site.
    w.buildings.forEachAlive((b) => {
      if (b.completed) return;
      this.stampCircle(w.factions[b.faction].fog, b.x, b.y, 4);
    });

    // Push to overlay for the player.
    const playerFog = w.factions[w.playerFaction].fog;
    this.overlay.paint(playerFog);
    w.bus.emit('fog:revealed', {});
  }

  private stampCircle(grid: Uint8Array, wx: number, wy: number, radius: number): void {
    const tileR = Math.ceil(radius / MAP.tileSize);
    const cx = Math.floor(wx / MAP.tileSize);
    const cy = Math.floor(wy / MAP.tileSize);
    const r2 = tileR * tileR;
    for (let dy = -tileR; dy <= tileR; dy++) {
      for (let dx = -tileR; dx <= tileR; dx++) {
        if (dx * dx + dy * dy > r2) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || ty < 0 || tx >= FOG.gridW || ty >= FOG.gridH) continue;
        grid[ty * FOG.gridW + tx] = FOG.visible;
      }
    }
  }
}
