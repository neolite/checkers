import type { FactionId } from '@config/palette';
import { FACTION_IDS, FACTION_COLORS } from '@config/palette';
import { FOG, WORLD } from '@config/gameplay';
import type { UnitKind } from '@game/rts/content/units';
import { findMode } from '@engine/core/gameModule';
import { SpawnService, nearestOpenWorldPoint } from '@engine/core/spawnService';
import { RTS_SPAWN_CONTENT } from '@game/rts/spawnContent';
import { World } from '@engine/world';
import { createRenderContext } from '@render/scene';
import { createFogOverlay } from '@render/fogOverlay';
import { screenToGround } from '@render/picking';
import { RenderBridge } from '@render/sync';
import { RTS_RENDER_CONTENT } from '@game/rts/render/content';
import type { ISystem } from '@engine/systems/iface';
import { CameraSystem } from '@engine/systems/camera';
import { InputSystem } from '@game/rts/systems/input';
import { SelectionSystem } from '@engine/systems/selection';
import { CommandSystem } from '@game/rts/systems/command';
import { UnitAISystem } from '@game/rts/systems/unitAI';
import { MovementSystem } from '@engine/systems/movement';
import { CombatSystem } from '@engine/systems/combat';
import { ProjectileSystem } from '@engine/systems/projectile';
import { RTS_COMBAT_RULES } from '@game/rts/combatRules';
import { ProductionSystem } from '@game/rts/systems/production';
import { EconomySystem } from '@game/rts/systems/economy';
import { AIPlayerSystem } from '@game/rts/systems/aiPlayer';
import { FogSystem } from '@engine/systems/fog';
import { VictorySystem } from '@game/rts/systems/victory';
import { CleanupSystem } from '@engine/systems/cleanup';
import { createHud, type HudHandle } from '@game/rts/ui/hud';
import { mountCommandCard, type CommandCardHandle } from '@game/rts/ui/commandCard';
import { mountFloatingText, type FloatingTextHandle } from '@ui/floatingText';
import { showGameOver } from '@game/rts/ui/gameOver';
import { mountPlaygroundPanel, type PlaygroundPanelHandle } from '@game/rts/ui/playgroundPanel';
import { mountAudio, type AudioKernelHandle } from '@render/audio';
import { mountWeaponFx, type WeaponFxHandle } from '@render/weaponFx';
import { FACTION_COLORS as _ } from '@config/palette';
import {
  RTS_MODES,
  type RtsModeId,
  getRtsCameraTarget,
  isBattleLab,
  syncBattleLabLiveUnitStats,
} from '@game/rts/modes';
import { makeTerrainFeatureLayer } from '@render/terrainFeatures';
import { stampTerrainFeatures } from '@utils/terrain';
import { InputScope } from '@engine/input/inputScope';
void _;

export type GameMode = RtsModeId;

export interface GameSceneHandle {
  destroy(): void;
}

const PLAYGROUND_NUKE_RADIUS = 8.5;
const PLAYGROUND_NUKE_DAMAGE = 260;
const PLAYGROUND_NUKE_DELAY_MS = 650;

