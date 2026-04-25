# Prompt: build an asymmetric 3D RTS prototype

Use this as a design brief when spinning up a C&C-style real-time strategy
game with an AI coding agent. It defines **principles**, not a specific
roster — pick your own factions, themes, and unit names; the architecture
and balance primitives stay the same.

---

## Goal

A single-player browser RTS with N≥2 asymmetric factions that share a
mechanical RPS skeleton but feel distinct to play. One fixed-camera
battlefield, mouse-driven commands, simple build-order → unit production →
combat loop ending when a faction's HQ dies.

## Tech stack

- **three.js** (any recent r1xx release) — `WebGLRenderer`,
  `PerspectiveCamera`, `PCFShadowMap`. No other rendering libs.
- **TypeScript strict** — `strict: true`,
  `exactOptionalPropertyTypes: true`, `noUncheckedIndexedAccess: true`.
- **Vite** with path aliases per layer (`@config`, `@utils`, `@entities`,
  `@systems`, `@render`, `@ui`, `@scenes`, `@engine`).
- No React, no Phaser, no physics engine, no ECS framework.

## Hard constraints (refuse to violate)

- **Procedural-only art**: every mesh is built at runtime from primitive
  geometries (`Box`, `Cylinder`, `Cone`, `Icosahedron`, `Torus`) with
  `MeshLambertMaterial` + `flatShading`. No textures, no GLTF/OBJ, no
  sprite atlases, no audio.
- **No magic numbers in gameplay code**. All tunables live in
  `src/config/`.
- **No cross-system imports**. Systems communicate via a typed EventBus
  or shared World state — never by calling each other's methods.

## v1 shortcuts (expect to replace later)

- **Navigation**: straight-line movement + O(N²) soft separation. Fine
  for a single-screen prototype with a few buildings; breaks on
  larger maps where units need to route around obstacles. When you
  want proper pathing, add a flow-field over a 2D nav grid (cheap at
  this scale — one update per second per goal) between the integrate
  and separate passes of `MovementSystem`. The rest of the architecture
  doesn't care.
- **Formations**: not implemented. Selected units spread around a ring
  offset at the destination. Good enough until you want shift-queue orders.
- **Multiplayer**: not wired. `InputSystem` is the swap-point if you
  later build a deterministic lockstep or authoritative-server model.

---

## Core design principles

### 1. Role × kind split

Every unit has a **role** (mechanical RPS slot) and a **kind** (concrete
flavor). Factions map role → kind; gameplay code reasons in roles.

```
roles:  infantry | tank | special | worker | drone
kinds:  ranger, paladin, commando, ... (per-faction)
```

This is the one decision that makes everything else easy. The factory
trains `role = 'tank'`; `resolveUnitKind('tank', faction)` returns which
mesh shows up. Adding a new faction never touches combat, AI, or UI.

### 2. Damage = weapon class × armor class

All damage runs through one matrix. Pick three weapon classes and three
or four armor classes; the matrix is the RPS layer.

```ts
type WeaponClass = 'aInfantry' | 'aArmor' | 'aStructure';
type ArmorClass  = 'light' | 'medium' | 'heavy' | 'structure';

DamageMatrix: Record<WeaponClass, Record<ArmorClass, number>>;
// pick multipliers so every weapon class has a hard counter-armor and
// a soft one. Example seed (tune to taste):
//   aInfantry × light  → 1.4     (rifles shred footsoldiers)
//   aInfantry × heavy  → 0.30    (rifles tickle tanks)
//   aArmor    × medium → 1.0     (AT works on APCs)
//   aArmor    × heavy  → 1.3     (AT is the tank killer)
//   aStructure × structure → 2.0 (rockets overkill buildings)
```

Every combat calc — main hit, splash, kamikaze detonation — uses the same
matrix. One source of balance truth.

### 3. Asymmetry via role mapping + global modifiers + unique additions

Each faction exposes:

```ts
interface FactionMeta {
  // role → kind mapping (core RPS slots)
  infantryKind; tankKind; specialKind;
  droneKind?;          // missing = no air tech

  // which buildings this faction's worker can place
  availableBuildings: readonly BuildingKind[];

  // optional faction-unique trained units (attached to specific buildings)
  extraBarracksUnit?;  // e.g. anti-armor infantry, utility swarm bot
  extraFactoryUnit?;   // e.g. AA flak truck

  // global stat scalars — the one-dimensional identity knobs
  mods: { hpMul; speedMul; costMul };
}
```

Three faction archetypes cover most intuitive roster space:
- **Baseline** — `{1, 1, 1}`: everything average; easiest to learn.
- **Swarm / asymmetric** — `{0.85, 1.15, 0.85}`: fragile, fast, cheap.
  Rewards numbers and flanks.
