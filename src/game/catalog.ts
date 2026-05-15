import { CARD_BATTLER_ROUTE } from '@game/card-battler/module';
import { CHECKERS_ROUTE } from '@game/checkers/module';
import { ROGUELIKE_ROUTE } from '@game/roguelike/module';
import { RTS_GAME_ROUTE } from '@game/rts/module';
import { TOWER_DEFENSE_ROUTE } from '@game/tower-defense/module';

export const GAME_ROUTES = {
  rts: RTS_GAME_ROUTE,
  towerDefense: TOWER_DEFENSE_ROUTE,
  roguelike: ROGUELIKE_ROUTE,
  checkers: CHECKERS_ROUTE,
  cardBattler: CARD_BATTLER_ROUTE,
} as const;

export type GameRouteId = keyof typeof GAME_ROUTES;
