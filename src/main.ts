import { renderMenu } from '@game/rts/ui/menu';
import { GameRouter } from '@engine/core/runtime';
import { RTS_GAME_ROUTE } from '@game/rts/module';
import { ROGUELIKE_ROUTE } from '@game/roguelike/module';
import { TOWER_DEFENSE_ROUTE } from '@game/tower-defense/module';
import type { FactionId } from '@config/palette';

const host = document.getElementById('app');
if (!host) {
  throw new Error('#app host element missing in index.html');
}

if (import.meta.env.DEV) {
  void import('./dev/inspectorBridge').then((m) => m.installInspectorBridge());
}

const router = new GameRouter(host, ({ start }) => {
  renderMenu(
    host,
    (faction: FactionId, mode) => {
      start(RTS_GAME_ROUTE, { faction, mode });
    },
    () => {
      start(TOWER_DEFENSE_ROUTE, {});
    },
    () => {
      start(ROGUELIKE_ROUTE, {});
    },
  );
});

router.showMenu();
