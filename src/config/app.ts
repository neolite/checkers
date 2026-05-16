import type { FactionId } from '@config/palette';

export type RtsBootMode = 'ffa' | 'allVsYou' | 'playground';
export type SingleGameId = 'rts' | 'towerDefense' | 'roguelike' | 'checkers' | 'cardBattler';

export type AppBootConfig =
  | { readonly mode: 'hub' }
  | {
      readonly mode: 'single';
      readonly game: 'rts';
      readonly options: {
        readonly faction: FactionId;
        readonly mode: RtsBootMode;
      };
    }
  | {
      readonly mode: 'single';
      readonly game: Exclude<SingleGameId, 'rts'>;
    };

export const APP_BOOT_CONFIG: AppBootConfig = {
  mode: 'hub',
  // For focused dev/demo runs, switch to one of:
  // { mode: 'single', game: 'rts', options: { faction: 'vanguard', mode: 'playground' } }
  // { mode: 'single', game: 'cardBattler' }
  // { mode: 'single', game: 'checkers' }
  // { mode: 'single', game: 'towerDefense' }
  // { mode: 'single', game: 'roguelike' }
};
