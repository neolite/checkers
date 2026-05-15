import * as THREE from 'three';
import { chooseAiMove } from './ai';
import {
  applyMove,
  createInitialCheckersState,
  generateLegalMoves,
  getGameResult,
  type CheckersMove,
  type CheckersPiece,
  type CheckersSide,
  type CheckersState,
} from './rules';

interface SceneHandle {
  destroy(): void;
}

type CheckersMode = 'ai' | 'hotseat';
type Difficulty = 2 | 4 | 6;
type CameraMode = 'cinematic' | 'top';

const TILE = 1.32;
const BOARD = 8;
const PIECE_Y = 0.24;
const AI_SIDE: CheckersSide = 'black';

export function startCheckersScene(host: HTMLElement, exitToMenu: () => void): SceneHandle {
  const root = document.createElement('div');
  root.className = 'checkers-root';
  host.appendChild(root);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x060403);
  root.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x060403, 18, 42);
  const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 80);

  const board = new THREE.Group();
  scene.add(board);
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const squareMeshes = new Map<string, THREE.Mesh>();
  const pieceMeshes = new Map<number, THREE.Group>();
  const highlightMeshes: THREE.Object3D[] = [];
  const animations: Array<{ pieceId: number; from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number }> = [];
  const timers: number[] = [];

  let state = createInitialCheckersState();
  let selectedPieceId: number | null = null;
  let legalMoves = generateLegalMoves(state);
  let mode: CheckersMode = 'ai';
  let difficulty: Difficulty = 4;
  let cameraMode: CameraMode = 'cinematic';
  let aiThinking = false;

  const hud = createHud(root);
  buildLights(scene);
  buildBoard(board, squareMeshes);
  setCamera(camera, cameraMode);
  syncPieces();
  refreshUi();

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('resize', onResize);
  hud.exit.addEventListener('click', exitToMenu);
  hud.restart.addEventListener('click', () => {
    state = createInitialCheckersState();
    selectedPieceId = null;
    legalMoves = generateLegalMoves(state);
    syncPieces();
    refreshUi();
  });
  hud.undo.addEventListener('click', undo);
  hud.camera.addEventListener('click', () => {
    cameraMode = cameraMode === 'cinematic' ? 'top' : 'cinematic';
    setCamera(camera, cameraMode);
    refreshUi();
  });
  hud.mode.addEventListener('click', () => {
    mode = mode === 'ai' ? 'hotseat' : 'ai';
    selectedPieceId = null;
    refreshUi();
    maybeAiMove();
  });
  for (const button of hud.depths) {
    button.addEventListener('click', () => {
      difficulty = Number(button.dataset['depth']) as Difficulty;
      refreshUi();
    });
  }

  let frame = 0;
  let destroyed = false;
  function loop(now: number): void {
    if (destroyed) return;
    updateAnimations(now);
    renderer.render(scene, camera);
    frame = requestAnimationFrame(loop);
  }
  frame = requestAnimationFrame(loop);

  return {
    destroy() {
      destroyed = true;
      cancelAnimationFrame(frame);
      for (const t of timers) window.clearTimeout(t);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.dispose();
      root.remove();
    },
  };

  function onResize(): void {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }

  function onPointerDown(ev: PointerEvent): void {
    if (aiThinking || state.winner || !isHumanTurn()) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(board.children, true);
    const hit = hits.find((h) => h.object.userData['kind']);
    if (!hit) {
      selectedPieceId = null;
      refreshUi();
      return;
    }
    const data = hit.object.userData as { kind?: string; id?: number; x?: number; y?: number };
    if (data.kind === 'piece' && data.id !== undefined) {
      const piece = state.pieces.find((p) => p.id === data.id);
      if (piece?.side === state.turn) selectedPieceId = piece.id;
      refreshUi();
      return;
    }
    if (data.kind === 'square' && data.x !== undefined && data.y !== undefined) {
      const move = moveForDestination(data.x, data.y);
      if (move) playMove(move);
    }
  }

  function playMove(move: CheckersMove): void {
    const piece = state.pieces.find((p) => p.id === move.pieceId);
    const from = piece ? pieceWorld(piece.x, piece.y, PIECE_Y) : null;
    const toSq = move.path[move.path.length - 1]!;
    state = applyMove(state, move);
    selectedPieceId = null;
    legalMoves = generateLegalMoves(state);
    syncPieces();
    if (from) {
      const mesh = pieceMeshes.get(move.pieceId);
      if (mesh) {
        mesh.position.copy(from);
        animations.push({ pieceId: move.pieceId, from, to: pieceWorld(toSq.x, toSq.y, PIECE_Y), start: performance.now(), duration: move.captures.length > 0 ? 520 : 360 });
      }
    }
    refreshUi();
    maybeAiMove();
  }

  function maybeAiMove(): void {
    if (mode !== 'ai' || state.turn !== AI_SIDE || state.winner) return;
    aiThinking = true;
    refreshUi();
    timers.push(window.setTimeout(() => {
      const move = chooseAiMove(state, difficulty);
      aiThinking = false;
      if (move) playMove(move);
      else refreshUi();
    }, 420));
  }

  function undo(): void {
    const previous = state.history[state.history.length - 1];
    if (!previous) return;
    state = {
      turn: previous.turn,
      pieces: previous.pieces.map((p) => ({ ...p })),
      history: state.history.slice(0, -1),
      winner: null,
    };
    selectedPieceId = null;
    legalMoves = generateLegalMoves(state);
    syncPieces();
    refreshUi();
  }

  function isHumanTurn(): boolean {
    return mode === 'hotseat' || state.turn !== AI_SIDE;
  }

  function moveForDestination(x: number, y: number): CheckersMove | null {
    if (selectedPieceId === null) return null;
    return legalMoves.find((m) => m.pieceId === selectedPieceId && lastSquare(m).x === x && lastSquare(m).y === y) ?? null;
  }

  function syncPieces(): void {
    const alive = new Set(state.pieces.map((p) => p.id));
    for (const [id, mesh] of pieceMeshes) {
      if (!alive.has(id)) {
        board.remove(mesh);
        dispose(mesh);
        pieceMeshes.delete(id);
      }
    }
    for (const piece of state.pieces) {
      let mesh = pieceMeshes.get(piece.id);
      if (!mesh) {
        mesh = makePieceMesh(piece);
        pieceMeshes.set(piece.id, mesh);
        board.add(mesh);
      }
      mesh.userData['piece'] = piece;
      mesh.position.copy(pieceWorld(piece.x, piece.y, PIECE_Y));
      mesh.traverse((child) => {
        child.userData['kind'] = 'piece';
        child.userData['id'] = piece.id;
      });
      setPieceVisual(mesh, piece);
    }
    refreshHighlights();
  }

  function refreshUi(): void {
    const result = getGameResult(state);
    const captures = legalMoves.filter((m) => m.captures.length > 0);
    hud.turn.textContent = state.winner ? `${labelSide(state.winner)} wins` : aiThinking ? 'Black thinking...' : `${labelSide(state.turn)} to move`;
    hud.mode.textContent = mode === 'ai' ? 'Mode: Player vs AI' : 'Mode: Local Hotseat';
    hud.camera.textContent = cameraMode === 'cinematic' ? 'Camera: Cinematic' : 'Camera: Top';
    hud.forced.textContent = captures.length > 0 ? 'Forced capture' : result ? result.reason : 'Free move';
    hud.captured.textContent = `${12 - state.pieces.filter((p) => p.side === 'white').length} / ${12 - state.pieces.filter((p) => p.side === 'black').length}`;
    hud.undo.disabled = state.history.length === 0;
    for (const button of hud.depths) button.classList.toggle('active', Number(button.dataset['depth']) === difficulty);
    hud.moves.innerHTML = state.history.slice(-12).map((h, i) => {
      const n = state.history.length - state.history.slice(-12).length + i + 1;
      const move = h.move;
      return `<div><b>${n}.</b> ${labelSide(h.turn)} ${coord(move.from)}-${move.path.map(coord).join('-')}${move.captures.length ? ' ×' + move.captures.length : ''}</div>`;
    }).join('');
    refreshHighlights();
  }

  function refreshHighlights(): void {
    for (const h of highlightMeshes) {
      board.remove(h);
      dispose(h);
    }
    highlightMeshes.length = 0;
    const forcedPieceIds = new Set(legalMoves.filter((m) => m.captures.length > 0).map((m) => m.pieceId));
    for (const id of forcedPieceIds) {
      const piece = state.pieces.find((p) => p.id === id);
      if (piece) addRing(piece.x, piece.y, 0xffa24a, 0.44, 0.58);
    }
    if (selectedPieceId !== null) {
      const piece = state.pieces.find((p) => p.id === selectedPieceId);
      if (piece) addRing(piece.x, piece.y, 0xfff1c0, 0.64, 0.66);
      for (const move of legalMoves.filter((m) => m.pieceId === selectedPieceId)) {
        const sq = lastSquare(move);
        addDisc(sq.x, sq.y, move.captures.length > 0 ? 0xff7a45 : 0x6fd0ff, move.captures.length > 0 ? 0.32 : 0.22);
      }
    }
  }

  function addDisc(x: number, y: number, color: number, opacity: number): void {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(TILE * 0.32, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(pieceWorld(x, y, 0.055));
    highlightMeshes.push(mesh);
    board.add(mesh);
  }

  function addRing(x: number, y: number, color: number, opacity: number, radius: number): void {
    const mesh = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.025, 8, 56),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity }),
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.copy(pieceWorld(x, y, 0.11));
    highlightMeshes.push(mesh);
    board.add(mesh);
  }

  function updateAnimations(now: number): void {
    for (let i = animations.length - 1; i >= 0; i--) {
      const a = animations[i]!;
      const mesh = pieceMeshes.get(a.pieceId);
      if (!mesh) {
        animations.splice(i, 1);
        continue;
      }
      const t = Math.min(1, (now - a.start) / a.duration);
      const eased = 1 - Math.pow(1 - t, 3);
      mesh.position.lerpVectors(a.from, a.to, eased);
      mesh.position.y += Math.sin(Math.PI * t) * 0.55;
      if (t >= 1) animations.splice(i, 1);
    }
  }
}

