import { renderGameHub } from '@game/hub/menu';
import { GameRouter } from '@engine/core/runtime';

const host = document.getElementById('app');
if (!host) {
  throw new Error('#app host element missing in index.html');
}

if (import.meta.env.DEV) {
  void import('./dev/inspectorBridge').then((m) => m.installInspectorBridge());
}

const router = new GameRouter(host, ({ start }) => {
  renderGameHub(host, start);
});

router.showMenu();
