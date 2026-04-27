import type { GameRoute } from '@engine/core/runtime';
import { startRoguelikeScene } from '@game/roguelike/scene';

export const ROGUELIKE_ROUTE: GameRoute = {
  id: 'roguelike',
  displayName: 'Roguelike',
  start(ctx) {
    return startRoguelikeScene(ctx.host, ctx.exitToMenu);
  },
};