function buildLights(scene: THREE.Scene): void {
  scene.add(new THREE.HemisphereLight(0xffe8c8, 0x1a0f08, 0.72));
  const key = new THREE.DirectionalLight(0xffd8a8, 1.8);
  key.position.set(-5, 11, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  scene.add(key);
  const rim = new THREE.PointLight(0x9fd3ff, 2.2, 18);
  rim.position.set(4, 4.5, -5);
  scene.add(rim);
}

function buildBoard(board: THREE.Group, squares: Map<string, THREE.Mesh>): void {
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(TILE * 8.7, 0.34, TILE * 8.7),
    new THREE.MeshStandardMaterial({ color: 0x2a1710, roughness: 0.52, metalness: 0.15, map: makeWoodTexture(512) }),
  );
  base.position.y = -0.2;
  base.castShadow = true;
  base.receiveShadow = true;
  board.add(base);
  for (let y = 0; y < BOARD; y++) {
    for (let x = 0; x < BOARD; x++) {
      const dark = (x + y) % 2 === 1;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(TILE * 0.98, 0.11, TILE * 0.98),
        new THREE.MeshStandardMaterial({
          color: dark ? 0x4a2418 : 0xd6b27c,
          roughness: dark ? 0.68 : 0.48,
          metalness: 0.03,
          map: makeWoodTexture(256),
        }),
      );
      mesh.position.copy(pieceWorld(x, y, 0));
      mesh.userData['kind'] = 'square';
      mesh.userData['x'] = x;
      mesh.userData['y'] = y;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      squares.set(`${x}:${y}`, mesh);
      board.add(mesh);
    }
  }
}

