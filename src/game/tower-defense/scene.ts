import * as THREE from 'three';
import { WORLD } from '@config/gameplay';
import { createRenderContext } from '@render/scene';
import { screenToGround } from '@render/picking';

interface TowerDefenseSceneHandle {
  destroy(): void;
}

interface Enemy {
  id: number;
  group: THREE.Group;
  hp: number;
  maxHp: number;
  speed: number;
  progress: number;
  reward: number;
  alive: boolean;
}

interface Tripod {
  id: number;
  group: THREE.Group;
  x: number;
  y: number;
  range: number;
  damage: number;
  cooldownMs: number;
  cdLeftMs: number;
  beam: THREE.Line | null;
  beamMs: number;
}

const ROUTE: Array<{ x: number; y: number }> = [
  { x: 4, y: 62 },
  { x: 25, y: 62 },
  { x: 36, y: 38 },
  { x: 64, y: 38 },
  { x: 78, y: 82 },
  { x: 108, y: 82 },
  { x: 123, y: 64 },
];

const BUILD_COST = 120;
const STARTING_CREDITS = 360;

export function startTowerDefenseScene(host: HTMLElement, onExit: () => void): TowerDefenseSceneHandle {
  host.innerHTML = '';
  const rc = createRenderContext(host);
  rc.camera.position.set(WORLD.width / 2, 58, WORLD.depth / 2 + 22);
  rc.camera.lookAt(WORLD.width / 2, 0, WORLD.depth / 2);
  rc.scene.add(makeRouteMesh());
  rc.scene.add(makeCoreMesh(ROUTE[ROUTE.length - 1]!));

  const overlay = mountHud(host, () => destroyScene());
  const enemies: Enemy[] = [];
  const tripods: Tripod[] = [];
  let raf = 0;
  let last = performance.now();
  let nextId = 1;
  let credits = STARTING_CREDITS;
  let lives = 12;
  let wave = 0;
  let spawnLeft = 0;
  let spawnTimerMs = 1200;
  let nextWaveMs = 900;
  let gameEnded = false;

  function spawnEnemy(): void {
    const waveMul = 1 + wave * 0.18;
    const start = ROUTE[0]!;
    const group = makeEnemyMesh(wave);
    group.position.set(start.x, 0, start.y);
    rc.scene.add(group);
    enemies.push({
      id: nextId++,
      group,
      hp: Math.round(80 * waveMul),
      maxHp: Math.round(80 * waveMul),
      speed: 7 + Math.min(6, wave * 0.35),
      progress: 0,
      reward: 18 + Math.floor(wave * 2),
      alive: true,
    });
  }

  function placeTripod(x: number, y: number): void {
    if (gameEnded) return;
    if (credits < BUILD_COST) {
      overlay.notice.textContent = 'Need more credits';
      overlay.notice.classList.add('show');
      window.setTimeout(() => overlay.notice.classList.remove('show'), 800);
      return;
    }
    if (distanceToRoute(x, y) < 5) {
      overlay.notice.textContent = 'Too close to route';
      overlay.notice.classList.add('show');
      window.setTimeout(() => overlay.notice.classList.remove('show'), 800);
      return;
    }
    credits -= BUILD_COST;
    const group = makeTripodMesh();
    group.position.set(x, 0, y);
    rc.scene.add(group);
    tripods.push({
      id: nextId++,
      group,
      x,
      y,
      range: 18,
      damage: 34,
      cooldownMs: 520,
      cdLeftMs: 0,
      beam: null,
      beamMs: 0,
    });
  }

  const onPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    const target = ev.target as HTMLElement | null;
    if (target?.closest('.td-overlay')) return;
    const ground = screenToGround(rc.camera, ev.clientX, ev.clientY, window.innerWidth, window.innerHeight);
    if (!ground) return;
    if (ground.x < 1 || ground.x > WORLD.width - 1 || ground.z < 1 || ground.z > WORLD.depth - 1) return;
    placeTripod(ground.x, ground.z);
  };
  rc.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function tick(now: number): void {
    const dtMs = Math.min(80, now - last);
    last = now;
    if (!gameEnded) {
      if (spawnLeft <= 0) {
        nextWaveMs -= dtMs;
        if (nextWaveMs <= 0) {
          wave += 1;
          spawnLeft = 7 + Math.floor(wave * 1.2);
          spawnTimerMs = 0;
          nextWaveMs = 8500;
        }
      } else {
        spawnTimerMs -= dtMs;
        if (spawnTimerMs <= 0) {
          spawnEnemy();
          spawnLeft -= 1;
          spawnTimerMs = Math.max(360, 920 - wave * 25);
        }
      }

      updateEnemies(dtMs);
      updateTripods(dtMs);
      cleanupDead();
      if (lives <= 0) {
        gameEnded = true;
        overlay.status.textContent = 'CORE LOST';
      }
    }

    overlay.credits.textContent = String(credits);
    overlay.lives.textContent = String(lives);
    overlay.wave.textContent = String(wave);
    overlay.enemies.textContent = String(enemies.filter((e) => e.alive).length + spawnLeft);
    rc.renderer.render(rc.scene, rc.camera);
    raf = requestAnimationFrame(tick);
  }

  function updateEnemies(dtMs: number): void {
    const routeLength = totalRouteLength();
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.progress += enemy.speed * (dtMs / 1000);
      if (enemy.progress >= routeLength) {
        enemy.alive = false;
        lives -= 1;
        continue;
      }
      const p = pointOnRoute(enemy.progress);
      enemy.group.position.set(p.x, 0, p.y);
      enemy.group.rotation.y = Math.PI / 2 - p.angle;
      const hpBar = enemy.group.getObjectByName('hp-fill');
      if (hpBar) hpBar.scale.x = Math.max(0.05, enemy.hp / enemy.maxHp);
    }
  }

  function updateTripods(dtMs: number): void {
    for (const tripod of tripods) {
      tripod.cdLeftMs = Math.max(0, tripod.cdLeftMs - dtMs);
      tripod.beamMs = Math.max(0, tripod.beamMs - dtMs);
      if (tripod.beam && tripod.beamMs <= 0) tripod.beam.visible = false;
      const target = findTarget(tripod);
      if (!target) continue;
      const dx = target.group.position.x - tripod.x;
      const dy = target.group.position.z - tripod.y;
      tripod.group.rotation.y = Math.atan2(dx, dy);
      if (tripod.cdLeftMs > 0) continue;
      target.hp -= tripod.damage;
      tripod.cdLeftMs = tripod.cooldownMs;
      showBeam(tripod, target);
      if (target.hp <= 0) {
        target.alive = false;
        credits += target.reward;
        spawnScorch(target.group.position.x, target.group.position.z);
      }
    }
  }

  function findTarget(tripod: Tripod): Enemy | null {
    let best: Enemy | null = null;
    let bestProgress = -1;
    const r2 = tripod.range * tripod.range;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const dx = enemy.group.position.x - tripod.x;
      const dy = enemy.group.position.z - tripod.y;
      if (dx * dx + dy * dy > r2) continue;
      if (enemy.progress > bestProgress) {
        best = enemy;
        bestProgress = enemy.progress;
      }
    }
    return best;
  }

  function showBeam(tripod: Tripod, enemy: Enemy): void {
    const start = new THREE.Vector3(tripod.x, 5.8, tripod.y);
    const end = new THREE.Vector3(enemy.group.position.x, 1.1, enemy.group.position.z);
    if (!tripod.beam) {
      const mat = new THREE.LineBasicMaterial({ color: 0xff5a34, transparent: true, opacity: 0.95 });
      tripod.beam = new THREE.Line(new THREE.BufferGeometry(), mat);
      rc.scene.add(tripod.beam);
    }
    tripod.beam.geometry.dispose();
    tripod.beam.geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    tripod.beam.visible = true;
    tripod.beamMs = 90;
  }

  function cleanupDead(): void {
    for (const enemy of enemies) {
      if (enemy.alive) continue;
      rc.scene.remove(enemy.group);
      disposeObject(enemy.group);
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (!enemies[i]!.alive) enemies.splice(i, 1);
    }
  }

  function spawnScorch(x: number, y: number): void {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(1.3, 18),
      new THREE.MeshBasicMaterial({ color: 0x39150d, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.035, y);
    rc.scene.add(mesh);
    window.setTimeout(() => {
      rc.scene.remove(mesh);
      disposeObject(mesh);
    }, 4500);
  }

  raf = requestAnimationFrame(tick);

  function destroyScene(): void {
    cancelAnimationFrame(raf);
    rc.renderer.domElement.removeEventListener('pointerdown', onPointerDown);
    overlay.root.remove();
    disposeObject(rc.scene);
    rc.destroy();
    host.innerHTML = '';
    onExit();
  }

  return { destroy: destroyScene };
}

