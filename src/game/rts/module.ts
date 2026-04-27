import type { FactionId } from '@config/palette';
import type { GameRoute } from '@engine/core/runtime';
import { startGameScene, type GameMode } from '@game/rts/scene';

export interface RtsLaunchOptions {
  faction: FactionId;
  mode: GameMode;
}

export const RTS_GAME_ROUTE: GameRoute<RtsLaunchOptions> = {
  id: 'rts',
  displayName: 'RTS',
  start(ctx, options) {
    return startGameScene(ctx.host, options.faction, options.mode, ctx.exitToMenu);
  },
};
