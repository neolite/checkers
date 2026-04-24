import type { FactionId } from '@config/palette';
import { FACTION_IDS, FACTION_COLORS } from '@config/palette';
import { FACTIONS } from '@config/factions';
import { BUILDING_STATS } from '@config/buildings';
import { ECONOMY, MAP, WORLD, SIM } from '@config/gameplay';
import { World } from '@engine/world';
import { createRenderContext } from '@render/scene';
import { createFogOverlay } from '@render/fogOverlay';
import { RenderBridge } from '@render/sync';
import type { ISystem } from '@systems/iface';
import { CameraSystem } from '@systems/camera';
import { InputSystem } from '@systems/input';
import { SelectionSystem } from '@systems/selection';
import { CommandSystem } from '@systems/command';
import { UnitAISystem } from '@systems/unitAI';
import { MovementSystem } from '@systems/movement';
import { CombatSystem } from '@systems/combat';
import { ProjectileSystem } from '@systems/projectile';
import { ProductionSystem, spawnBuilding } from '@systems/production';
import { EconomySystem } from '@systems/economy';
import { AIPlayerSystem } from '@systems/aiPlayer';
import { FogSystem } from '@systems/fog';
import { VictorySystem } from '@systems/victory';
import { CleanupSystem } from '@systems/cleanup';
import { createHud, type HudHandle } from '@ui/hud';
import { mountCommandCard, type CommandCardHandle } from '@ui/commandCard';
import { mountFloatingText, type FloatingTextHandle } from '@ui/floatingText';
import { showGameOver } from '@ui/gameOver';
import { mountAudio, type AudioKernelHandle } from '@render/audio';
import { initUnit, applyFactionMods } from '@entities/create';
import { FACTION_COLORS as _ } from '@config/palette';
void _;

export type GameMode = 'ffa' | 'allVsYou';

export interface GameSceneHandle {
  destroy(): void;
}