function mountHud(host: HTMLElement, onExit: () => void): {
  root: HTMLDivElement;
  credits: HTMLSpanElement;
  lives: HTMLSpanElement;
  wave: HTMLSpanElement;
  enemies: HTMLSpanElement;
  status: HTMLDivElement;
  notice: HTMLDivElement;
} {
  const root = document.createElement('div');
  root.className = 'td-overlay';
  root.innerHTML = `
    <div class="td-top">
      <div class="td-title">Tripod Defense</div>
      <div class="td-metric">Credits <span data-k="credits">${STARTING_CREDITS}</span></div>
      <div class="td-metric">Core <span data-k="lives">12</span></div>
      <div class="td-metric">Wave <span data-k="wave">0</span></div>
      <div class="td-metric">Incoming <span data-k="enemies">0</span></div>
      <button class="td-exit" type="button">Exit</button>
    </div>
    <div class="td-help">Click open ground to place a heat-ray tripod. Keep the route clear.</div>
    <div class="td-status" data-k="status"></div>
    <div class="td-notice"></div>
  `;
  host.appendChild(root);
  root.querySelector('.td-exit')?.addEventListener('click', onExit);
  return {
    root,
    credits: root.querySelector('[data-k="credits"]')!,
    lives: root.querySelector('[data-k="lives"]')!,
    wave: root.querySelector('[data-k="wave"]')!,
    enemies: root.querySelector('[data-k="enemies"]')!,
    status: root.querySelector('[data-k="status"]')!,
    notice: root.querySelector('.td-notice')!,
  };
}

