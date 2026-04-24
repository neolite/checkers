import type { World } from '@engine/world';

export interface ISystem {
  readonly name: string;
  init(world: World): void;
  update(world: World, dtMs: number): void;
}
