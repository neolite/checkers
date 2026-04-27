import type { GameRoute } from '@engine/core/runtime';
import { startTowerDefenseScene } from '@game/tower-defense/scene';

export const TOWER_DEFENSE_ROUTE: GameRoute = {
  id: 'tower-defense',
  displayName: 'Tripod Defense',
  start(ctx) {
    return startTowerDefenseScene(ctx.host, ctx.exitToMenu);
  },
};