function makeRouteMesh(): THREE.Group {
  const group = new THREE.Group();
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i]!;
    const b = ROUTE[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const road = new THREE.Mesh(
      new THREE.BoxGeometry(6.4, 0.08, len),
      new THREE.MeshLambertMaterial({ color: 0x2f2520 }),
    );
    road.position.set((a.x + b.x) / 2, 0.06, (a.y + b.y) / 2);
    road.rotation.y = Math.atan2(b.x - a.x, b.y - a.y);
    group.add(road);
    const line = new THREE.Mesh(
      new THREE.BoxGeometry(0.35, 0.1, len),
      new THREE.MeshBasicMaterial({ color: 0xff6f37, transparent: true, opacity: 0.65 }),
    );
    line.position.copy(road.position);
    line.position.y = 0.13;
    line.rotation.y = road.rotation.y;
    group.add(line);
  }
  return group;
}

function makeCoreMesh(p: { x: number; y: number }): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5.5, 1.4, 8), new THREE.MeshLambertMaterial({ color: 0x1b2738 }));
  base.position.y = 0.7;
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(2.6, 1), new THREE.MeshLambertMaterial({ color: 0x78e8ff, emissive: 0x0c5560 }));
  core.position.y = 4.2;
  group.add(base, core);
  group.position.set(p.x, 0, p.y);
  return group;
}

function makeEnemyMesh(wave: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.75, 1.5, 4, 8),
    new THREE.MeshLambertMaterial({ color: wave % 5 === 0 ? 0xb84cff : 0xb8462e }),
  );
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.9;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 10, 8), new THREE.MeshLambertMaterial({ color: 0xffb05f }));
  head.position.set(0.9, 1.05, 0);
  const hpBg = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0x1a0b08 }));
  hpBg.position.set(0, 2.1, 0);
  const hpFill = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xff6e4a }));
  hpFill.name = 'hp-fill';
  hpFill.position.set(0, 2.12, 0);
  group.add(body, head, hpBg, hpFill);
  return group;
}

function makeTripodMesh(): THREE.Group {
  const group = new THREE.Group();
  const metal = new THREE.MeshLambertMaterial({ color: 0x332b48 });
  const hot = new THREE.MeshLambertMaterial({ color: 0xff5a34, emissive: 0x551508 });
  const hub = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 10), metal);
  hub.position.y = 5.5;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.35, 12, 8), hot);
  eye.position.set(0, 5.65, 1);
  group.add(hub, eye);
  for (const foot of [[-1.7, 0, -1.2], [1.7, 0, -1.2], [0, 0, 2.0]] as const) {
    group.add(makeLeg(new THREE.Vector3(0, 5.1, 0), new THREE.Vector3(foot[0], foot[1], foot[2])));
  }
  const range = new THREE.Mesh(
    new THREE.RingGeometry(17.8, 18, 48),
    new THREE.MeshBasicMaterial({ color: 0xff6f37, transparent: true, opacity: 0.13, side: THREE.DoubleSide }),
  );
  range.rotation.x = -Math.PI / 2;
  range.position.y = 0.05;
  group.add(range);
  return group;
}

function makeLeg(a: THREE.Vector3, b: THREE.Vector3): THREE.Mesh {
  const len = a.distanceTo(b);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.18, len, 8), new THREE.MeshLambertMaterial({ color: 0x221c30 }));
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mesh.position.copy(mid);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  return mesh;
}

function totalRouteLength(): number {
  let total = 0;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    total += Math.hypot(ROUTE[i + 1]!.x - ROUTE[i]!.x, ROUTE[i + 1]!.y - ROUTE[i]!.y);
  }
  return total;
}

function pointOnRoute(progress: number): { x: number; y: number; angle: number } {
  let remain = progress;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i]!;
    const b = ROUTE[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (remain <= len) {
      const t = remain / len;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    remain -= len;
  }
  const a = ROUTE[ROUTE.length - 2]!;
  const b = ROUTE[ROUTE.length - 1]!;
  return { x: b.x, y: b.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

function distanceToRoute(x: number, y: number): number {
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ROUTE.length - 1; i++) {
    const a = ROUTE[i]!;
    const b = ROUTE[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / len2));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    best = Math.min(best, Math.hypot(x - px, y - py));
  }
  return best;
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const mat = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
    else if (mat) mat.dispose();
  });
}
