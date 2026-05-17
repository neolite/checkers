import * as THREE from 'three';
import { chooseAiMove } from './ai';
import {
  applyMove,
  createInitialCheckersState,
  generateLegalMoves,
  getGameResult,
  getNoProgressPly,
  type CheckersResult,
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
interface CheckersResults {
  aiWins: number;
  aiLosses: number;
  draws: number;
  hotseatGames: number;
  lastResult: string;
}

const TILE = 1.32;
const BOARD = 8;
const PIECE_Y = 0.24;
const DRAG_LIFT_Y = PIECE_Y + 0.42;
const DRAG_THRESHOLD_PX = 6;
const AI_SIDE: CheckersSide = 'black';
const RESULTS_KEY = 'sc-gens:premium-checkers-results:v1';

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
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_LIFT_Y);
  const dragPoint = new THREE.Vector3();

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
  let gameStarted = false;
  let recordedResultKey: string | null = null;
  let panelCollapsed = window.innerWidth < 920;
  let dragState: { pieceId: number; pointerId: number; startX: number; startY: number; origin: THREE.Vector3; active: boolean } | null = null;
  let dragHoverSquare: { x: number; y: number } | null = null;
  let dragHoverMarker: THREE.Object3D | null = null;
  let guideTimer: number | null = null;

  const hud = createHud(root);
  root.classList.toggle('panel-collapsed', panelCollapsed);
  buildLights(scene);
  buildBoard(board, squareMeshes);
  setCamera(camera, cameraMode);
  syncPieces();
  refreshUi();

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointercancel', cancelDrag);
  renderer.domElement.addEventListener('pointerleave', resetCanvasCursor);
  window.addEventListener('resize', onResize);
  hud.exit.addEventListener('click', exitToMenu);
  hud.restart.addEventListener('click', () => {
    startMatch();
  });
  hud.gameOverRestart.addEventListener('click', startMatch);
  hud.start.addEventListener('click', startMatch);
  hud.undo.addEventListener('click', undo);
  hud.togglePanel.addEventListener('click', () => {
    panelCollapsed = !panelCollapsed;
    root.classList.toggle('panel-collapsed', panelCollapsed);
    refreshUi();
  });
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
  for (const button of hud.startDepths) {
    button.addEventListener('click', () => {
      difficulty = Number(button.dataset['depth']) as Difficulty;
      refreshUi();
    });
  }
  for (const button of hud.startModes) {
    button.addEventListener('click', () => {
      mode = button.dataset['mode'] === 'hotseat' ? 'hotseat' : 'ai';
      selectedPieceId = null;
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
      if (guideTimer !== null) window.clearTimeout(guideTimer);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointercancel', cancelDrag);
      renderer.domElement.removeEventListener('pointerleave', resetCanvasCursor);
      renderer.dispose();
      root.remove();
    },
  };

  function onResize(): void {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    if (window.innerWidth < 920 && !panelCollapsed) {
      panelCollapsed = true;
      root.classList.add('panel-collapsed');
      refreshUi();
    }
  }

  function onPointerDown(ev: PointerEvent): void {
    if (!gameStarted || aiThinking || isGameOver() || !isHumanTurn()) return;
    const hit = hitAtPointer(ev);
    if (!hit) {
      selectedPieceId = null;
      refreshUi();
      return;
    }
    const data = hit.object.userData as { kind?: string; id?: number; x?: number; y?: number };
    if (data.kind === 'piece' && data.id !== undefined) {
      if (canSelectPiece(data.id)) {
        selectedPieceId = data.id;
        beginDrag(ev, data.id);
      } else {
        selectedPieceId = null;
        const piece = state.pieces.find((p) => p.id === data.id);
        if (piece?.side === state.turn) showGuideText(reasonPieceCannotMove(data.id));
      }
      refreshUi();
      return;
    }
    if (data.kind === 'square' && data.x !== undefined && data.y !== undefined) {
      const move = moveForDestination(data.x, data.y);
      if (move) playMove(move);
    }
  }

  function onPointerMove(ev: PointerEvent): void {
    if (dragState) {
      updateDrag(ev);
      return;
    }
    if (!gameStarted || aiThinking || isGameOver() || !isHumanTurn()) {
      resetCanvasCursor();
      return;
    }
    const hit = hitAtPointer(ev);
    const data = hit?.object.userData as { kind?: string; id?: number; x?: number; y?: number } | undefined;
    const overMovablePiece = data?.kind === 'piece' && data.id !== undefined && canSelectPiece(data.id);
    const overMoveTarget = data?.kind === 'square' && data.x !== undefined && data.y !== undefined && moveForDestination(data.x, data.y) !== null;
    renderer.domElement.style.cursor = overMovablePiece || overMoveTarget ? 'pointer' : 'default';
  }

  function onPointerUp(ev: PointerEvent): void {
    if (!dragState || dragState.pointerId !== ev.pointerId) return;
    const drag = dragState;
    dragState = null;
    releasePointer(ev.pointerId);
    const drop = drag.active ? squareAtPointer(ev) : null;
    const move = drop ? moveForDestination(drop.x, drop.y) : null;
    if (move) {
      clearDragHover();
      playMove(move, pieceMeshes.get(drag.pieceId)?.position.clone() ?? drag.origin.clone());
      return;
    }
    if (drag.active) showGuideText('Drop on a highlighted square to move.');
    const mesh = pieceMeshes.get(drag.pieceId);
    if (mesh) mesh.position.copy(drag.origin);
    clearDragHover();
    resetCanvasCursor();
  }

  function beginDrag(ev: PointerEvent, pieceId: number): void {
    const mesh = pieceMeshes.get(pieceId);
    if (!mesh) return;
    dragState = {
      pieceId,
      pointerId: ev.pointerId,
      startX: ev.clientX,
      startY: ev.clientY,
      origin: mesh.position.clone(),
      active: false,
    };
    clearDragHover();
    renderer.domElement.setPointerCapture?.(ev.pointerId);
    renderer.domElement.style.cursor = 'grab';
  }

  function updateDrag(ev: PointerEvent): void {
    const drag = dragState;
    if (!drag || drag.pointerId !== ev.pointerId) return;
    const distance = Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY);
    if (!drag.active && distance < DRAG_THRESHOLD_PX) {
      renderer.domElement.style.cursor = 'grab';
      return;
    }
    drag.active = true;
    const point = pointerWorldOnDragPlane(ev);
    const mesh = pieceMeshes.get(drag.pieceId);
    if (point && mesh) {
      mesh.position.set(point.x, DRAG_LIFT_Y, point.z);
    }
    setDragHoverSquare(point ? squareAtWorldPoint(point) : null);
    renderer.domElement.style.cursor = 'grabbing';
  }

  function cancelDrag(ev?: PointerEvent): void {
    clearDragHover();
    if (!dragState) {
      resetCanvasCursor();
      return;
    }
    const drag = dragState;
    dragState = null;
    if (ev) releasePointer(ev.pointerId);
    const mesh = pieceMeshes.get(drag.pieceId);
    if (mesh) mesh.position.copy(drag.origin);
    resetCanvasCursor();
  }

  function squareAtPointer(ev: PointerEvent): { x: number; y: number } | null {
    const point = pointerWorldOnDragPlane(ev);
    return point ? squareAtWorldPoint(point) : null;
  }

  function squareAtWorldPoint(point: THREE.Vector3): { x: number; y: number } | null {
    if (!point) return null;
    const x = Math.round(point.x / TILE + 3.5);
    const y = Math.round(point.z / TILE + 3.5);
    if (x < 0 || x >= BOARD || y < 0 || y >= BOARD) return null;
    return { x, y };
  }

  function setDragHoverSquare(square: { x: number; y: number } | null): void {
    const move = square ? moveForDestination(square.x, square.y) : null;
    const next = move && square ? square : null;
    if (sameSquare(dragHoverSquare, next)) return;
    clearDragHover();
    dragHoverSquare = next;
    if (!next || !move) return;
    const piece = state.pieces.find((p) => p.id === selectedPieceId);
    dragHoverMarker = makeDragHoverMarker(next.x, next.y, move.captures.length > 0, piece ?? null, move);
    board.add(dragHoverMarker);
  }

  function clearDragHover(): void {
    dragHoverSquare = null;
    if (!dragHoverMarker) return;
    board.remove(dragHoverMarker);
    dispose(dragHoverMarker);
    dragHoverMarker = null;
  }

  function sameSquare(a: { x: number; y: number } | null, b: { x: number; y: number } | null): boolean {
    return a?.x === b?.x && a?.y === b?.y;
  }

  function pointerWorldOnDragPlane(ev: PointerEvent): THREE.Vector3 | null {
    updatePointerFromEvent(ev);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.ray.intersectPlane(dragPlane, dragPoint);
  }

  function hitAtPointer(ev: PointerEvent): THREE.Intersection<THREE.Object3D> | undefined {
    updatePointerFromEvent(ev);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(board.children, true).find((h) => h.object.userData['kind']);
  }

  function updatePointerFromEvent(ev: PointerEvent): void {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function releasePointer(pointerId: number): void {
    if (renderer.domElement.hasPointerCapture?.(pointerId)) {
      renderer.domElement.releasePointerCapture(pointerId);
    }
  }

  function canSelectPiece(pieceId: number): boolean {
    const piece = state.pieces.find((p) => p.id === pieceId);
    return Boolean(piece?.side === state.turn && legalMoves.some((m) => m.pieceId === pieceId));
  }

  function reasonPieceCannotMove(pieceId: number): string {
    const forced = legalMoves.filter((m) => m.captures.length > 0);
    if (forced.length > 0 && !forced.some((m) => m.pieceId === pieceId)) {
      return 'Forced capture: another piece must jump.';
    }
    return 'This piece has no legal move.';
  }

  function showGuideText(message: string): void {
    hud.guide.textContent = message;
    hud.guide.classList.add('show');
    if (guideTimer !== null) window.clearTimeout(guideTimer);
    guideTimer = window.setTimeout(() => {
      hud.guide.classList.remove('show');
      guideTimer = null;
    }, 1700);
  }

  function resetCanvasCursor(): void {
    renderer.domElement.style.cursor = 'default';
  }

  function playMove(move: CheckersMove, animationFrom?: THREE.Vector3): void {
    const piece = state.pieces.find((p) => p.id === move.pieceId);
    const from = animationFrom ?? (piece ? pieceWorld(piece.x, piece.y, PIECE_Y) : null);
    const toSq = move.path[move.path.length - 1]!;
    state = applyMove(state, move);
    cancelDrag();
    selectedPieceId = null;
    legalMoves = generateLegalMoves(state);
    resetCanvasCursor();
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
    if (!gameStarted || mode !== 'ai' || state.turn !== AI_SIDE || isGameOver()) return;
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

  function startMatch(): void {
    state = createInitialCheckersState();
    cancelDrag();
    selectedPieceId = null;
    legalMoves = generateLegalMoves(state);
    aiThinking = false;
    gameStarted = true;
    recordedResultKey = null;
    resetCanvasCursor();
    root.classList.add('playing');
    syncPieces();
    refreshUi();
  }

  function isHumanTurn(): boolean {
    return mode === 'hotseat' || state.turn !== AI_SIDE;
  }

  function isGameOver(): boolean {
    return Boolean(state.winner || getGameResult(state));
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
    const winner = state.winner ?? result?.winner ?? null;
    const isDraw = result?.winner === null;
    const captures = legalMoves.filter((m) => m.captures.length > 0);
    const quietPly = getNoProgressPly(state);
    hud.turn.textContent = isDraw ? 'Draw' : winner ? `${labelSide(winner)} wins` : aiThinking ? 'Black thinking...' : `${labelSide(state.turn)} to move`;
    hud.mode.textContent = mode === 'ai' ? 'Mode: Player vs AI' : 'Mode: Local Hotseat';
    hud.camera.textContent = cameraMode === 'cinematic' ? 'Camera: Cinematic' : 'Camera: Top';
    hud.forced.textContent = captures.length > 0 ? 'Forced capture' : resultLabel(result) ?? (quietPly > 0 ? `Quiet clock ${quietPly}/80` : 'Free move');
    hud.togglePanel.textContent = panelCollapsed ? 'Show Panel' : 'Hide Panel';
    hud.gameOver.classList.toggle('show', Boolean(winner || isDraw));
    hud.gameOverCopy.innerHTML = gameOverCopy(result, winner);
    hud.captured.textContent = `${12 - state.pieces.filter((p) => p.side === 'white').length} / ${12 - state.pieces.filter((p) => p.side === 'black').length}`;
    hud.undo.disabled = state.history.length === 0;
    for (const button of hud.depths) button.classList.toggle('active', Number(button.dataset['depth']) === difficulty);
    for (const button of hud.startDepths) button.classList.toggle('active', Number(button.dataset['depth']) === difficulty);
    for (const button of hud.startModes) button.classList.toggle('active', button.dataset['mode'] === mode);
    hud.startModeLabel.textContent = mode === 'ai' ? 'Player vs AI' : 'Local Hotseat';
    hud.startDifficultyLabel.textContent = difficultyLabel(difficulty);
    hud.moves.innerHTML = state.history.slice(-12).map((h, i) => {
      const n = state.history.length - state.history.slice(-12).length + i + 1;
      const move = h.move;
      return `<div><b>${n}.</b> ${labelSide(h.turn)} ${coord(move.from)}-${move.path.map(coord).join('-')}${move.captures.length ? ' ×' + move.captures.length : ''}</div>`;
    }).join('');
    recordResultIfNeeded();
    hud.results.innerHTML = renderResults(loadResults());
    refreshHighlights();
  }

  function recordResultIfNeeded(): void {
    const result = getGameResult(state);
    const winner = state.winner ?? result?.winner ?? null;
    if (!gameStarted || !result) return;
    const key = `${result.reason}:${winner ?? 'draw'}:${state.history.length}`;
    if (recordedResultKey === key) return;
    const results = loadResults();
    if (winner === null) {
      results.draws += 1;
    } else if (mode === 'ai') {
      if (winner === 'white') results.aiWins += 1;
      else results.aiLosses += 1;
    } else {
      results.hotseatGames += 1;
    }
    results.lastResult = winner === null
      ? `${resultLabel(result)} in ${state.history.length} moves`
      : `${labelSide(winner)} won${resultSuffix(result)} in ${state.history.length} moves`;
    saveResults(results);
    recordedResultKey = key;
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

  function makeDragHoverMarker(x: number, y: number, capture: boolean, piece: CheckersPiece | null, move: CheckersMove): THREE.Group {
    const group = new THREE.Group();
    const color = capture ? 0xff7a45 : 0x9fe7ff;
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(TILE * 0.42, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: capture ? 0.46 : 0.34, depthWrite: false, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    group.add(disc);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(TILE * 0.36, 0.03, 8, 60),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.82, depthWrite: false }),
    );
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    if (piece) {
      const ghostPiece = {
        ...piece,
        x,
        y,
        king: piece.king || move.promotes,
      };
      const ghost = makePieceMesh(ghostPiece);
      ghost.traverse((child) => {
        const mesh = child as THREE.Mesh;
        const material = mesh.material as THREE.MeshStandardMaterial | undefined;
        if (material) {
          material.transparent = true;
          material.opacity = 0.42;
          material.depthWrite = false;
        }
      });
      ghost.position.y = PIECE_Y + 0.08;
      ghost.scale.setScalar(0.94);
      group.add(ghost);
    }
    group.position.copy(pieceWorld(x, y, 0.13));
    return group;
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
  gameOver: HTMLElement;
  gameOverCopy: HTMLElement;
  gameOverRestart: HTMLButtonElement;
  guide: HTMLElement;
  mode: HTMLButtonElement;
  moves: HTMLElement;
  restart: HTMLButtonElement;
  results: HTMLElement;
  start: HTMLButtonElement;
  startDepths: HTMLButtonElement[];
  startDifficultyLabel: HTMLElement;
  startModeLabel: HTMLElement;
  startModes: HTMLButtonElement[];
  togglePanel: HTMLButtonElement;
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
      <button class="ck-btn" id="ck-toggle-panel">Hide Panel</button>
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
    <div class="checkers-gameover" id="ck-gameover">
      <div id="ck-gameover-copy"></div>
      <button class="ck-btn" id="ck-gameover-restart">New Match</button>
    </div>
    <div class="checkers-guide" id="ck-guide"></div>
    <div class="checkers-help">Click a piece, then a highlighted square. Orange means capture is forced.</div>
    <div class="checkers-start">
      <div class="ck-hero-card">
        <div class="ck-eyebrow">Luxury board experience</div>
        <h1>Premium Checkers</h1>
        <p>Russian 8x8 rules with mandatory captures, flying kings, cinematic camera and local AI.</p>
        <div class="ck-start-grid">
          <div class="ck-choice">
            <div class="ck-choice-head">
              <span>Game Type</span>
              <b id="ck-start-mode-label">Player vs AI</b>
            </div>
            <div class="ck-row">
              <button class="ck-btn start-mode active" data-mode="ai">Player vs AI</button>
              <button class="ck-btn start-mode" data-mode="hotseat">Hotseat</button>
            </div>
          </div>
          <div class="ck-choice">
            <div class="ck-choice-head">
              <span>Difficulty</span>
              <b id="ck-start-difficulty-label">Classic</b>
            </div>
            <div class="ck-row">
              <button class="ck-btn start-depth" data-depth="2">Casual</button>
              <button class="ck-btn start-depth active" data-depth="4">Classic</button>
              <button class="ck-btn start-depth" data-depth="6">Hard</button>
            </div>
          </div>
        </div>
        <button class="ck-start-btn" id="ck-start">Start Match</button>
      </div>
      <div class="ck-results-card">
        <div class="ck-results-title">Results Table</div>
        <div id="ck-results"></div>
      </div>
    </div>
  `;
  root.appendChild(overlay);
  return {
    camera: overlay.querySelector('#ck-camera') as HTMLButtonElement,
    captured: overlay.querySelector('#ck-captured') as HTMLElement,
    depths: [...overlay.querySelectorAll('.depth')] as HTMLButtonElement[],
    exit: overlay.querySelector('#ck-exit') as HTMLButtonElement,
    forced: overlay.querySelector('#ck-forced') as HTMLElement,
    gameOver: overlay.querySelector('#ck-gameover') as HTMLElement,
    gameOverCopy: overlay.querySelector('#ck-gameover-copy') as HTMLElement,
    gameOverRestart: overlay.querySelector('#ck-gameover-restart') as HTMLButtonElement,
    guide: overlay.querySelector('#ck-guide') as HTMLElement,
    mode: overlay.querySelector('#ck-mode') as HTMLButtonElement,
    moves: overlay.querySelector('#ck-moves') as HTMLElement,
    restart: overlay.querySelector('#ck-restart') as HTMLButtonElement,
    results: overlay.querySelector('#ck-results') as HTMLElement,
    start: overlay.querySelector('#ck-start') as HTMLButtonElement,
    startDepths: [...overlay.querySelectorAll('.start-depth')] as HTMLButtonElement[],
    startDifficultyLabel: overlay.querySelector('#ck-start-difficulty-label') as HTMLElement,
    startModeLabel: overlay.querySelector('#ck-start-mode-label') as HTMLElement,
    startModes: [...overlay.querySelectorAll('.start-mode')] as HTMLButtonElement[],
    togglePanel: overlay.querySelector('#ck-toggle-panel') as HTMLButtonElement,
    turn: overlay.querySelector('#ck-turn') as HTMLElement,
    undo: overlay.querySelector('#ck-undo') as HTMLButtonElement,
  };
}

function resultLabel(result: CheckersResult | null): string | null {
  if (!result) return null;
  if (result.reason === 'pat') return 'Pat: no legal moves';
  if (result.reason === 'king-majority') return 'Endgame adjudication';
  if (result.reason === 'draw-repetition') return 'Draw: repeated position';
  if (result.reason === 'draw-no-progress') return 'Draw: no progress';
  return 'No pieces left';
}

function resultSuffix(result: CheckersResult | null): string {
  if (!result) return '';
  if (result.reason === 'pat') return ' by pat';
  if (result.reason === 'king-majority') return ' by king majority';
  if (result.reason === 'no-pieces') return ' by capture';
  return '';
}

function gameOverCopy(result: CheckersResult | null, winner: CheckersSide | null): string {
  if (result?.winner === null) {
    return `<div class="ck-gameover-kicker">${resultLabel(result)}</div><div class="ck-gameover-title">Draw</div><div class="ck-gameover-sub">${drawCopy(result)}</div>`;
  }
  if (!winner) return '';
  return `<div class="ck-gameover-kicker">${resultLabel(result) ?? 'Match complete'}</div><div class="ck-gameover-title">${labelSide(winner)} wins</div><div class="ck-gameover-sub">${winCopy(result, winner)}</div>`;
}

function winCopy(result: CheckersResult | null, winner: CheckersSide): string {
  if (result?.reason === 'pat') return `${labelSide(opponent(winner))} has no legal moves. Pat counts as a loss.`;
  if (result?.reason === 'king-majority') return `${labelSide(winner)} has a clean king majority in a no-capture endgame.`;
  return 'Opponent has no pieces left.';
}

function drawCopy(result: CheckersResult): string {
  if (result.reason === 'draw-repetition') return 'Same position appeared three times.';
  if (result.reason === 'draw-no-progress') return 'No capture or promotion happened for 80 plies.';
  return 'Match complete.';
}

function opponent(side: CheckersSide): CheckersSide {
  return side === 'white' ? 'black' : 'white';
}

function difficultyLabel(difficulty: Difficulty): string {
  if (difficulty === 2) return 'Casual';
  if (difficulty === 6) return 'Hard';
  return 'Classic';
}

function loadResults(): CheckersResults {
  try {
    const raw = window.localStorage.getItem(RESULTS_KEY);
    if (!raw) return emptyResults();
    const parsed = JSON.parse(raw) as Partial<CheckersResults>;
    return {
      aiWins: Number(parsed.aiWins) || 0,
      aiLosses: Number(parsed.aiLosses) || 0,
      draws: Number(parsed.draws) || 0,
      hotseatGames: Number(parsed.hotseatGames) || 0,
      lastResult: typeof parsed.lastResult === 'string' ? parsed.lastResult : 'No matches yet',
    };
  } catch {
    return emptyResults();
  }
}

function saveResults(results: CheckersResults): void {
  window.localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
}

function emptyResults(): CheckersResults {
  return { aiWins: 0, aiLosses: 0, draws: 0, hotseatGames: 0, lastResult: 'No matches yet' };
}

function renderResults(results: CheckersResults): string {
  return `
    <div class="ck-result-row"><span>AI wins</span><b>${results.aiWins}</b></div>
    <div class="ck-result-row"><span>AI losses</span><b>${results.aiLosses}</b></div>
    <div class="ck-result-row"><span>Draws</span><b>${results.draws}</b></div>
    <div class="ck-result-row"><span>Hotseat games</span><b>${results.hotseatGames}</b></div>
    <div class="ck-last-result">${results.lastResult}</div>
  `;
}

function setCamera(camera: THREE.PerspectiveCamera, mode: CameraMode): void {
  const focusX = -1.05;
  if (mode === 'top') {
    camera.position.set(focusX, 13.5, 0.02);
    camera.lookAt(focusX, 0, 0);
  } else {
    camera.position.set(focusX, 8.8, 9.4);
    camera.lookAt(focusX, 0, -0.4);
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
