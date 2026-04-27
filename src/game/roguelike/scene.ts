import * as THREE from 'three';
import { WORLD } from '@config/gameplay';
import { createRenderContext } from '@render/scene';
import { screenToGround } from '@render/picking';

interface RoguelikeSceneHandle {
  destroy(): void;
}

interface Rect {
  x: number;
  z: number;
  w: number;
  h: number;
}

interface Player {
  group: THREE.Group;
  hp: number;
  maxHp: number;
  xp: number;
  level: number;
  gold: number;
  damage: number;
  speed: number;
  attackCdMs: number;
}

interface Enemy {
  id: number;
  group: THREE.Group;
  hp: number;
  maxHp: number;
  speed: number;
  damage: number;
  contactCdMs: number;
  alive: boolean;
  xp: number;
  gold: number;
}

interface Loot {
  group: THREE.Group;
  kind: 'health' | 'gold';
  amount: number;
}

interface SlashFx {
  obj: THREE.Object3D;
  ttlMs: number;
}

const ROOMS: Rect[] = [
  { x: 14, z: 16, w: 22, h: 16 },
  { x: 46, z: 14, w: 24, h: 18 },
  { x: 84, z: 18, w: 24, h: 18 },
  { x: 20, z: 52, w: 24, h: 20 },
  { x: 58, z: 50, w: 26, h: 22 },
  { x: 94, z: 58, w: 20, h: 24 },
  { x: 36, z: 90, w: 28, h: 20 },
  { x: 78, z: 92, w: 26, h: 18 },
];

const CORRIDORS: Rect[] = [
  { x: 35, z: 21, w: 13, h: 8 },
  { x: 69, z: 23, w: 17, h: 8 },
  { x: 28, z: 31, w: 8, h: 23 },
  { x: 43, z: 58, w: 17, h: 8 },
  { x: 83, z: 63, w: 13, h: 8 },
  { x: 67, z: 71, w: 8, h: 24 },
  { x: 54, z: 95, w: 26, h: 8 },
  { x: 64, z: 36, w: 8, h: 16 },
];

const WALKABLE: Rect[] = [...ROOMS, ...CORRIDORS];
const START = { x: 25, z: 24 };

