# Tactical Engine Design

Date: 2026-04-26

## Decision

Build a universal tactical engine with the current RTS as the first game module.
The engine is not a general-purpose Unity-style engine. It is a focused runtime
for real-time command games: RTS, tower defense, arena battlers, battle labs,
and RPG-lite tactical scenarios.

The first milestone is an internal engine boundary inside this repository. We
will not extract an npm package until the boundaries survive at least two game
modes using the same runtime contracts.

## Goals

- Keep the current RTS playable while extracting reusable runtime contracts.
- Make RTS rules data-driven and module-owned instead of hard-coded in
  `startGameScene`.
- Support future modules such as tower defense and arena without changing core
  combat, movement, input, render, VFX, or devtool systems.
- Preserve the current fast iteration loop: Vite, Three.js, live inspector,
  Battle Lab, typecheck/build per commit.

## Non-Goals

- No multiplayer architecture in this phase.
- No scripting language.
- No external ECS framework.
- No asset editor or full map editor.
- No npm package extraction yet.
- No large rewrite that stops the current RTS from running.

## Target Shape

```txt
src/engine/
  core/        World, event bus, pools, system runner, clock
  sim/         movement, combat, targeting, projectiles, nav
  render/      Three.js adapter, camera, visibility adapters, mesh registry
  vfx/         presets, manager, budget, shader effects
  audio/       positional audio, visibility/fog gating
  input/       mouse/keyboard command intents
  ui/          generic selection and command surfaces
  devtools/    inspector bridge and live tuning transport

src/game/
  rts/
    content/   factions, units, buildings, weapons, damage matrix
    rules/     economy, production, power, tech tree, victory
    modes/     ffa, all-vs-you, battle-lab
    ui/        RTS command card, minimap, blueprint panel

  tower-defense/
    reserved for the second module proof

  arena/
    reserved for the second module proof
```

This is a destination shape, not a single-commit move. The first implementation
phase introduces the contracts while leaving most files in place, then migrates
call sites incrementally.

## Core Boundary

Engine code must not know concrete RTS content names:

- no Vanguard, Swarm, Titan;
- no HQ, barracks, refinery, credits, power as baked-in concepts;
- no `UnitKind` branches for named units inside generic movement/combat/render
  infrastructure.

Engine code may know generic tactical concepts:

- entity ids and pooled entity lifecycles;
- teams and hostility;
- transforms, movement intents, pathing requests;
- weapons, armor, damage, hit results;
- visibility/fog as a visibility provider, not necessarily RTS fog;
- selection and command intents;
- spawn/despawn events;
- VFX/audio events.

RTS module code owns:

- resources and income;
- buildings and build placement;
- production queues;
- power economy;
- tech prerequisites;
- faction rosters and balance;
- RTS-specific victory conditions;
- RTS-specific UI panels.

## First-Class Interfaces

### GameModule

```ts
export interface GameModule {
  id: string;
  displayName: string;
  content: GameContent;
  systems: SystemFactory[];
  modes: GameModeDefinition[];
}
```

`GameModule` groups content, systems, and modes. The RTS module will be the
first implementation.

### GameModeDefinition

```ts
export interface GameModeDefinition {
  id: string;
  displayName: string;
  description: string;
  setup(ctx: GameSetupContext): void;
  systems(ctx: GameSetupContext): SystemFactory[];
  objectives(ctx: GameSetupContext): GameObjective[];
}
```

The current `ffa`, `allVsYou`, and `playground` branches become mode
definitions. Battle Lab should stay a mode, not a special case scattered across
scene setup.

### SystemPipeline

```ts
export interface SystemPipeline {
  init(world: World): void;
  update(world: World, dtMs: number): void;
  destroy(): void;
}
```

The fixed update order remains explicit. Modules contribute systems, but the
scene runner owns ordering and lifecycle.

### SpawnService

```ts
export interface SpawnService {
  unit(input: SpawnUnitInput): number | null;
  building(input: SpawnBuildingInput): number | null;
  projectile(input: SpawnProjectileInput): number | null;
  resource(input: SpawnResourceInput): number | null;
}
```

