import { renderMenu } from '@ui/menu';
import { startGameScene } from '@scenes/gameScene';
import type { FactionId } from '@config/palette';

const host = document.getElementById('app');
if (!host) {
  throw new Error('#app host element missing in index.html');
}

function showMenu(): void {
  renderMenu(host!, (faction: FactionId) => {
    // Clear menu + launch game.
    host!.innerHTML = '';
    startGameScene(host!, faction, () => {
      host!.innerHTML = '';
      showMenu();
    });
  });
}

showMenu();