export function startRoguelikeScene(host: HTMLElement, onExit: () => void): RoguelikeSceneHandle {
  host.innerHTML = '';
  const rc = createRenderContext(host);
  rc.camera.position.set(START.x, 46, START.z + 36);
  rc.camera.lookAt(START.x, 0, START.z);

  const dungeon = makeDungeonMesh();
  rc.scene.add(dungeon);

  const player: Player = {
    group: makePlayerMesh(),
    hp: 120,
    maxHp: 120,
    xp: 0,
    level: 1,
    gold: 0,
    damage: 32,
    speed: 18,
    attackCdMs: 0,
  };
  player.group.position.set(START.x, 0, START.z);
  rc.scene.add(player.group);

  const overlay = mountHud(host, () => destroyScene());
  const keys = new Set<string>();
  const enemies: Enemy[] = [];
  const loot: Loot[] = [];
  const slashFx: SlashFx[] = [];
  let raf = 0;
  let last = performance.now();
  let nextId = 1;
  let dead = false;
  let destroyed = false;
  let lastAim = new THREE.Vector3(1, 0, 0);
  let messageTimer = 0;

  spawnEnemies();

  const onKeyDown = (ev: KeyboardEvent): void => {
    const code = ev.code;
    if (code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD') {
      keys.add(code);
      ev.preventDefault();
    }
    if (code === 'Space') {
      ev.preventDefault();
      attack(lastAim);
    }
  };

  const onKeyUp = (ev: KeyboardEvent): void => {
    keys.delete(ev.code);
  };

  const onPointerDown = (ev: PointerEvent): void => {
    if (ev.button !== 0) return;
    const target = ev.target as HTMLElement | null;
    if (target?.closest('.rl-overlay')) return;
    const ground = screenToGround(rc.camera, ev.clientX, ev.clientY, window.innerWidth, window.innerHeight);
    if (!ground) return;
    const aim = new THREE.Vector3(ground.x - player.group.position.x, 0, ground.z - player.group.position.z);
    if (aim.lengthSq() > 0.001) attack(aim.normalize());
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  rc.renderer.domElement.addEventListener('pointerdown', onPointerDown);

  function spawnEnemies(): void {
    for (let i = 1; i < ROOMS.length; i++) {
      const room = ROOMS[i]!;
      const count = i % 3 === 0 ? 3 : 2;
      for (let j = 0; j < count; j++) {
        const x = room.x + 5 + ((j * 7 + i * 3) % Math.max(1, room.w - 9));
        const z = room.z + 5 + ((j * 5 + i * 4) % Math.max(1, room.h - 9));
        const group = makeEnemyMesh(i);
        group.position.set(x, 0, z);
        rc.scene.add(group);
        enemies.push({
          id: nextId++,
          group,
          hp: 55 + i * 8,
          maxHp: 55 + i * 8,
          speed: 7.5 + i * 0.35,
          damage: 8 + Math.floor(i / 2),
          contactCdMs: 0,
          alive: true,
          xp: 18 + i * 2,
          gold: 8 + i * 2,
        });
      }
    }
  }

  function tick(now: number): void {
    const dtMs = Math.min(80, now - last);
    last = now;
    player.attackCdMs = Math.max(0, player.attackCdMs - dtMs);

    if (!dead) {
      updatePlayer(dtMs);
      updateEnemies(dtMs);
      updateLoot();
      cleanupDead();
      if (player.hp <= 0) {
        player.hp = 0;
        dead = true;
        showMessage('Suit integrity failed');
      }
    }

    updateFx(dtMs);
    updateCamera();
    updateHud();
    rc.renderer.render(rc.scene, rc.camera);
    raf = requestAnimationFrame(tick);
  }

  function updatePlayer(dtMs: number): void {
    const move = new THREE.Vector3(
      (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0),
      0,
      (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0),
    );
    if (move.lengthSq() <= 0) return;
    move.normalize();
    lastAim = move.clone();
    player.group.rotation.y = Math.atan2(move.x, move.z);
    const next = player.group.position.clone().addScaledVector(move, player.speed * dtMs / 1000);
    if (isWalkable(next.x, next.z)) player.group.position.copy(next);
  }

  function updateEnemies(dtMs: number): void {
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      enemy.contactCdMs = Math.max(0, enemy.contactCdMs - dtMs);
      const toPlayer = player.group.position.clone().sub(enemy.group.position);
      const dist = toPlayer.length();
      if (dist < 34 && dist > 0.01) {
        const dir = toPlayer.multiplyScalar(1 / dist);
        const next = enemy.group.position.clone().addScaledVector(dir, enemy.speed * dtMs / 1000);
        if (isWalkable(next.x, next.z)) enemy.group.position.copy(next);
        enemy.group.rotation.y = Math.atan2(dir.x, dir.z);
      }
      if (dist < 1.8 && enemy.contactCdMs <= 0) {
        player.hp -= enemy.damage;
        enemy.contactCdMs = 700;
        showMessage('Armor hit');
      }
      const hpFill = enemy.group.getObjectByName('hp-fill');
      if (hpFill) hpFill.scale.x = Math.max(0.04, enemy.hp / enemy.maxHp);
    }
  }

  function updateLoot(): void {
    for (let i = loot.length - 1; i >= 0; i--) {
      const item = loot[i]!;
      item.group.rotation.y += 0.03;
      if (item.group.position.distanceTo(player.group.position) > 2.1) continue;
      if (item.kind === 'health') {
        player.hp = Math.min(player.maxHp, player.hp + item.amount);
        showMessage('Med crystal absorbed');
      } else {
        player.gold += item.amount;
      }
      rc.scene.remove(item.group);
      disposeObject(item.group);
      loot.splice(i, 1);
    }
  }

  function attack(direction: THREE.Vector3): void {
    if (dead || player.attackCdMs > 0) return;
    const dir = direction.clone().setY(0);
    if (dir.lengthSq() <= 0.001) return;
    dir.normalize();
    lastAim = dir.clone();
    player.group.rotation.y = Math.atan2(dir.x, dir.z);
    player.attackCdMs = 360;
    spawnSlash(dir);

    const origin = player.group.position;
    for (const enemy of enemies) {
      if (!enemy.alive) continue;
      const toEnemy = enemy.group.position.clone().sub(origin);
      const dist = toEnemy.length();
      if (dist > 6.2) continue;
      const facing = dist <= 1.6 ? 1 : toEnemy.normalize().dot(dir);
      if (facing < 0.28) continue;
      enemy.hp -= player.damage;
      if (enemy.hp <= 0) {
        enemy.alive = false;
        player.xp += enemy.xp;
        player.gold += enemy.gold;
        maybeDropLoot(enemy.group.position.x, enemy.group.position.z, enemy.id);
        handleLevelUps();
      }
    }
  }

  function spawnSlash(dir: THREE.Vector3): void {
    const geom = new THREE.TorusGeometry(3.4, 0.055, 8, 32, Math.PI * 1.12);
    const mat = new THREE.MeshBasicMaterial({ color: 0x73f6ff, transparent: true, opacity: 0.92 });
    const slash = new THREE.Mesh(geom, mat);
    slash.position.copy(player.group.position).addScaledVector(dir, 3.2);
    slash.position.y = 0.35;
    slash.rotation.x = Math.PI / 2;
    slash.rotation.z = -Math.atan2(dir.z, dir.x);
    rc.scene.add(slash);
    slashFx.push({ obj: slash, ttlMs: 130 });
  }

  function updateFx(dtMs: number): void {
    for (let i = slashFx.length - 1; i >= 0; i--) {
      const fx = slashFx[i]!;
      fx.ttlMs -= dtMs;
      fx.obj.scale.multiplyScalar(1 + dtMs / 460);
      const mat = (fx.obj as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
      if (mat) mat.opacity = Math.max(0, fx.ttlMs / 130);
      if (fx.ttlMs > 0) continue;
      rc.scene.remove(fx.obj);
      disposeObject(fx.obj);
      slashFx.splice(i, 1);
    }
  }

  function cleanupDead(): void {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const enemy = enemies[i]!;
      if (enemy.alive) continue;
      spawnBurst(enemy.group.position.x, enemy.group.position.z);
      rc.scene.remove(enemy.group);
      disposeObject(enemy.group);
      enemies.splice(i, 1);
    }
  }

  function maybeDropLoot(x: number, z: number, id: number): void {
    if (id % 3 !== 0) return;
    const kind: Loot['kind'] = id % 2 === 0 ? 'health' : 'gold';
    const group = makeLootMesh(kind);
    group.position.set(x, 0, z);
    rc.scene.add(group);
    loot.push({ group, kind, amount: kind === 'health' ? 22 : 14 });
  }

  function handleLevelUps(): void {
    while (player.xp >= 100) {
      player.xp -= 100;
      player.level += 1;
      if (player.level % 2 === 0) {
        player.maxHp += 22;
        player.hp = player.maxHp;
        showMessage(`Level ${player.level}: max HP increased`);
      } else {
        player.damage += 8;
        showMessage(`Level ${player.level}: slash damage increased`);
      }
    }
  }

  function spawnBurst(x: number, z: number): void {
    const burst = new THREE.Mesh(
      new THREE.CircleGeometry(1.45, 18),
      new THREE.MeshBasicMaterial({ color: 0xff4f8d, transparent: true, opacity: 0.38, depthWrite: false }),
    );
    burst.rotation.x = -Math.PI / 2;
    burst.position.set(x, 0.08, z);
    rc.scene.add(burst);
    slashFx.push({ obj: burst, ttlMs: 360 });
  }

  function updateCamera(): void {
    const p = player.group.position;
    const desired = new THREE.Vector3(p.x, 42, p.z + 33);
    rc.camera.position.lerp(desired, 0.08);
    rc.camera.lookAt(p.x, 0, p.z);
  }

  function updateHud(): void {
    overlay.hp.textContent = `${Math.ceil(player.hp)} / ${player.maxHp}`;
    overlay.xp.textContent = `${player.xp} / 100`;
    overlay.level.textContent = String(player.level);
    overlay.gold.textContent = String(player.gold);
    overlay.enemies.textContent = String(enemies.length);
    overlay.status.textContent = dead ? 'DOWN' : 'ACTIVE';
  }

  function showMessage(text: string): void {
    overlay.notice.textContent = text;
    overlay.notice.classList.add('show');
    window.clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => overlay.notice.classList.remove('show'), 900);
  }

  raf = requestAnimationFrame(tick);

  function destroyScene(): void {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(raf);
    window.clearTimeout(messageTimer);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
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
  hp: HTMLSpanElement;
  xp: HTMLSpanElement;
  level: HTMLSpanElement;
  gold: HTMLSpanElement;
  enemies: HTMLSpanElement;
  status: HTMLSpanElement;
  notice: HTMLDivElement;
} {
  const root = document.createElement('div');
  root.className = 'rl-overlay';
  root.innerHTML = `
    <div class="rl-top">
      <div class="rl-title">Rift Rogue</div>
      <div class="rl-metric">HP <span data-k="hp">120 / 120</span></div>
      <div class="rl-metric">XP <span data-k="xp">0 / 100</span></div>
      <div class="rl-metric">Level <span data-k="level">1</span></div>
      <div class="rl-metric">Gold <span data-k="gold">0</span></div>
      <div class="rl-metric">Drones <span data-k="enemies">0</span></div>
      <div class="rl-metric">Suit <span data-k="status">ACTIVE</span></div>
      <button class="rl-exit" type="button">Exit</button>
    </div>
    <div class="rl-help">WASD move. Space or click to slash.</div>
    <div class="rl-toast"></div>
  `;
  host.appendChild(root);
  root.querySelector('.rl-exit')?.addEventListener('click', onExit);
  return {
    root,
    hp: root.querySelector('[data-k="hp"]')!,
    xp: root.querySelector('[data-k="xp"]')!,
    level: root.querySelector('[data-k="level"]')!,
    gold: root.querySelector('[data-k="gold"]')!,
    enemies: root.querySelector('[data-k="enemies"]')!,
    status: root.querySelector('[data-k="status"]')!,
    notice: root.querySelector('.rl-toast')!,
  };
}

