import type { World } from '@engine/world';
import type { ISystem } from '@systems/iface';

export type SystemFactory<TSpawn = unknown> = (ctx: GameSetupContext<TSpawn>) => ISystem;

export interface GameSetupContext<TSpawn = unknown> {
  world: World;
  spawn: TSpawn;
}

export interface GameObjective {
  readonly id: string;
  update(world: World): ObjectiveResult | null;
}

export type ObjectiveResult =
  | { type: 'victory'; winner: string | null }
  | { type: 'defeat'; loser: string };

export interface GameModeDefinition<TModeId extends string = string, TSpawn = unknown> {
  readonly id: TModeId;
  readonly displayName: string;
  readonly description: string;
  setup(ctx: GameSetupContext<TSpawn>): void;
  systems(ctx: GameSetupContext<TSpawn>): SystemFactory<TSpawn>[];
  objectives(ctx: GameSetupContext<TSpawn>): GameObjective[];
}

export interface GameModule<TModeId extends string = string, TSpawn = unknown> {
  readonly id: string;
  readonly displayName: string;
  readonly modes: readonly GameModeDefinition<TModeId, TSpawn>[];
}

export function findMode<TModeId extends string, TSpawn = unknown>(
  modes: readonly GameModeDefinition<TModeId, TSpawn>[],
  id: TModeId,
): GameModeDefinition<TModeId, TSpawn> {
  const mode = modes.find((m) => m.id === id);
  if (!mode) throw new Error(`Unknown game mode: ${id}`);
  return mode;
}