export function startGameScene(host: HTMLElement, playerFaction: FactionId, mode: GameMode, onExit: () => void): GameSceneHandle {
  const world = new World();
  world.playerFaction = playerFaction;
  world.factions[playerFaction].isHuman = true;
  // Starting credits for everyone so the AI actually plays.
  for (const id of FACTION_IDS) world.factions[id].credits = ECONOMY.startingCredits;

  // Team setup. World defaults each faction to its own team id (FFA). For
  // "allVsYou" we merge the two AI factions into a shared team opposite the player.
  if (mode === 'allVsYou') {
    world.factions[playerFaction].team = 1;
    for (const id of FACTION_IDS) {
      if (id !== playerFaction) world.factions[id].team = 2;
    }
  }

  // three.js render context.
  const rc = createRenderContext(host);
  world.three.renderer = rc.renderer;
  world.three.scene = rc.scene;
  world.three.camera = rc.camera;

  // Fog overlay plane.
  const fog = createFogOverlay();
  rc.scene.add(fog.mesh);

  // Render bridge (mesh lifecycle).
  const bridge = new RenderBridge(rc.scene);

  // Starting positions: each faction occupies one of the map corners.
  const corners: Record<FactionId, { x: number; y: number }> = {
    vanguard: { x: 10, y: 10 },
    swarm: { x: WORLD.width - 14, y: 10 },
    titan: { x: WORLD.width / 2, y: WORLD.depth - 14 },
  };

  // HQ + some starter buildings + workers for each alive faction.
  for (const id of FACTION_IDS) {
    const corner = corners[id];
    const tx = Math.floor(corner.x / MAP.tileSize);
    const ty = Math.floor(corner.y / MAP.tileSize);
    const hq = spawnBuilding(world, id, 'hq', tx, ty, true);
    if (!hq) continue;
    // Give 2 starter workers.
    for (let i = 0; i < 2; i++) {
      const u = world.units.acquire();
      if (!u) continue;
      const meta = FACTIONS[id];
      const stats = applyFactionMods(meta.workerKind, meta.mods);
      const x = hq.x + (i - 0.5) * MAP.tileSize * 1.2;
      const y = hq.y + (MAP.tileSize * 3.0);
      initUnit(u, meta.workerKind, id, stats, x, y);
      world.bus.emit('unit:spawned', { id: u.id, kind: meta.workerKind, faction: id, x, y });
    }
  }

  // Scatter resource nodes around the map (a few near each base, some central).
  const resourceSpots: Array<[number, number]> = [
    [corners.vanguard.x + 14, corners.vanguard.y + 4],
    [corners.vanguard.x + 4, corners.vanguard.y + 14],
    [corners.swarm.x - 14, corners.swarm.y + 4],
    [corners.swarm.x - 4, corners.swarm.y + 14],
    [corners.titan.x - 10, corners.titan.y - 4],
    [corners.titan.x + 10, corners.titan.y - 4],
    [WORLD.width / 2, WORLD.depth / 2 - 6],
    [WORLD.width / 2 - 12, WORLD.depth / 2],
    [WORLD.width / 2 + 12, WORLD.depth / 2],
    [WORLD.width / 2, WORLD.depth / 2 + 12],
  ];
  for (const [x, y] of resourceSpots) {
    const r = world.resources.acquire();
    if (!r) continue;
    r.x = x; r.y = y;
    r.amount = 1800;
  }

  // Systems — fixed order per spec.
  const cameraSystem = new CameraSystem();
  const fogSystem = new FogSystem(fog);
  const inputSystem = new InputSystem(host);
  const systems: ISystem[] = [
    cameraSystem,
    inputSystem,
    new SelectionSystem(),
    new CommandSystem(),
    new UnitAISystem(),
    new MovementSystem(),
    new CombatSystem(),
    new ProjectileSystem(),
    new ProductionSystem(),
    new EconomySystem(),
    new AIPlayerSystem(),
    fogSystem,
    new VictorySystem(),
    new CleanupSystem(bridge),
  ];
  for (const s of systems) s.init(world);

  // Center camera on player HQ.
  const myHqCorner = corners[playerFaction];
  cameraSystem.centerOn(myHqCorner.x, myHqCorner.y + 10);

  // HUD + UI.
  const hud: HudHandle = createHud(host, world, cameraSystem);
  const card: CommandCardHandle = mountCommandCard(world);
  const floaters: FloatingTextHandle = mountFloatingText(world);
  const audio: AudioKernelHandle = mountAudio(world);

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
      for (const s of systems) s.update(world, dtMs);
    }

    // Visual sync — runs every frame.
    const playerFog = world.factions[world.playerFaction].fog;
    world.units.forEachAlive((u) => bridge.syncUnit(u, playerFog, world.playerFaction));
    world.buildings.forEachAlive((b) => {
      bridge.syncBuilding(b, playerFog, world.playerFaction);
      bridge.syncRally(b, world.playerFaction);
    });
    world.projectiles.forEachAlive((p) => {
      const color = world.units.findById(p.ownerId)
        ? FACTION_COLORS[world.units.findById(p.ownerId)!.faction].accent
        : 0xffffff;
      bridge.syncProjectile(p, color);
    });
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
    audio.updateListener();

    rc.renderer.render(rc.scene, rc.camera);
    animFrame = requestAnimationFrame(frame);
  }
  animFrame = requestAnimationFrame(frame);

  function cleanupAndExit(): void {
    cancelAnimationFrame(animFrame);
    offSelChange();
    offBldChange();
    offVictory();
    offDefeat();
    hud.destroy();
    card.destroy();
    floaters.destroy();
    audio.destroy();
    // Drop three.js.
    rc.renderer.dispose();
    if (rc.renderer.domElement.parentElement) {
      rc.renderer.domElement.parentElement.removeChild(rc.renderer.domElement);
    }
    onExit();
  }

  // Silence unused import warnings referenced via side-effects only.
  void BUILDING_STATS; void SIM;

  return {
    destroy: cleanupAndExit,
  };
}