function makeDungeonMesh(): THREE.Group {
  const group = new THREE.Group();
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x263447 });
  const edgeMat = new THREE.MeshLambertMaterial({ color: 0x111a25 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x73f6ff, transparent: true, opacity: 0.16 });

  for (const rect of WALKABLE) {
    const floor = new THREE.Mesh(new THREE.BoxGeometry(rect.w, 0.12, rect.h), floorMat.clone());
    floor.position.set(rect.x + rect.w / 2, 0.07, rect.z + rect.h / 2);
    floor.receiveShadow = true;
    group.add(floor);

    const glow = new THREE.Mesh(new THREE.PlaneGeometry(rect.w - 1, rect.h - 1), glowMat.clone());
    glow.rotation.x = -Math.PI / 2;
    glow.position.set(rect.x + rect.w / 2, 0.145, rect.z + rect.h / 2);
    group.add(glow);
  }

  for (const room of ROOMS) addRoomWalls(group, room, edgeMat);

  return group;
}

function addRoomWalls(group: THREE.Group, room: Rect, mat: THREE.Material): void {
  addSplitWall(group, 'x', room.x, room.x + room.w, room.z - 0.5, room, mat);
  addSplitWall(group, 'x', room.x, room.x + room.w, room.z + room.h + 0.5, room, mat);
  addSplitWall(group, 'z', room.z, room.z + room.h, room.x - 0.5, room, mat);
  addSplitWall(group, 'z', room.z, room.z + room.h, room.x + room.w + 0.5, room, mat);
}

