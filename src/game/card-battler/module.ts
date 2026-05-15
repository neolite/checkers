import type { GameRoute } from '@engine/core/runtime';
import { startCardBattlerScene } from './scene';

export const CARD_BATTLER_ROUTE: GameRoute = {
  id: 'card-battler',
  displayName: 'Arcane Duel',
  start(ctx) {
    return startCardBattlerScene(ctx.host, ctx.exitToMenu);
  },
};
