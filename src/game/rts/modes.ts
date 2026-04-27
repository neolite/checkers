import { FACTIONS } from '@config/factions';
import { ECONOMY, MAP, WORLD } from '@config/gameplay';
import { FACTION_IDS, type FactionId } from '@config/palette';
import type { GameModeDefinition, GameObjective, GameSetupContext, SystemFactory } from '@engine/core/gameModule';
import { nearestOpenWorldPoint, type SpawnService } from '@engine/core/spawnService';
import type { World } from '@engine/world';
import { applyFactionMods } from '@entities/create';

export type RtsModeId = 'ffa' | 'allVsYou' | 'playground';

export const RTS_CORNERS: Record<FactionId, { x: number; y: number }> = {
  vanguard: { x: 10, y: 10 },
  swarm: { x: WORLD.width - 14, y: 10 },
  titan: { x: WORLD.width / 2, y: WORLD.depth - 14 },
};

export const RTS_MODES: readonly GameModeDefinition<RtsModeId, SpawnService>[] = [
  {
    id: 'ffa',
    displayName: 'Free-for-all',
    description: 'Three teams, one each. Everyone fights everyone.',
    setup: (ctx) => setupStandardRts(ctx, 'ffa'),
    systems: noExtraSystems,
    objectives: noExtraObjectives,
  },
  {
    id: 'allVsYou',
    displayName: 'All vs You',
    description: 'Both AI factions are allied against you.',
    setup: (ctx) => setupStandardRts(ctx, 'allVsYou'),
    systems: noExtraSystems,
    objectives: noExtraObjectives,
  },
  {
    id: 'playground',
    displayName: 'Battle Lab',
    description: 'Empty revealed map with unit spawn controls and live config tuning.',
    setup: setupBattleLab,
    systems: noExtraSystems,
    objectives: noExtraObjectives,
  },
];

export function isBattleLab(mode: RtsModeId): boolean {
  return mode === 'playground';
}

export function getRtsCameraTarget(playerFaction: FactionId, mode: RtsModeId): { x: number; y: number } {
  if (mode === 'playground') return { x: WORLD.width / 2, y: WORLD.depth / 2 };
  const corner = RTS_CORNERS[playerFaction];
  return { x: corner.x, y: corner.y + 10 };
}

export function syncBattleLabLiveUnitStats(world: World): void {
  world.units.forEachAlive((u) => {
    if (u.hp <= 0) return;
    const oldMax = Math.max(1, u.stats.maxHp);
    const hpRatio = Math.max(0, Math.min(1, u.hp / oldMax));
    const nextStats = applyFactionMods(u.kind, FACTIONS[u.faction].mods);
    u.stats = nextStats;
    if (nextStats.maxHp !== oldMax) {
      u.hp = Math.max(1, Math.min(nextStats.maxHp, Math.round(nextStats.maxHp * hpRatio)));
    }
  });
}

function setupStandardRts(ctx: GameSetupContext<SpawnService>, mode: RtsModeId): void {
  const { world, spawn } = ctx;
  for (const id of FACTION_IDS) {
    world.factions[id].credits = ECONOMY.startingCredits;
  }

  if (mode === 'allVsYou') {
    world.factions[world.playerFaction].team = 1;
    for (const id of FACTION_IDS) {
      if (id !== world.playerFaction) world.factions[id].team = 2;
    }
  }

  for (const id of FACTION_IDS) {
    const corner = RTS_CORNERS[id];
    const tileX = Math.floor(corner.x / MAP.tileSize);
    const tileY = Math.floor(corner.y / MAP.tileSize);
    const hq = spawn.building({ faction: id, kind: 'hq', tileX, tileY, preBuilt: true });
    if (!hq) continue;

    const meta = FACTIONS[id];
    for (let i = 0; i < 2; i++) {
      spawn.unit({
        faction: id,
        kind: meta.workerKind,
        x: hq.x + (i - 0.5) * MAP.tileSize * 1.2,
        y: hq.y + MAP.tileSize * 3.0,
      });
    }
  }

  spawnRtsResources(ctx);
}

function setupBattleLab(ctx: GameSetupContext<SpawnService>): void {
  const { world } = ctx;
  for (const id of FACTION_IDS) {
    world.factions[id].credits = 0;
    world.factions[id].isHuman = true;
  }
}

function spawnRtsResources(ctx: GameSetupContext<SpawnService>): void {
  const { world, spawn } = ctx;
  const spots: Array<[number, number]> = [
    [RTS_CORNERS.vanguard.x + 14, RTS_CORNERS.vanguard.y + 4],
    [RTS_CORNERS.vanguard.x + 4, RTS_CORNERS.vanguard.y + 14],
    [RTS_CORNERS.swarm.x - 14, RTS_CORNERS.swarm.y + 4],
    [RTS_CORNERS.swarm.x - 4, RTS_CORNERS.swarm.y + 14],
    [RTS_CORNERS.titan.x - 10, RTS_CORNERS.titan.y - 4],
    [RTS_CORNERS.titan.x + 10, RTS_CORNERS.titan.y - 4],
    [WORLD.width / 2, WORLD.depth / 2 - 6],
    [WORLD.width / 2 - 12, WORLD.depth / 2],
    [WORLD.width / 2 + 12, WORLD.depth / 2],
    [WORLD.width / 2, WORLD.depth / 2 + 12],
  ];

  for (const [x, y] of spots) {
    const point = nearestOpenWorldPoint(world, x, y);
    spawn.resource({ x: point.x, y: point.y, amount: 1800 });
  }
}

function noExtraSystems(_ctx: GameSetupContext<SpawnService>): readonly SystemFactory<SpawnService>[] {
  return [];
}

function noExtraObjectives(_ctx: GameSetupContext<SpawnService>): readonly GameObjective[] {
  return [];
}