function addSplitWall(
  group: THREE.Group,
  axis: 'x' | 'z',
  start: number,
  end: number,
  fixed: number,
  room: Rect,
  mat: THREE.Material,
): void {
  const roomEdge = axis === 'x' ? (fixed < room.z ? room.z : room.z + room.h) : (fixed < room.x ? room.x : room.x + room.w);
  const openings: Array<{ start: number; end: number }> = [];
  for (const corridor of CORRIDORS) {
    let opening: { start: number; end: number } | null = null;
    if (axis === 'x') {
      if (corridor.z <= roomEdge && corridor.z + corridor.h >= roomEdge) {
        opening = { start: Math.max(start, corridor.x + 0.8), end: Math.min(end, corridor.x + corridor.w - 0.8) };
      }
    } else if (corridor.x <= roomEdge && corridor.x + corridor.w >= roomEdge) {
      opening = { start: Math.max(start, corridor.z + 0.8), end: Math.min(end, corridor.z + corridor.h - 0.8) };
    }
    if (opening && opening.end - opening.start > 1.4) openings.push(opening);
  }
  openings.sort((a, b) => a.start - b.start);

  let cursor = start - 0.5;
  for (const opening of openings) {
    addWallSegment(group, axis, cursor, opening.start, fixed, mat);
    cursor = Math.max(cursor, opening.end);
  }
  addWallSegment(group, axis, cursor, end + 0.5, fixed, mat);
}