- **Heavy / industrial** — `{1.2, 0.88, 1.1}`: tough, slow, premium.
  Rewards combined arms.

Faction flavor beyond this (unique buildings, altitude-based units, etc.)
is layered on top via `availableBuildings` and `extraXUnit`.

### 4. Tech tree via prerequisites, not hand-written gates

Each building stat row carries `prereq?: BuildingKind`. The command card
filters "Build X" buttons by prereq presence in the player's own
buildings. No `if (have barracks) showFactoryButton()` branches.

### 5. Target priority
Separate **user intent** from **auto-engage intent**. A `targetLocked`
boolean on each unit:

- `CommandSystem` sets it `true` when the user RMB-clicks an enemy
  (respect the choice, never override).
- Auto-engage paths (`IdleState`, `AttackMoveState`) set it `false`.
- `AttackState` periodically re-scans and switches when the current
  target is unarmed but an armed threat is in sight range — only when
  `targetLocked === false`.

This single flag fixes the "unit shoots harvester while tanks kill him"
frustration without removing agency.

---

## Architecture

Strict layered dependency — import only downward.

```
config ── pure data (no src/* imports)
utils  ── config         (EventBus, ObjectPool, math, ids, logger)
render ── config + utils (owns ALL three.js imports outside engine/)
entities ─ config + utils (THREE-free logical state: Unit, Building,
                          Projectile, ResourceNode)
systems ── config + utils + entities + render
ui     ── config + utils + systems (read-only) + render (ghosts only)
scenes ── everything below
engine ── scenes (top)
```

Enforce this with Vite path aliases and review discipline. The rule
"entities never import three.js" is the one that keeps the sim
deterministic and renderer-swappable.

---

## The four patterns you MUST use

### Typed EventBus
One interface `GameEvents` in one file. Events are **facts** in past tense
(`unit:died`, `credits:deposited`, `weapon:fired`). Input intents prefix
`input:` and are present-tense commands (`input:commandMove`). Handlers
synchronous, no throws, subscribe in `init()` never in `update()`.
Adding a new event = extending the interface; call sites typecheck.

### ObjectPool
Fixed capacity per entity type. `acquire()` returns `null` on overflow —
**never fall back to `new`**. `CleanupSystem` calls `release()` on
`hp <= 0`. Pool sizing is an implicit difficulty cap.

### Finite State Machine (generic)
```ts
IState<TSelf, TWorld, TName> = {
  name; onEnter?(ctx); onExit?(ctx); tick(ctx): TName | null;
}
```
Five states cover 95% of unit behaviors: `idle | move | attackMove | attack
| harvest`. Kamikaze, dive, grenade-throw — all fit inside existing states
via role branches; resist the urge to add new states for every flavor.

### Fixed system update order
One `readonly ISystem[]` in one place. The order is load-bearing:

```
1.  Camera  2. Input  3. Selection  4. Command  5. UnitAI
6.  Movement  7. Combat  8. Projectile
9.  Production  10. Economy  11. AIPlayer
12. Fog  13. Victory  14. Cleanup
    ↓
    Render (renderer.sync after systems)
```

Rationale for adjacencies:
- Input → Command: clicks reach units the same frame.
- UnitAI → Movement: velocities integrate immediately.
- Movement → Combat → Projectile: bullets can hit on their spawn frame.
- Victory before Cleanup: HQ hp=0 triggers game-over before pool release.

---

## Data model template

```ts
interface UnitStats {
  role; displayName; maxHp; armor; radius; speed;
  altitude?;                     // > 0 = flying; engine treats it as Y height
  cost; buildMs; builtBy;
  sightRange?;                   // auto-engage scan; defaults to weapon.range
  weapon?: {
    klass; damage; range; cdMs; projectileSpeed;  // 0 = contact-fuse
    splash?; targetsAir?; targetsGround?;
  };
  harvest?: { capacity; gatherMs };
}

interface BuildingStats {
  displayName; maxHp; tileW; tileH; cost; buildMs;
  power;                         // + produces, − consumes
  prereq?: BuildingKind;
  trains?: readonly Role[];      // what it can produce (role, not kind)
}
```

Rendering convention: entity `(x, y)` → three.js `(x, altitude, y)`. Mesh
authoring: local `+Z` = forward, feet on `y = 0`. Body rotation in world:
`group.rotation.y = π/2 − entity.rotation` where `entity.rotation =
atan2(vy, vx)`.

---

## UX essentials (the polish that makes it feel like a game, not a demo)

- **StarCraft-style icon command grid**. Fixed-size square cells in a
  4-wide grid, inline SVG icons using `currentColor` for per-role tinting.
  No text-list buttons — they don't scale and look like forms.
