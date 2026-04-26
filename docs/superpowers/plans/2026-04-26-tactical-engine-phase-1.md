# Tactical Engine Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce the first tactical engine contracts and move current RTS mode setup/spawning behind reusable boundaries without changing gameplay behavior.

**Architecture:** Add small engine-facing contracts first, then route current RTS setup through mode definitions and a spawn service. Keep most files in place for this phase; the value is the boundary, not folder churn.

**Tech Stack:** TypeScript strict, Vite, Three.js, existing object pools, existing EventBus, no new runtime dependencies.

---

## Scope

This plan implements Phase 1 from `docs/superpowers/specs/2026-04-26-tactical-engine-design.md`.

It does not move all configs into `src/game/rts/` yet. It prepares that move by making `startGameScene()` consume mode definitions and spawn services instead of owning setup details.

## File Structure

- Create `src/engine/core/gameModule.ts`
  - Owns generic contracts: `GameModule`, `GameModeDefinition`, `GameSetupContext`, `SystemFactory`, `GameObjective`.
- Create `src/engine/core/spawnService.ts`
  - Owns generic spawn operations over current pools: units, buildings, resources.
- Create `src/game/rts/modes.ts`
  - Owns current RTS mode setup for `ffa`, `allVsYou`, and `playground`.
- Modify `src/scenes/gameScene.ts`
  - Becomes scene runner and wiring layer.
  - Delegates world setup and mode-specific systems to `RTS_MODES`.
  - Uses `SpawnService` for Battle Lab spawns.
- Modify `src/systems/production.ts`
  - Uses `SpawnService` for trained unit spawning.
  - Keeps production/economy rules unchanged.
- Modify `tsconfig.json`
  - Adds `@game/*` alias.

## Task 1: Add Core Engine Contracts