function addWallSegment(group: THREE.Group, axis: 'x' | 'z', start: number, end: number, fixed: number, mat: THREE.Material): void {
  const length = end - start;
  if (length < 1.2) return;
  if (axis === 'x') addWall(group, start + length / 2, fixed, length, 1, mat);
  else addWall(group, fixed, start + length / 2, 1, length, mat);
}

function addWall(group: THREE.Group, x: number, z: number, w: number, h: number, mat: THREE.Material): void {
  const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 2.2, h), mat.clone());
  wall.position.set(x, 1.1, z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);
}

function makePlayerMesh(): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.75, 1.6, 5, 12),
    new THREE.MeshLambertMaterial({ color: 0x7df7ff, emissive: 0x0a4d55 }),
  );
  body.position.y = 1.25;
  body.castShadow = true;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.2, 0.16), new THREE.MeshBasicMaterial({ color: 0x061017 }));
  visor.position.set(0, 1.62, 0.68);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.12, 1.28, 24),
    new THREE.MeshBasicMaterial({ color: 0x73f6ff, transparent: true, opacity: 0.42, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  group.add(body, visor, ring);
  return group;
}

function makeEnemyMesh(seed: number): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 1.05, 1.1, 8),
    new THREE.MeshLambertMaterial({ color: seed % 2 === 0 ? 0xbe4dff : 0xff4f8d, emissive: 0x260012 }),
  );
  body.position.y = 0.75;
  body.castShadow = true;
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff1a8 }));
  eye.position.set(0, 1.0, 0.82);
  const hpBg = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.08), new THREE.MeshBasicMaterial({ color: 0x17070c }));
  hpBg.position.set(0, 1.75, 0);
  const hpFill = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: 0xff7aa8 }));
  hpFill.name = 'hp-fill';
  hpFill.position.set(0, 1.77, 0);
  group.add(body, eye, hpBg, hpFill);
  return group;
}

function makeLootMesh(kind: Loot['kind']): THREE.Group {
  const group = new THREE.Group();
  const color = kind === 'health' ? 0x54ff9c : 0xffd36b;
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.58, 0),
    new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.25 }),
  );
  crystal.position.y = 0.78;
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.8, 0.95, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.34, side: THREE.DoubleSide }),
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.08;
  group.add(crystal, halo);
  return group;
}

function isWalkable(x: number, z: number): boolean {
  if (x < 1 || z < 1 || x > WORLD.width - 1 || z > WORLD.depth - 1) return false;
  return WALKABLE.some((rect) => x >= rect.x + 0.8 && x <= rect.x + rect.w - 0.8 && z >= rect.z + 0.8 && z <= rect.z + rect.h - 0.8);
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
