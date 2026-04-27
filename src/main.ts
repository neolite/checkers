import { renderMenu } from '@game/rts/ui/menu';
import { startGameScene } from '@game/rts/scene';
import { startRoguelikeScene } from '@game/roguelike/scene';
import { startTowerDefenseScene } from '@game/tower-defense/scene';
import type { FactionId } from '@config/palette';

const host = document.getElementById('app');
if (!host) {
  throw new Error('#app host element missing in index.html');
}

if (import.meta.env.DEV) {
  void import('./dev/inspectorBridge').then((m) => m.installInspectorBridge());
}

function showMenu(): void {
  renderMenu(
    host!,
    (faction: FactionId, mode) => {
      // Clear menu + launch game.
      host!.innerHTML = '';
      startGameScene(host!, faction, mode, () => {
        host!.innerHTML = '';
        showMenu();
      });
    },
    () => {
      host!.innerHTML = '';
      startTowerDefenseScene(host!, () => {
        host!.innerHTML = '';
        showMenu();
      });
    },
    () => {
      host!.innerHTML = '';
      startRoguelikeScene(host!, () => {
        host!.innerHTML = '';
        showMenu();
      });
    },
  );
}

showMenu();