**Files:**
- Create: `src/engine/core/gameModule.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Add the `@game/*` alias**

In `tsconfig.json`, add this path beside the existing aliases:

```json
"@game/*": ["src/game/*"]
```

Expected `paths` section includes:

```json
"@engine/*": ["src/engine/*"],
"@game/*": ["src/game/*"]
```

- [ ] **Step 2: Create engine contracts**

Create `src/engine/core/gameModule.ts`:

```ts
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
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json src/engine/core/gameModule.ts
git commit -m "feat: add tactical engine contracts"
```

## Task 2: Add SpawnService

**Files:**
- Create: `src/engine/core/spawnService.ts`
- Modify: `src/systems/production.ts`

- [ ] **Step 1: Create `SpawnService`**

Create `src/engine/core/spawnService.ts`:

```ts
import type { World } from '@engine/world';
import type { Unit, Building, ResourceNode } from '@entities/types';
import type { FactionId } from '@config/palette';
import type { UnitKind } from '@config/units';
import type { BuildingKind } from '@config/buildings';
import { BUILDING_STATS } from '@config/buildings';
import { FACTIONS } from '@config/factions';
import { MAP } from '@config/gameplay';
import { applyFactionMods, initBuilding, initUnit } from '@entities/create';

export interface SpawnUnitInput {
  faction: FactionId;
  kind: UnitKind;
  x: number;
  y: number;
}

export interface SpawnBuildingInput {
  faction: FactionId;
  kind: BuildingKind;
  tileX: number;
  tileY: number;
  preBuilt: boolean;
}

export interface SpawnResourceInput {
  x: number;
  y: number;
  amount: number;
}

export class SpawnService {
  constructor(private readonly world: World) {}

  unit(input: SpawnUnitInput): Unit | null {
    const u = this.world.units.acquire();
    if (!u) return null;
    const faction = FACTIONS[input.faction];
    const stats = applyFactionMods(input.kind, faction.mods);
    initUnit(u, input.kind, input.faction, stats, input.x, input.y);
    this.world.bus.emit('unit:spawned', {
      id: u.id,
      kind: input.kind,
      faction: input.faction,
      x: input.x,
      y: input.y,
    });
    return u;
  }

  building(input: SpawnBuildingInput): Building | null {
    const b = this.world.buildings.acquire();
    if (!b) return null;
    const stats = BUILDING_STATS[input.kind];
    const worldX = (input.tileX + stats.tileW / 2) * MAP.tileSize;
    const worldY = (input.tileY + stats.tileH / 2) * MAP.tileSize;
    initBuilding(b, input.kind, input.faction, stats, input.tileX, input.tileY, worldX, worldY, input.preBuilt);
    this.world.navGrid.stampRect(input.tileX, input.tileY, stats.tileW, stats.tileH, true);
    this.world.bus.emit('building:placed', { id: b.id, kind: input.kind, faction: input.faction });
    if (input.preBuilt) {
      this.world.bus.emit('building:completed', { id: b.id, kind: input.kind, faction: input.faction });
    }
    return b;
  }

  resource(input: SpawnResourceInput): ResourceNode | null {
    const r = this.world.resources.acquire();
    if (!r) return null;
    r.x = input.x;
    r.y = input.y;
    r.amount = input.amount;
    return r;
  }

  unitAdjacentToBuilding(building: Building, kind: UnitKind): Unit | null {
    const { x, y } = findFreeSpawnAdjacent(this.world, building);
    const u = this.unit({ faction: building.faction, kind, x, y });
    if (!u) return null;
    if (building.rallyX !== null && building.rallyY !== null) {
      u.state = 'move';
      u.destX = building.rallyX;
      u.destY = building.rallyY;
    }
    return u;
  }
}

export function nearestOpenWorldPoint(world: World, x: number, y: number): { x: number; y: number } {
  const [tx, ty] = world.navGrid.worldToTile(x, y);
  if (!world.navGrid.isBlocked(tx, ty)) return { x, y };
  for (let r = 1; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = tx + dx;
        const ny = ty + dy;
        if (!world.navGrid.inBounds(nx, ny)) continue;
        if (world.navGrid.isBlocked(nx, ny)) continue;
        const [wx, wy] = world.navGrid.tileToWorld(nx, ny);
        return { x: wx, y: wy };
      }
    }
  }
  return { x, y };
}

function findFreeSpawnAdjacent(world: World, building: Building): { x: number; y: number } {
  const startX = building.x;
  const startY = building.y + (building.stats.tileH / 2 + 0.6) * MAP.tileSize;
  for (let r = 0; r < 6; r++) {
    for (let a = 0; a < 12; a++) {
      const angle = (a / 12) * Math.PI * 2;
      const wx = startX + Math.cos(angle) * (r + 0.5) * MAP.tileSize;
      const wy = startY + Math.sin(angle) * (r + 0.5) * MAP.tileSize;
      const [tx, ty] = world.navGrid.worldToTile(wx, wy);
      if (!world.navGrid.isBlocked(tx, ty)) return { x: wx, y: wy };
    }
  }
  return { x: startX, y: startY };
}
```

- [ ] **Step 2: Route production spawning through SpawnService**

In `src/systems/production.ts`, add:

```ts
import { SpawnService } from '@engine/core/spawnService';
```

In `ProductionSystem.update`, replace:

```ts
spawnUnit(w, b, order.kind);
```

with:

```ts
new SpawnService(w).unitAdjacentToBuilding(b, order.kind);
```

Then remove exported `spawnUnit` and `findFreeSpawnAdjacent` from
`src/systems/production.ts`. Keep `spawnBuilding` for this task so the diff
stays small; it will be removed from scene setup in Task 4.

- [ ] **Step 3: Verify production still compiles**

Run:

```bash
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/engine/core/spawnService.ts src/systems/production.ts
git commit -m "feat: add spawn service"
```

## Task 3: Define RTS Modes

**Files:**
- Create: `src/game/rts/modes.ts`

- [ ] **Step 1: Create RTS mode definitions**

Create `src/game/rts/modes.ts`:

```ts
import type { FactionId } from '@config/palette';
import { FACTION_IDS } from '@config/palette';
import { FACTIONS } from '@config/factions';
import { ECONOMY, MAP, WORLD } from '@config/gameplay';
import type { World } from '@engine/world';
import type { GameModeDefinition, GameObjective, GameSetupContext, SystemFactory } from '@engine/core/gameModule';
import { applyFactionMods } from '@entities/create';
import { nearestOpenWorldPoint, type SpawnService } from '@engine/core/spawnService';

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
    const tx = Math.floor(corner.x / MAP.tileSize);
    const ty = Math.floor(corner.y / MAP.tileSize);
    const hq = spawn.building({ faction: id, kind: 'hq', tileX: tx, tileY: ty, preBuilt: true });
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

function noExtraSystems(_ctx: GameSetupContext<SpawnService>): SystemFactory<SpawnService>[] {
  return [];
}

function noExtraObjectives(_ctx: GameSetupContext<SpawnService>): GameObjective[] {
  return [];
}
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 3: Commit**

```bash
git add src/game/rts/modes.ts
git commit -m "feat: define rts game modes"
```

## Task 4: Refactor Scene Setup To Consume RTS Modes

**Files:**
- Modify: `src/scenes/gameScene.ts`

- [ ] **Step 1: Replace scene setup imports**

In `src/scenes/gameScene.ts`, remove imports that are only used for setup:

```ts
import { FACTIONS } from '@config/factions';
import { ECONOMY, FOG, MAP, WORLD } from '@config/gameplay';
import { ProductionSystem, spawnBuilding } from '@systems/production';
import { initUnit, applyFactionMods } from '@entities/create';
```

Add:

```ts
import { FOG, WORLD } from '@config/gameplay';
import { ProductionSystem } from '@systems/production';
import { findMode } from '@engine/core/gameModule';
import { SpawnService, nearestOpenWorldPoint } from '@engine/core/spawnService';
import {
  RTS_MODES,
  type RtsModeId,
  getRtsCameraTarget,
  isBattleLab,
  syncBattleLabLiveUnitStats,
} from '@game/rts/modes';
```

Change:

```ts
export type GameMode = 'ffa' | 'allVsYou' | 'playground';
```

to:

```ts
export type GameMode = RtsModeId;
```

- [ ] **Step 2: Create `SpawnService` and mode definition**

After creating `world`, add:

```ts
const spawn = new SpawnService(world);
const modeDef = findMode(RTS_MODES, mode);
```

Keep:

```ts
world.playerFaction = playerFaction;
world.factions[playerFaction].isHuman = true;
```

Remove the current inline starting credits, all-vs-you team setup, HQ/worker
setup, and resource setup blocks.

After terrain/fog/render bridge setup, call:

```ts
modeDef.setup({ world, spawn });
```

- [ ] **Step 3: Replace playground checks**

Replace:

```ts
if (mode === 'playground') {
```

with:

```ts
if (isBattleLab(mode)) {
```

for fog reveal, system list, camera centering, playground panel mounting, and
live stat sync.

Replace camera centering block with:

```ts
const cameraTarget = getRtsCameraTarget(playerFaction, mode);
cameraSystem.centerOn(cameraTarget.x, cameraTarget.y);
```

Replace live stat sync with:

```ts
if (isBattleLab(mode)) syncBattleLabLiveUnitStats(world);
```

- [ ] **Step 4: Use SpawnService in Battle Lab spawns**

Replace `spawnUnitAt` with:

```ts
function spawnPlaygroundUnits(
  world: World,
  spawn: SpawnService,
  faction: FactionId,
  kind: UnitKind,
  count: number,
  startIndex: number,
): number {
  let next = startIndex;
  for (let i = 0; i < count; i++) {
    const anchor = playgroundAnchor(faction);
    const slot = next++;
    const ring = 1.4 + Math.floor((slot % 36) / 9) * 1.35;
    const angle = ((slot % 9) / 9) * Math.PI * 2 + Math.floor(slot / 36) * 0.45;
    const point = nearestOpenWorldPoint(world, anchor.x + Math.cos(angle) * ring, anchor.y + Math.sin(angle) * ring);
    spawn.unit({ faction, kind, x: point.x, y: point.y });
  }
  return next;
}
```

Update the panel callback:

```ts
playgroundSpawnIndex = spawnPlaygroundUnits(world, spawn, faction, kind, count, playgroundSpawnIndex);
```

Remove local helpers that are now obsolete:

- `spawnUnitAt`
- `syncPlaygroundLiveUnitStats`
- `nearestOpenWorldPoint`

- [ ] **Step 5: Compile and fix narrow import fallout**

Run:

```bash
npm run typecheck
```

Expected: exit code 0. If TypeScript reports unused imports, remove only those
imports from `src/scenes/gameScene.ts`.

- [ ] **Step 6: Build**

Run:

```bash
npm run build
git restore tsconfig.tsbuildinfo
```

Expected: build succeeds. The `git restore` command removes generated build-info
churn.

- [ ] **Step 7: Commit**

```bash
git add src/scenes/gameScene.ts
git commit -m "refactor: route rts setup through modes"
```

## Task 5: Remove Duplicate Building Spawn From Production

**Files:**
- Modify: `src/systems/production.ts`

- [ ] **Step 1: Replace building placement spawns**

In `src/systems/production.ts`, create one spawn service in each event handler
that places a building:

```ts
const spawn = new SpawnService(w);
```

Replace:

```ts
const b = spawnBuilding(w, w.playerFaction, kind, tx, ty, false);
```

with:

```ts
const b = spawn.building({ faction: w.playerFaction, kind, tileX: tx, tileY: ty, preBuilt: false });
```

Apply this replacement in both `quickset` and `supervised` branches.

- [ ] **Step 2: Remove old `spawnBuilding` implementation**

Delete the exported `spawnBuilding` function from `src/systems/production.ts`.
Also remove now-unused imports:

```ts
import { initBuilding } from '@entities/create';
```

and any unused `BUILDING_STATS` imports only if TypeScript says they are unused.
`BUILDING_STATS` is still used for placement validation, so it should stay.

- [ ] **Step 3: Run typecheck**

Run:

```bash
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/systems/production.ts
git commit -m "refactor: use spawn service for production placement"
```

## Task 6: Browser Smoke Test All RTS Modes

**Files:**
- No code changes expected.

- [ ] **Step 1: Start dev server**

Run:

```bash
npm run dev -- --host 127.0.0.1 --port 5179
```

Expected: Vite reports `Local: http://127.0.0.1:5179/`.

- [ ] **Step 2: Smoke test Free-for-all**

In the in-app browser:

1. Open `http://127.0.0.1:5179/`.
2. Choose `Free-for-all`.
3. Choose `Vanguard Coalition`.
4. Click `Start`.

Expected:

- HQ, starter workers, resources, and enemy bases are present.
- No immediate game-over.
- Console has no errors.

- [ ] **Step 3: Smoke test All vs You**

Reload the app and start:

1. Choose `All vs You`.
2. Choose `Vanguard Coalition`.
3. Click `Start`.

Expected:

- Player base starts normally.
- Other two factions are allied against the player.
- Console has no errors.

- [ ] **Step 4: Smoke test Battle Lab**

Reload the app and start:

1. Choose `Playground`.
2. Choose any faction.
3. Click `Start`.
4. Click `+5` for a Vanguard unit and `+5` for a Swarm unit.
5. Click `Dev Panel`.

Expected:

- No HQ, no prebuilt bases, no resources.
- Battle Lab panel is visible.
- Spawned units appear and can fight.
- Dev panel opens.
- Console has no errors.

- [ ] **Step 5: Commit smoke-test notes if code changed**

If no code changed during smoke testing, do not create a commit. If a bug fix was
needed, commit the specific fix with:

```bash
git add <changed-files>
git commit -m "fix: stabilize tactical engine phase 1"
```

## Task 7: Final Verification

**Files:**
- No code changes expected.

- [ ] **Step 1: Run final typecheck**

```bash
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 2: Run final build**

```bash
npm run build
git restore tsconfig.tsbuildinfo
```

Expected: build succeeds.

- [ ] **Step 3: Check clean status**

```bash
git status --short
```

Expected: no output.

- [ ] **Step 4: Report completed commits**

Report the commit hashes for each task commit and mention any browser smoke-test
issues found.