Spawning should move out of scene setup and individual systems. Battle Lab,
production, AI, waves, and scripted encounters should all use the same API.

### TeamRules

```ts
export interface TeamRules {
  areHostile(a: TeamId, b: TeamId): boolean;
  areAllied(a: TeamId, b: TeamId): boolean;
}
```

Faction-specific team setup becomes mode data. Engine systems query hostility
through this contract instead of assuming RTS faction state.

### GameObjective

```ts
export interface GameObjective {
  id: string;
  update(world: World): ObjectiveResult | null;
}
```

RTS can implement "HQ destroyed". Tower defense can implement "base lives
reached zero". Arena can implement "round timer/capture score".

### ContentRegistry

```ts
export interface ContentRegistry {
  units: DefinitionRegistry<UnitDefinition>;
  buildings: DefinitionRegistry<BuildingDefinition>;
  weapons: DefinitionRegistry<WeaponDefinition>;
  factions: DefinitionRegistry<FactionDefinition>;
}
```

The registry lets generic systems resolve stats without importing RTS config
files directly.

## Data Flow

Runtime flow remains event-driven:

```txt
Input
  emits command intents
Command/Rules
  mutate entity intent state
Sim systems
  move, target, attack, apply damage
Event bus
  publishes gameplay facts
Render/VFX/Audio/UI
  listen and visualize
Objectives
  decide win/loss/round state
Cleanup
  releases pooled entities
```

The important rule is that gameplay systems emit facts and do not create Three.js
objects directly. Render, VFX, audio, and UI remain consumers of world state and
events.

## Migration Plan

### Phase 1: Contracts Without Moving Everything

- Add `src/engine/core/gameModule.ts` with `GameModule`,
  `GameModeDefinition`, `GameObjective`, `SystemFactory`, and setup context
  types.
- Add `SpawnService` as a thin wrapper over the existing pools and current
  `initUnit` / `spawnBuilding` helpers.
- Move current `ffa`, `allVsYou`, and `playground` setup branches into
  declarative mode definitions while keeping the same behavior.
- Keep existing config paths until the contracts are exercised.

### Phase 2: RTS Module Boundary

- Create `src/game/rts/`.
- Move RTS-only mode definitions, economy/production/power/victory rules, and
  command card wiring under the RTS module.
- Keep generic sim systems in shared engine locations.
- Replace direct imports from generic systems to RTS configs with registry
  access where needed.

### Phase 3: Second Mode Proof

- Add a minimal `arena` or `tower-defense` module with reused movement, combat,
  VFX, input, and spawn service.
- No full game needed. The proof is one working scenario that does not use RTS
  economy/buildings but still shares the engine pipeline.

## Testing Strategy

- Typecheck after every phase.
- Production build after every phase.
- Browser smoke tests:
  - RTS FFA starts and spawns bases/resources.
  - RTS Battle Lab starts with no bases/resources and can spawn units.
  - Dev panel still opens and live-tunes unit stats.
  - No console errors after mode transitions.
- Contract tests can be added for pure services:
  - `SpawnService` returns ids or `null` on pool overflow.
  - `TeamRules` hostility is symmetric and respects alliances.
  - `GameObjective` emits a single terminal result.

## Risks

- Over-extraction can slow gameplay work. Mitigation: only extract contracts
  used by the current RTS and Battle Lab first.
- Moving configs too early can create alias churn. Mitigation: introduce
  registries before relocating files.
- Generic names can hide RTS assumptions. Mitigation: the second module proof is
  required before package extraction.
- `startGameScene` can become a new god object. Mitigation: move setup into
  `GameModeDefinition` and spawning into `SpawnService`.

## Acceptance Criteria For First Refactor

- Current RTS FFA behavior remains playable.
- Current All vs You behavior remains playable.
- Current Battle Lab behavior remains playable and still has no prebuilt bases.
- `startGameScene` no longer manually branches all mode setup details.
- At least one mode is defined through `GameModeDefinition`.
- Spawning for Battle Lab and starter RTS entities uses `SpawnService`.
- `npm run typecheck` and `npm run build` pass.