export function startGameScene(host: HTMLElement, playerFaction: FactionId, mode: GameMode, onExit: () => void): GameSceneHandle {
  const world = new World();
  const spawn = new SpawnService(world, RTS_SPAWN_CONTENT);
  const modeDef = findMode(RTS_MODES, mode);
  const battleLab = isBattleLab(mode);
  world.playerFaction = playerFaction;
  world.factions[playerFaction].isHuman = true;

  // three.js render context.
  const rc = createRenderContext(host);
  world.three.renderer = rc.renderer;
  world.three.scene = rc.scene;
  world.three.camera = rc.camera;

  stampTerrainFeatures(world);
  const terrainFx = makeTerrainFeatureLayer(world.terrainFeatures);
  rc.scene.add(terrainFx.group);

  // Fog overlay plane.
  const fog = createFogOverlay();
  rc.scene.add(fog.mesh);

  // Render bridge (mesh lifecycle).
  const bridge = new RenderBridge(rc.scene, RTS_RENDER_CONTENT);

  modeDef.setup({ world, spawn });

  // Systems — fixed order per spec.
  const cameraSystem = new CameraSystem();
  const fogSystem = new FogSystem(fog);
  if (battleLab) {
    const playerFog = world.factions[world.playerFaction].fog;
    playerFog.fill(FOG.visible);
    fog.paint(playerFog);
  }
  const inputSystem = new InputSystem(host);
  const modeSystems = modeDef.systems({ world, spawn }).map((factory) => factory({ world, spawn }));
  const systems: ISystem[] = [
    cameraSystem,
    inputSystem,
    new SelectionSystem(),
    new CommandSystem(),
    new UnitAISystem(),
    new MovementSystem(),
    new CombatSystem(RTS_COMBAT_RULES),
    new ProjectileSystem(RTS_COMBAT_RULES),
    new EconomySystem(),
    ...(battleLab ? [] : [new ProductionSystem(), new AIPlayerSystem(), fogSystem, new VictorySystem()]),
    ...modeSystems,
    new CleanupSystem(bridge),
  ];
  for (const s of systems) s.init(world);

  const cameraTarget = getRtsCameraTarget(playerFaction, mode);
  cameraSystem.centerOn(cameraTarget.x, cameraTarget.y);

  // HUD + UI.
  const hud: HudHandle = createHud(host, world, cameraSystem);
  const card: CommandCardHandle = mountCommandCard(world);
  const floaters: FloatingTextHandle = mountFloatingText(world);
  const audio: AudioKernelHandle = mountAudio(world);
  const weaponFx: WeaponFxHandle = mountWeaponFx(world, rc.scene);
  const playgroundInput = new InputScope();
  const playgroundTimers: number[] = [];
  let nukeArmed = false;
  let playgroundSpawnIndex = 0;
  const playgroundPanel: PlaygroundPanelHandle | null = battleLab
    ? mountPlaygroundPanel(
      host,
      (faction, kind, count) => {
        playgroundSpawnIndex = spawnPlaygroundUnits(world, spawn, faction, kind, count, playgroundSpawnIndex);
      },
      () => clearPlaygroundUnits(world),
      () => {
        nukeArmed = true;
        world.bus.emit('ui:notice', { text: 'Nuke armed. Click ground target.', tone: 'warn' });
      },
    )
    : null;
  if (battleLab) {
    const canvas = rc.renderer.domElement;
    playgroundInput.on(canvas, 'mousedown', (ev) => {
      if (!nukeArmed) return;
      ev.preventDefault();
      ev.stopImmediatePropagation();
      const ground = screenToGround(rc.camera, ev.clientX, ev.clientY, window.innerWidth, window.innerHeight);
      if (!ground) return;
      nukeArmed = false;
      requestPlaygroundNuke(world, ground.x, ground.z, playgroundTimers);
    }, { capture: true });
  }

  // Re-render command card on selection changes. We subscribe to events that imply selection change.
  const offSelChange = world.bus.on('unit:died', () => card.tick());
  const offBldChange = world.bus.on('building:destroyed', () => card.tick());
  let lastSelectionHash = '';
  let lastCardRefresh = 0;
  function selectionHash(): string {
    return [...world.selectedUnits].join(',') + '|' + [...world.selectedBuildings].join(',');
  }

  // Game loop — variable dt, clamped.
  let last = performance.now();
  let animFrame = 0;
  let finished = false;
  let destroyed = false;

  const offVictory = world.bus.on('game:victory', ({ winner }) => {
    if (finished) return;
    finished = true;
    if (winner === world.playerFaction) showGameOver(host, 'victory', winner, cleanupAndExit);
    else showGameOver(host, 'defeat', winner, cleanupAndExit);
  });
  const offDefeat = world.bus.on('game:defeat', ({ loser }) => {
    if (finished) return;
    finished = true;
    // Winner may not be known yet; pick any surviving non-loser.
    const surv = FACTION_IDS.find((id) => world.factions[id].alive && id !== loser) ?? null;
    showGameOver(host, 'defeat', surv, cleanupAndExit);
  });

  function frame(): void {
    const now = performance.now();
    let dtMs = now - last;
    if (dtMs > 1000 / 20) dtMs = 1000 / 20; // clamp big stalls
    last = now;
    world.tNow += dtMs;

    if (!finished) {
      if (battleLab) syncBattleLabLiveUnitStats(world);
      for (const s of systems) s.update(world, dtMs);
    }

    // Visual sync — runs every frame.
    const playerFog = world.factions[world.playerFaction].fog;
    world.units.forEachAlive((u) => bridge.syncUnit(u, playerFog, world.playerFaction));
    world.buildings.forEachAlive((b) => {
      bridge.syncBuilding(b, playerFog, world.playerFaction);
      bridge.syncRally(b, world.playerFaction);
    });
    const aliveProjectileIds = new Set<number>();
    world.projectiles.forEachAlive((p) => {
      aliveProjectileIds.add(p.id);
      const color = world.units.findById(p.ownerId)
        ? FACTION_COLORS[world.units.findById(p.ownerId)!.faction].accent
        : 0xffffff;
      bridge.syncProjectile(p, color);
    });
    bridge.pruneProjectiles(aliveProjectileIds);
    world.resources.forEachAlive((r) => bridge.syncResource(r, playerFog));
    bridge.setSelection([...world.selectedUnits], [...world.selectedBuildings]);

    hud.tick();
    // Command card: ~10 Hz refresh for progress bars (cheap rebuild).
    const h = selectionHash();
    if (h !== lastSelectionHash || now - lastCardRefresh > 100) {
      lastSelectionHash = h;
      lastCardRefresh = now;
      card.tick();
    }
    floaters.tick();
    weaponFx.tick(dtMs);
    terrainFx.tick(dtMs);
    audio.updateListener();

    rc.renderer.render(rc.scene, rc.camera);
    animFrame = requestAnimationFrame(frame);
  }
  animFrame = requestAnimationFrame(frame);

  function cleanupAndExit(): void {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(animFrame);
    offSelChange();
    offBldChange();
    offVictory();
    offDefeat();
    playgroundInput.destroy();
    for (const timer of playgroundTimers) window.clearTimeout(timer);
    playgroundTimers.length = 0;
    for (const s of systems) s.destroy?.();
    hud.destroy();
    card.destroy();
    playgroundPanel?.destroy();
    floaters.destroy();
    audio.destroy();
    weaponFx.destroy();
    // Drop three.js.
    rc.destroy();
    onExit();
  }

  return {
    destroy: cleanupAndExit,
  };
}

