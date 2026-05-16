import { APP_BOOT_CONFIG } from '@config/app';
import { renderGameHub } from '@game/hub/menu';
import { GAME_ROUTES } from '@game/catalog';
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

if (APP_BOOT_CONFIG.mode === 'single') {
  if (APP_BOOT_CONFIG.game === 'rts') {
    router.start(GAME_ROUTES.rts, APP_BOOT_CONFIG.options);
  } else {
    router.start(GAME_ROUTES[APP_BOOT_CONFIG.game], {});
  }
} else {
  router.showMenu();
}
