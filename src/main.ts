import { renderMenu } from '@ui/menu';
import { startGameScene } from '@scenes/gameScene';
import type { FactionId } from '@config/palette';

const host = document.getElementById('app');
if (!host) {
  throw new Error('#app host element missing in index.html');
}

if (import.meta.env.DEV) {
  void import('./dev/inspectorBridge').then((m) => m.installInspectorBridge());
}

function showMenu(): void {
  renderMenu(host!, (faction: FactionId, mode) => {
    // Clear menu + launch game.
    host!.innerHTML = '';
    startGameScene(host!, faction, mode, () => {
      host!.innerHTML = '';
      showMenu();
    });
  });
}

showMenu();