function requestPlaygroundNuke(world: World, x: number, y: number, timers: number[]): void {
  world.bus.emit('superweapon:nukeTargeted', {
    faction: world.playerFaction,
    x,
    y,
    radius: PLAYGROUND_NUKE_RADIUS,
    delayMs: PLAYGROUND_NUKE_DELAY_MS,
  });
  world.bus.emit('ui:notice', { text: 'Tactical nuke inbound.', tone: 'warn' });
  const timer = window.setTimeout(() => {
    world.bus.emit('superweapon:nukeDetonated', {
      faction: world.playerFaction,
      x,
      y,
      radius: PLAYGROUND_NUKE_RADIUS,
      damage: PLAYGROUND_NUKE_DAMAGE,
    });
    applyPlaygroundNukeDamage(world, x, y, PLAYGROUND_NUKE_RADIUS, PLAYGROUND_NUKE_DAMAGE);
  }, PLAYGROUND_NUKE_DELAY_MS);
  timers.push(timer);
}

function applyPlaygroundNukeDamage(world: World, x: number, y: number, radius: number, damage: number): void {
  const r2 = radius * radius;
  world.units.forEachAlive((u) => {
    const dx = u.x - x;
    const dy = u.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) return;
    const dist = Math.sqrt(d2);
    const amount = Math.round(damage * (0.45 + 0.55 * (1 - dist / radius)));
    u.hp -= amount;
    world.bus.emit('unit:damaged', { id: u.id, amount, x: u.x, y: u.y });
  });
  world.buildings.forEachAlive((b) => {
    const dx = b.x - x;
    const dy = b.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 > r2) return;
    const dist = Math.sqrt(d2);
    const amount = Math.round(damage * 1.35 * (0.45 + 0.55 * (1 - dist / radius)));
    b.hp -= amount;
    world.bus.emit('building:damaged', { id: b.id, amount, x: b.x, y: b.y });
  });
}

function spawnPlaygroundUnits(world: World, spawn: SpawnService, faction: FactionId, kind: UnitKind, count: number, startIndex: number): number {
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

function playgroundAnchor(faction: FactionId): { x: number; y: number } {
  const cx = WORLD.width / 2;
  const cy = WORLD.depth / 2;
  switch (faction) {
    case 'vanguard':
      return { x: cx - 12, y: cy };
    case 'swarm':
      return { x: cx + 12, y: cy };
    case 'titan':
      return { x: cx, y: cy + 12 };
  }
}

function clearPlaygroundUnits(world: World): void {
  world.units.forEachAlive((u) => { u.hp = 0; });
  world.projectiles.forEachAlive((p) => { world.projectiles.release(p); });
  world.selectedUnits.clear();
  world.selectedBuildings.clear();
}
