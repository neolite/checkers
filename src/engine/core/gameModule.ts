import type { World } from '@engine/world';
import type { ISystem } from '@engine/systems/iface';

export type SystemFactory<TSpawn = unknown> = (ctx: GameSetupContext<TSpawn>) => ISystem;

export interface GameSetupContext<TSpawn = unknown> {
  world: World;
  spawn: TSpawn;
}

export interface GameObjective<TResultId extends string = string> {
  readonly id: string;
  update(world: World): ObjectiveResult<TResultId> | null;
}

export type ObjectiveResult<TResultId extends string = string> =
  | { type: 'victory'; winner: TResultId | null }
  | { type: 'defeat'; loser: TResultId };

export interface GameModeDefinition<
  TModeId extends string = string,
  TSpawn = unknown,
  TResultId extends string = string,
> {
  readonly id: TModeId;
  readonly displayName: string;
  readonly description: string;
  setup(ctx: GameSetupContext<TSpawn>): void;
  systems(ctx: GameSetupContext<TSpawn>): readonly SystemFactory<TSpawn>[];
  objectives(ctx: GameSetupContext<TSpawn>): readonly GameObjective<TResultId>[];
}

export interface GameModule<
  TModeId extends string = string,
  TSpawn = unknown,
  TResultId extends string = string,
> {
  readonly id: string;
  readonly displayName: string;
  readonly modes: readonly GameModeDefinition<TModeId, TSpawn, TResultId>[];
}

export function findMode<TModeId extends string, TSpawn = unknown, TResultId extends string = string>(
  modes: readonly GameModeDefinition<TModeId, TSpawn, TResultId>[],
  id: TModeId,
): GameModeDefinition<TModeId, TSpawn, TResultId> {
  const mode = modes.find((m) => m.id === id);
  if (!mode) throw new Error(`Unknown game mode: ${id}`);
  return mode;
}