- **Context-sensitive cursor** via inline SVG data URIs:
  attack-reticle on enemies, crystal-diamond on resources (hotspot at
  bottom tip), move-cross on empty ground, crosshair during placement.
- **Selection rings with `depthTest: false`** and `renderOrder: 5`. Under
  a heightmap terrain, flat rings at y=0 get occluded by dune crests;
  the disable-depth-test trick is mandatory.
- **Floating combat text** — DOM layer subscribed to `entity:damaged`
  (red `-N`), `credits:deposited` (gold `+N`), `cargo:gathered`
  (gold `+N` over harvester). Project world-space anchor each frame.
- **Fog of war** — Uint8Array grid (0=unexplored, 1=explored, 2=visible)
  updated at 5 Hz, painted into a CanvasTexture overlay plane, drives
  `alpha = 0` on out-of-sight enemy entities.
- **Hysteresis in any position-triggered state transition**. If a check
  uses a distance threshold (harvester-in-range, tank-in-retreat, etc.),
  enter-threshold and leave-threshold must differ by more than one
  frame's worth of separation-force displacement. Otherwise you get
  visible stutter.

## Visual upgrade roadmap

- **Use bitmap/procedural textures for static terrain materials**:
  ground, water, lava, acid, and transition zones such as water → dirt
  and lava → scorched earth. These should read as map surface, not UI
  pulses or raised geometry.
- **Use shaders where they pay off: dynamic VFX**. Shader work should
  target motion-heavy effects: fire, explosions, smoke heat shimmer,
  rocket trails, plasma bolts, lasers, railgun beams, tesla chains, shield
  flashes, muzzle bloom, and impact shockwaves.
- **Keep projectile silhouettes faction-readable**:
  Vanguard uses physical rockets, tracer rounds, grenade arcs, and metal
  impact sparks; Swarm uses acid spit, bio-glow bursts, spores, and
  organic splash; Titan uses rail beams, laser cuts, tesla arcs, neon
  capacitor flashes, and hard-edged energy impacts.
- **Avoid shader effects for broad static map areas unless they are very
  subtle**. Animated water/lava across large terrain quickly reads as HUD
  pulse if the motion is too regular. Prefer textured surfaces plus small
  localized animated accents.

---

## Balance levers (the knobs you'll actually turn)

Ordered by leverage — top of list moves matchups fastest.

1. **Armor class** on a unit — biggest lever. Changing `light → medium`
   typically shifts its "time to die vs infantry" by 2-3×.
2. **Weapon class** on an attacker — picks which armor it counters.
3. **`sightRange` vs `weapon.range`** — drones with contact-fuse weapons
   NEED a larger sight range to auto-engage.
4. **Faction `mods.hpMul`** — cheapest way to make a whole roster tough
   without touching individual units.
5. **Cost + buildMs** — controls unit accessibility, not matchup
   outcome. Cheap doesn't mean weak if the matrix favors it.

Balance axis to watch: for each faction, what's the "only counter" in
the matrix for every weapon class? If a faction has zero units of
`weaponClass = X`, and the enemy fields only `armorClass = Y` where
`X × Y > 1.0`, the matchup is broken.

---

## Acceptance

A build is "done" for this spec when:

- `typecheck` and `build` are clean; no runtime warnings in console.
- A full match loop (menu → faction select → game → victory / defeat
  screen) completes for every faction pairing.
- Every one of the four patterns (EventBus / ObjectPool / FSM / fixed
  pipeline) is in place and enforced by the structure — not faked via
  globals, singletons, or direct imports.
- The three principles (role × kind split; damage matrix; asymmetry via
  modifiers) are visible in the source: adding a new faction is ≤ 1 file
  change in `config/`; adding a new unit is ≤ 3 (catalog + mesh + icon).
- Combat matchups round-trip through the matrix — a factory-built tank
  from one faction must kill infantry from all others at roughly the
  same rate, before faction modifiers are applied.

---

## Gotchas that will cost you hours if unhandled

- Rotation math: `group.rotation.y = π/2 − entity.rotation`. Not `−r`,
  not `−r + π`. Getting this wrong makes tank barrels aim 90° off.
- Stationary projectiles (zero velocity — e.g. kamikaze) need an explicit
  "detonate on spawn" branch in `ProjectileSystem`; position never
  advances past frame 0 and the radius check would never trigger.
- `MovementSystem` separation kicks in AFTER velocity integration. Any
  state that zeroes `vx/vy` must handle being pushed anyway (hysteresis).
- Building placement in unexplored territory must be rejected at click
  time, not at build time — otherwise the ghost is green but the click
  silently fails.
- `exactOptionalPropertyTypes: true` means `x?: T` ≠ `x: T | undefined`.
  Initialize optional fields explicitly in `init()`.
