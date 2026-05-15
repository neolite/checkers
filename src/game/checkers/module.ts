import type { GameRoute } from '@engine/core/runtime';
import { startCheckersScene } from './scene';

export const CHECKERS_ROUTE: GameRoute = {
  id: 'checkers',
  displayName: 'Premium Checkers',
  start(ctx) {
    return startCheckersScene(ctx.host, ctx.exitToMenu);
  },
};