function makePieceMesh(piece: CheckersPiece): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.48, 0.28, 48, 2),
    new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.18 }),
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);
  const bevel = new THREE.Mesh(
    new THREE.TorusGeometry(0.39, 0.035, 10, 48),
    new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.45 }),
  );
  bevel.position.y = 0.155;
  bevel.rotation.x = Math.PI / 2;
  group.add(bevel);
  const crown = new THREE.Mesh(
    new THREE.TorusGeometry(0.25, 0.025, 8, 40),
    new THREE.MeshStandardMaterial({ color: 0xffd989, roughness: 0.22, metalness: 0.65 }),
  );
  crown.name = 'crown';
  crown.position.y = 0.205;
  crown.rotation.x = Math.PI / 2;
  group.add(crown);
  setPieceVisual(group, piece);
  return group;
}

function setPieceVisual(group: THREE.Group, piece: CheckersPiece): void {
  const bodyColor = piece.side === 'white' ? 0xf2dec1 : 0x19100d;
  const rimColor = piece.side === 'white' ? 0xc78d52 : 0x9f3428;
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (child.name === 'crown') {
      child.visible = piece.king;
      continue;
    }
    material.color.set(child === group.children[0] ? bodyColor : rimColor);
  }
}

function createHud(root: HTMLElement): {
  camera: HTMLButtonElement;
  captured: HTMLElement;
  depths: HTMLButtonElement[];
  exit: HTMLButtonElement;
  forced: HTMLElement;
  mode: HTMLButtonElement;
  moves: HTMLElement;
  restart: HTMLButtonElement;
  turn: HTMLElement;
  undo: HTMLButtonElement;
} {
  const overlay = document.createElement('div');
  overlay.className = 'checkers-overlay';
  overlay.innerHTML = `
    <div class="checkers-top">
      <div>
        <div class="checkers-title">Premium Checkers</div>
        <div class="checkers-sub">Russian 8x8 · forced captures · flying kings</div>
      </div>
      <div class="checkers-pill" id="ck-turn"></div>
      <div class="checkers-pill warn" id="ck-forced"></div>
      <button class="ck-btn" id="ck-exit">Menu</button>
    </div>
    <div class="checkers-side">
      <button class="ck-btn wide" id="ck-mode"></button>
      <div class="ck-row">
        <button class="ck-btn depth" data-depth="2">Casual</button>
        <button class="ck-btn depth" data-depth="4">Classic</button>
        <button class="ck-btn depth" data-depth="6">Hard</button>
      </div>
      <button class="ck-btn wide" id="ck-camera"></button>
      <div class="ck-stat"><span>Captured W/B</span><b id="ck-captured">0 / 0</b></div>
      <div class="ck-actions">
        <button class="ck-btn" id="ck-undo">Undo</button>
        <button class="ck-btn" id="ck-restart">Restart</button>
      </div>
      <div class="ck-log" id="ck-moves"></div>
    </div>
    <div class="checkers-help">Click a piece, then a highlighted square. Orange means capture is forced.</div>
  `;
  root.appendChild(overlay);
  return {
    camera: overlay.querySelector('#ck-camera') as HTMLButtonElement,
    captured: overlay.querySelector('#ck-captured') as HTMLElement,
    depths: [...overlay.querySelectorAll('.depth')] as HTMLButtonElement[],
    exit: overlay.querySelector('#ck-exit') as HTMLButtonElement,
    forced: overlay.querySelector('#ck-forced') as HTMLElement,
    mode: overlay.querySelector('#ck-mode') as HTMLButtonElement,
    moves: overlay.querySelector('#ck-moves') as HTMLElement,
    restart: overlay.querySelector('#ck-restart') as HTMLButtonElement,
    turn: overlay.querySelector('#ck-turn') as HTMLElement,
    undo: overlay.querySelector('#ck-undo') as HTMLButtonElement,
  };
}

