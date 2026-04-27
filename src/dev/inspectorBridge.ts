import * as Gameplay from '@config/gameplay';
import { BUILDING_STATS } from '@game/rts/content/buildings';
import { UNIT_STATS } from '@game/rts/content/units';
import { DAMAGE_MATRIX } from '@game/rts/content/matrix';
import { FACTIONS } from '@game/rts/content/factions';
import * as Palette from '@config/palette';
import { FX_TUNING } from '@config/fx';
import { UI_LAYOUT } from '@config/uiLayout';

type RootMap = Record<string, unknown>;

const roots: RootMap = {
  MAP: Gameplay.MAP,
  WORLD: Gameplay.WORLD,
  SIM: Gameplay.SIM,
  CAMERA: Gameplay.CAMERA,
  FOG: Gameplay.FOG,
  ECONOMY: Gameplay.ECONOMY,
  VICTORY: Gameplay.VICTORY,
  AI_TUNING: Gameplay.AI_TUNING,
  UI: Gameplay.UI,
  BUILDING_STATS,
  UNIT_STATS,
  DAMAGE_MATRIX,
  FACTIONS,
  FACTION_COLORS: Palette.FACTION_COLORS,
  NEUTRAL_COLORS: Palette.NEUTRAL_COLORS,
  PLAYER_COLOR: Palette.PLAYER_COLOR,
  ENEMY_COLOR: Palette.ENEMY_COLOR,
  FX_TUNING,
  UI_LAYOUT,
};

export interface InspectorPatch {
  type: 'patch';
  path: string;
  value: unknown;
}

export function installInspectorBridge(): void {
  const patchChannel = new BroadcastChannel('patch');
  const snapshotChannel = new BroadcastChannel('snapshot');

  const postSnapshot = (): void => {
    snapshotChannel.postMessage({
      type: 'snapshot',
      roots: cloneRoots(),
      at: Date.now(),
    });
  };

  patchChannel.addEventListener('message', (ev: MessageEvent<InspectorPatch | { type: 'requestSnapshot' }>) => {
    if (!ev.data) return;
    if (ev.data.type === 'requestSnapshot') {
      postSnapshot();
      return;
    }
    if (ev.data.type !== 'patch') return;
    deepSet(roots, ev.data.path, ev.data.value);
    postSnapshot();
  });

  window.addEventListener('beforeunload', () => {
    patchChannel.close();
    snapshotChannel.close();
  });

  // Let an already-open inspector hydrate when the game tab starts.
  postSnapshot();
}

function cloneRoots(): RootMap {
  return JSON.parse(JSON.stringify(roots)) as RootMap;
}

function deepSet(rootMap: RootMap, dottedPath: string, value: unknown): void {
  const parts = dottedPath.split('.').filter(Boolean);
  if (parts.length === 0) return;
  const rootName = parts[0]!;
  const root = rootMap[rootName];
  if (root === undefined) return;
  if (parts.length === 1) return;

  let cursor: unknown = root;
  for (let i = 1; i < parts.length - 1; i++) {
    if (!isRecord(cursor)) return;
    cursor = cursor[parts[i]!];
  }
  if (!isRecord(cursor)) return;
  cursor[parts[parts.length - 1]!] = value;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