function setCamera(camera: THREE.PerspectiveCamera, mode: CameraMode): void {
  if (mode === 'top') {
    camera.position.set(0, 13.5, 0.02);
    camera.lookAt(0, 0, 0);
  } else {
    camera.position.set(0, 8.8, 9.4);
    camera.lookAt(0, 0, -0.4);
  }
}

function pieceWorld(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3((x - 3.5) * TILE, z, (y - 3.5) * TILE);
}

function lastSquare(move: CheckersMove): { x: number; y: number } {
  return move.path[move.path.length - 1]!;
}

function coord(s: { x: number; y: number }): string {
  return `${String.fromCharCode(97 + s.x)}${8 - s.y}`;
}

function labelSide(side: CheckersSide): string {
  return side === 'white' ? 'White' : 'Black';
}

function makeWoodTexture(size: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#6b3b22';
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 3) {
    const alpha = 0.05 + Math.sin(y * 0.08) * 0.025;
    ctx.fillStyle = `rgba(255,220,160,${alpha})`;
    ctx.fillRect(0, y, size, 1);
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(30,12,4,${0.035 + Math.random() * 0.045})`;
    const y = Math.random() * size;
    ctx.fillRect(0, y, size, 1 + Math.random() * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.4, 2.4);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function dispose(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = (mesh as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material?.dispose();
  });
}
