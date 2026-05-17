import * as THREE from 'three';
import { chooseAiMove } from './ai';
import { buildCoachReport, liveCoachTipMeta } from './coach';
import { DEFAULT_LOCALE, LOCALES, localeLabel, t, type Locale } from './i18n';
import {
  applyMove,
  createInitialCheckersState,
  generateLegalMoves,
  getGameResult,
  getNoProgressPly,
  resign,
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
type ThemeMode = 'midnight' | 'light';
type PieceSkin = 'classic' | 'obsidian' | 'aurora';
interface LastResultData {
  kind: 'win' | 'draw';
  side?: CheckersSide;
  reason: CheckersResult['reason'];
  moves: number;
}
interface CheckersResults {
  aiWins: number;
  aiLosses: number;
  draws: number;
  hotseatGames: number;
  lastResult: LastResultData | null;
}
interface CheckersProfile {
  handle: string;
  city: string;
  theme: ThemeMode;
  pro: boolean;
  skin: PieceSkin;
  locale: Locale;
  onboarded: boolean;
}

type OnboardingStep = 1 | 2 | 3 | 'back';
interface LeaderboardRow {
  handle: string;
  city: string;
  rating: number;
  streak: string;
}

const TILE = 1.32;
const BOARD = 8;
const PIECE_Y = 0.24;
const DRAG_LIFT_Y = PIECE_Y + 0.42;
const DRAG_THRESHOLD_PX = 6;
const AI_SIDE: CheckersSide = 'black';
const RESULTS_KEY = 'sc-gens:premium-checkers-results:v1';
const PROFILE_KEY = 'sc-gens:premium-checkers-profile:v1';

interface OpponentPersona {
  handle: string;
  rating: number;
  tagline: string;
  accent: string;
  initials: string;
  firstName: string;
}

const PERSONA_ACCENTS = { 2: '#7ef5b3', 4: '#8fd0ff', 6: '#ff9a5c' } as const;
const PERSONA_RATINGS = { 2: 1100, 4: 1500, 6: 2000 } as const;
const PERSONA_INITIALS = { 2: 'YB', 4: 'DE', 6: 'M8' } as const;
const PERSONA_NAME_KEY: Record<Difficulty, 'yara' | 'dana' | 'magnus'> = { 2: 'yara', 4: 'dana', 6: 'magnus' };
const PERSONA_AVATAR_KEY: Record<Difficulty, 'yara' | 'dana' | 'magnus'> = { 2: 'yara', 4: 'dana', 6: 'magnus' };
const HOTSEAT_ACCENT = '#ffd79d';
const HOTSEAT_INITIALS = '2P';

function getPersona(diff: Difficulty, locale: Locale): OpponentPersona {
  const slug = PERSONA_NAME_KEY[diff];
  return {
    handle: t(locale, `persona.${slug}.handle`),
    rating: PERSONA_RATINGS[diff],
    tagline: t(locale, `persona.${slug}.tagline`),
    accent: PERSONA_ACCENTS[diff],
    initials: PERSONA_INITIALS[diff],
    firstName: t(locale, `persona.${slug}.first`),
  };
}

function getHotseatPersona(locale: Locale): OpponentPersona {
  return {
    handle: t(locale, 'persona.hotseat.handle'),
    rating: 0,
    tagline: t(locale, 'persona.hotseat.tagline'),
    accent: HOTSEAT_ACCENT,
    initials: HOTSEAT_INITIALS,
    firstName: t(locale, 'persona.hotseat.handle'),
  };
}

function evaluatePosition(state: CheckersState): number {
  let score = 0;
  for (const p of state.pieces) {
    const v = p.king ? 3 : 1;
    score += p.side === 'white' ? v : -v;
  }
  return Math.max(-12, Math.min(12, score));
}

const LOOKFOR_BY_TIP: Record<string, string> = {
  'tip.forced-jump': 'lookfor.forced',
  'tip.king-row': 'lookfor.king-row',
  'tip.center-control': 'lookfor.center',
  'tip.tempo': 'lookfor.tempo',
  'tip.no-legal': 'lookfor.decided',
};

const TONE_BY_TIP: Record<string, 'good' | 'warning' | 'idea'> = {
  'tip.forced-jump': 'warning',
  'tip.king-row': 'good',
  'tip.center-control': 'idea',
  'tip.tempo': 'idea',
  'tip.no-legal': 'idea',
};

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
  let profile = loadProfile();
  let aiThinking = false;
  let gameStarted = false;
  let recordedResultKey: string | null = null;
  let firstSelectionMade = false;
  let openPopover: 'opponent' | 'settings' | null = null;
  let onboardingStep: OnboardingStep = profile.onboarded ? 'back' : 1;
  let dragState: { pieceId: number; pointerId: number; startX: number; startY: number; origin: THREE.Vector3; active: boolean } | null = null;
  let dragHoverSquare: { x: number; y: number } | null = null;
  let dragHoverMarker: THREE.Object3D | null = null;
  let guideTimer: number | null = null;

  const hud = createHud(root);
  applyLocale();
  applyStepUI();
  buildLights(scene);
  buildBoard(board, squareMeshes);
  setCamera(camera, cameraMode);
  applyTheme();
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
  hud.surrender.addEventListener('click', () => {
    if (hud.surrender.disabled) return;
    closePopovers();
    showConfirmSurrender();
  });
  hud.confirmCancel.addEventListener('click', hideConfirmSurrender);
  hud.confirmConfirm.addEventListener('click', () => {
    hideConfirmSurrender();
    surrender();
  });
  hud.gameOverRestart.addEventListener('click', startMatch);
  hud.gameOverReview.addEventListener('click', openReview);
  hud.start.addEventListener('click', startMatch);
  hud.undo.addEventListener('click', undo);
  hud.camera2d.addEventListener('click', () => setCameraMode('top'));
  hud.camera3d.addEventListener('click', () => setCameraMode('cinematic'));
  hud.iconOpponent.addEventListener('click', (ev) => {
    ev.stopPropagation();
    togglePopover('opponent');
  });
  hud.iconSettings.addEventListener('click', (ev) => {
    ev.stopPropagation();
    togglePopover('settings');
  });
  hud.iconTheme.addEventListener('click', () => {
    profile = { ...profile, theme: profile.theme === 'midnight' ? 'light' : 'midnight' };
    saveProfile(profile);
    applyTheme();
    refreshUi();
  });
  hud.iconPro.addEventListener('click', () => hud.pro.click());
  function toggleLocale(): void {
    const idx = LOCALES.indexOf(profile.locale);
    const next = LOCALES[(idx + 1) % LOCALES.length] ?? DEFAULT_LOCALE;
    profile = { ...profile, locale: next };
    saveProfile(profile);
    applyLocale();
    applyStepUI();
    refreshUi();
  }
  hud.language.addEventListener('click', toggleLocale);
  hud.profileLang.addEventListener('click', toggleLocale);
  hud.next.addEventListener('click', () => {
    if (onboardingStep === 1) setStep(2);
    else if (onboardingStep === 2) setStep(3);
  });
  hud.prev.addEventListener('click', () => {
    if (onboardingStep === 2) setStep(1);
    else if (onboardingStep === 3) setStep(2);
  });
  hud.editProfile.addEventListener('click', () => setStep(2));
  hud.iconInvite.addEventListener('click', () => {
    void shareChallenge();
  });
  for (const card of hud.opponentCards) {
    card.addEventListener('click', () => {
      const depth = Number(card.dataset['depth']) as Difficulty;
      difficulty = depth;
      if (mode === 'hotseat') mode = 'ai';
      selectedPieceId = null;
      closePopovers();
      refreshUi();
      maybeAiMove();
    });
  }
  hud.hotseatBtn.addEventListener('click', () => {
    mode = mode === 'ai' ? 'hotseat' : 'ai';
    selectedPieceId = null;
    closePopovers();
    refreshUi();
    maybeAiMove();
  });
  hud.coach.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    const action = target?.closest<HTMLElement>('[data-action]')?.dataset['action'];
    if (action === 'open-review-from-coach') openReview();
  });
  hud.review.addEventListener('click', (ev) => {
    const target = ev.target as HTMLElement | null;
    const action = target?.closest<HTMLElement>('[data-action]')?.dataset['action'];
    if (!action) {
      if (target === hud.review) closeReview();
      return;
    }
    if (action === 'close') closeReview();
    if (action === 'replay') {
      closeReview();
      startMatch();
    }
    if (action === 'menu') {
      closeReview();
      exitToMenu();
    }
    if (action === 'pro') {
      hud.pro.click();
      refreshReviewBody();
    }
  });
  document.addEventListener('click', (ev) => {
    if (!openPopover) return;
    const target = ev.target as HTMLElement | null;
    if (target?.closest('.ck-popover')) return;
    if (target?.closest('.ck-icon-btn')) return;
    closePopovers();
  });
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
  hud.profileHandle.addEventListener('change', () => {
    profile = {
      ...profile,
      handle: sanitizeProfileValue(hud.profileHandle.value, t(profile.locale, 'start.guest')),
    };
    saveProfile(profile);
    refreshUi();
  });
  hud.profileCity.addEventListener('change', () => {
    profile = {
      ...profile,
      city: sanitizeProfileValue(hud.profileCity.value, t(profile.locale, 'start.default-city')),
    };
    saveProfile(profile);
    refreshUi();
  });
  hud.skin.addEventListener('click', () => {
    profile = { ...profile, skin: nextSkin(profile.skin, profile.pro) };
    saveProfile(profile);
    syncPieces();
    refreshUi();
  });
  hud.pro.addEventListener('click', () => {
    profile = { ...profile, pro: true, skin: profile.skin === 'classic' ? 'aurora' : profile.skin };
    saveProfile(profile);
    syncPieces();
    showGuideText(t(profile.locale, 'guide.pro-unlocked'));
    refreshUi();
  });
  hud.share.addEventListener('click', () => {
    void shareChallenge();
  });
  applyChallengeHash();

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

  function applyTheme(): void {
    const light = profile.theme === 'light';
    root.classList.toggle('theme-light', light);
    renderer.setClearColor(light ? 0xf1dfc4 : 0x060403);
    scene.fog = new THREE.Fog(light ? 0xf1dfc4 : 0x060403, light ? 20 : 18, light ? 46 : 42);
  }

  async function shareChallenge(): Promise<void> {
    const url = new URL(window.location.href);
    const citySlug = encodeURIComponent(profile.city.toLowerCase().replace(/\s+/g, '-'));
    url.hash = `checkers-${mode}-${difficulty}-${citySlug}`;
    try {
      await navigator.clipboard?.writeText(url.toString());
      showGuideText(t(profile.locale, 'guide.link-copied'));
    } catch {
      window.location.hash = url.hash;
      showGuideText(t(profile.locale, 'guide.link-ready'));
    }
  }

  function applyChallengeHash(): void {
    const match = /^#checkers-(ai|hotseat)-(2|4|6)-/.exec(window.location.hash);
    if (!match) return;
    mode = match[1] === 'hotseat' ? 'hotseat' : 'ai';
    difficulty = Number(match[2]) as Difficulty;
    startMatch();
    showGuideText(t(profile.locale, 'guide.link-loaded'));
  }

  function onResize(): void {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
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
        firstSelectionMade = true;
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
    if (drag.active) showGuideText(t(profile.locale, 'guide.drop-on-highlight'));
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
      return t(profile.locale, 'guide.forced');
    }
    return t(profile.locale, 'guide.no-legal');
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
      resignedBy: null,
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
    firstSelectionMade = false;
    recordedResultKey = null;
    closePopovers();
    hideConfirmSurrender();
    hud.review.classList.remove('open');
    resetCanvasCursor();
    root.classList.add('playing');
    if (!profile.onboarded) {
      profile = { ...profile, onboarded: true };
      saveProfile(profile);
      onboardingStep = 'back';
      applyStepUI();
    }
    syncPieces();
    refreshUi();
  }

  function setStep(next: OnboardingStep): void {
    onboardingStep = next;
    applyStepUI();
  }

  function applyStepUI(): void {
    const locale = profile.locale;
    hud.hero.dataset['step'] = String(onboardingStep);
    const startWrap = hud.hero.closest('.checkers-start') as HTMLElement | null;
    if (startWrap) startWrap.dataset['step'] = String(onboardingStep);
    if (onboardingStep === 1) {
      hud.stepEyebrow.textContent = t(locale, 'onboard.welcome.eyebrow');
      hud.stepTitle.textContent = t(locale, 'onboard.welcome.title');
      hud.stepBody.textContent = t(locale, 'onboard.welcome.body');
      hud.next.textContent = t(locale, 'onboard.welcome.cta');
    } else if (onboardingStep === 2) {
      hud.stepEyebrow.textContent = t(locale, 'onboard.profile.eyebrow');
      hud.stepTitle.textContent = t(locale, 'onboard.profile.title');
      hud.stepBody.textContent = t(locale, 'onboard.profile.body');
      hud.next.textContent = t(locale, 'onboard.next');
      hud.prev.textContent = t(locale, 'onboard.back');
    } else if (onboardingStep === 3) {
      hud.stepEyebrow.textContent = t(locale, 'onboard.opponent.eyebrow');
      hud.stepTitle.textContent = t(locale, 'onboard.opponent.title');
      hud.stepBody.textContent = t(locale, 'onboard.opponent.body');
      hud.start.textContent = t(locale, 'onboard.opponent.cta');
      hud.prev.textContent = t(locale, 'onboard.back');
    } else {
      hud.stepEyebrow.textContent = t(locale, 'welcome-back.eyebrow');
      hud.stepTitle.textContent = t(locale, 'welcome-back.title', { name: profile.handle });
      hud.stepBody.textContent = t(locale, 'welcome-back.body');
      hud.start.textContent = t(locale, 'start.cta');
      hud.editProfile.textContent = t(locale, 'welcome-back.edit');
    }
    if (typeof onboardingStep === 'number') {
      const dots = [1, 2, 3].map((n) => `<span class="ck-dot ${n === onboardingStep ? 'active' : ''}"></span>`).join('');
      hud.stepIndicator.innerHTML = `${dots}<span class="ck-step-of">${escapeHtml(t(locale, 'onboard.step-of', { n: onboardingStep, total: 3 }))}</span>`;
    } else {
      hud.stepIndicator.innerHTML = '';
    }
    hud.profileLang.textContent = t(locale, 'settings.language');
    for (const feat of hud.feats) {
      const n = feat.dataset['feat'];
      const b = feat.querySelector('b');
      const span = feat.querySelector('span');
      if (b) b.textContent = t(locale, `onboard.welcome.feat${n}.t`);
      if (span) span.textContent = t(locale, `onboard.welcome.feat${n}.b`);
    }
  }

  function surrender(): void {
    if (!gameStarted || aiThinking || isGameOver() || !isHumanTurn()) return;
    cancelDrag();
    selectedPieceId = null;
    state = resign(state);
    legalMoves = [];
    resetCanvasCursor();
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
        mesh = makePieceMesh(piece, profile.skin);
        pieceMeshes.set(piece.id, mesh);
        board.add(mesh);
      }
      mesh.userData['piece'] = piece;
      mesh.position.copy(pieceWorld(piece.x, piece.y, PIECE_Y));
      mesh.traverse((child) => {
        child.userData['kind'] = 'piece';
        child.userData['id'] = piece.id;
      });
      setPieceVisual(mesh, piece, profile.skin);
    }
    refreshHighlights();
  }

  function refreshUi(): void {
    const result = getGameResult(state);
    const winner = state.winner ?? result?.winner ?? null;
    const isDraw = result?.winner === null;
    const captures = legalMoves.filter((m) => m.captures.length > 0);
    const gameOver = Boolean(winner || isDraw);
    const locale = profile.locale;
    hud.turn.textContent = isDraw
      ? t(locale, 'turn.draw')
      : winner
        ? t(locale, 'turn.wins', { side: labelSide(winner, locale) })
        : aiThinking
          ? t(locale, 'turn.black-thinking')
          : t(locale, state.turn === 'white' ? 'turn.white-to-move' : 'turn.black-to-move');
    hud.turnPill.classList.toggle('black', !winner && !isDraw && state.turn === 'black');
    hud.turnPill.classList.toggle('thinking', aiThinking);
    if (captures.length > 0 && !gameOver) {
      hud.forced.textContent = t(locale, 'turn.forced-capture');
      hud.forced.style.display = '';
    } else {
      hud.forced.style.display = 'none';
    }
    hud.gameOver.classList.toggle('show', gameOver);
    hud.gameOverCopy.innerHTML = gameOverCopy(result, winner, locale);
    renderCapturedStacks(state.pieces, locale);
    hud.undo.disabled = state.history.length === 0;
    hud.surrender.disabled = !gameStarted || aiThinking || gameOver || !isHumanTurn();
    if (document.activeElement !== hud.profileHandle) hud.profileHandle.value = profile.handle;
    if (document.activeElement !== hud.profileCity) hud.profileCity.value = profile.city;
    hud.profileLabel.textContent = `${profile.handle} · ${profile.city}`;
    hud.skin.textContent = t(locale, 'settings.skin', { name: skinLabel(profile.skin, locale) });
    hud.camera3d.classList.toggle('active', cameraMode === 'cinematic');
    hud.camera2d.classList.toggle('active', cameraMode === 'top');
    hud.help.classList.toggle('hidden', firstSelectionMade || !gameStarted || gameOver);
    syncOpponentIcon();
    syncOpponentPopover();
    syncProIcon();
    hud.pro.textContent = t(locale, profile.pro ? 'settings.pro.active' : 'settings.pro.upgrade');
    hud.pro.disabled = profile.pro;
    hud.language.textContent = t(locale, 'settings.language');
    for (const button of hud.startDepths) button.classList.toggle('active', Number(button.dataset['depth']) === difficulty);
    for (const button of hud.startModes) button.classList.toggle('active', button.dataset['mode'] === mode);
    hud.startModeLabel.textContent = mode === 'ai' ? t(locale, 'start.player-vs-ai') : t(locale, 'persona.hotseat.handle');
    const dPersona = getPersona(difficulty, locale);
    hud.startDifficultyLabel.textContent = `${dPersona.handle} · ${dPersona.rating}`;
    hud.moves.innerHTML = renderHistory(state.history, locale);
    recordResultIfNeeded();
    const results = loadResults();
    hud.results.innerHTML = renderResults(results, locale);
    hud.leaderboardTitle.textContent = t(locale, 'results.top-city', { city: profile.city });
    hud.leaderboard.innerHTML = renderLeaderboard(profile, results);
    hud.coach.innerHTML = renderCoachCard(gameStarted, gameOver, state, mode, difficulty, aiThinking, locale);
    applyStepUI();
    refreshHighlights();
  }

  function syncOpponentIcon(): void {
    const persona = mode === 'hotseat' ? getHotseatPersona(profile.locale) : getPersona(difficulty, profile.locale);
    hud.iconOpponent.textContent = persona.initials;
    hud.iconOpponent.style.setProperty('--persona-accent', persona.accent);
    if (mode === 'ai') hud.iconOpponent.dataset['avatar'] = PERSONA_AVATAR_KEY[difficulty];
    else delete hud.iconOpponent.dataset['avatar'];
  }

  function syncOpponentPopover(): void {
    for (const card of hud.opponentCards) {
      const depth = Number(card.dataset['depth']) as Difficulty;
      card.classList.toggle('active', mode === 'ai' && depth === difficulty);
    }
    hud.hotseatBtn.textContent = t(profile.locale, mode === 'hotseat' ? 'opponent.hotseat-on' : 'opponent.hotseat-off');
  }

  function applyLocale(): void {
    const locale = profile.locale;
    const root = hud.coach.closest('.checkers-root') ?? hud.coach.parentElement;
    void root;
    const overlay = hud.coach.closest('.checkers-overlay');
    if (!overlay) return;

    const title = overlay.querySelector('.checkers-title') as HTMLElement | null;
    const sub = overlay.querySelector('.checkers-sub') as HTMLElement | null;
    if (title) title.textContent = t(locale, 'header.title');
    if (sub) sub.textContent = t(locale, 'header.subtitle');
    hud.exit.textContent = t(locale, 'header.menu');

    const histTitle = overlay.querySelector('.ck-history-title') as HTMLElement | null;
    if (histTitle) histTitle.textContent = t(locale, 'history.title');

    const oppTitle = hud.popoverOpponent.querySelector('.ck-popover-title') as HTMLElement | null;
    if (oppTitle) oppTitle.textContent = t(locale, 'opponent.title');
    const setTitle = hud.popoverSettings.querySelector('.ck-popover-title') as HTMLElement | null;
    if (setTitle) setTitle.textContent = t(locale, 'settings.title');

    for (const card of hud.opponentCards) {
      const depth = Number(card.dataset['depth']) as Difficulty;
      const persona = getPersona(depth, locale);
      const name = card.querySelector('.ck-persona-name') as HTMLElement | null;
      const tagline = card.querySelector('.ck-persona-sub') as HTMLElement | null;
      const avatar = card.querySelector('.ck-persona-avatar') as HTMLElement | null;
      if (name) name.textContent = persona.handle;
      if (tagline) tagline.textContent = persona.tagline;
      if (avatar) {
        avatar.textContent = persona.initials;
        avatar.dataset['avatar'] = PERSONA_AVATAR_KEY[depth];
      }
    }

    hud.undo.textContent = t(locale, 'settings.undo');
    hud.restart.textContent = t(locale, 'settings.restart');
    hud.surrender.textContent = t(locale, 'settings.surrender');

    const confirmCard = hud.confirmSurrender.querySelector('.ck-confirm-card');
    if (confirmCard) {
      const h3 = confirmCard.querySelector('h3') as HTMLElement | null;
      const p = confirmCard.querySelector('p') as HTMLElement | null;
      if (h3) h3.textContent = t(locale, 'confirm.surrender.title');
      if (p) p.textContent = t(locale, 'confirm.surrender.body');
    }
    hud.confirmCancel.textContent = t(locale, 'confirm.cancel');
    hud.confirmConfirm.textContent = t(locale, 'confirm.surrender.yes');

    hud.gameOverReview.textContent = t(locale, 'gameover.review');
    hud.gameOverRestart.textContent = t(locale, 'gameover.restart');

    hud.help.textContent = t(locale, 'help.first-move');

    const heroH1 = overlay.querySelector('.ck-hero-card h1') as HTMLElement | null;
    const heroP = overlay.querySelector('.ck-hero-card p') as HTMLElement | null;
    if (heroH1) heroH1.textContent = t(locale, 'start.title');
    if (heroP) heroP.textContent = t(locale, 'start.sub');
    hud.start.textContent = t(locale, 'start.cta');

    const labels = overlay.querySelectorAll('.ck-choice-head span');
    if (labels.length >= 2) {
      (labels[0] as HTMLElement).textContent = t(locale, 'start.game-type');
      (labels[1] as HTMLElement).textContent = t(locale, 'start.opponent');
    }
    const profileLabels = overlay.querySelectorAll('.ck-profile label span');
    if (profileLabels.length >= 2) {
      (profileLabels[0] as HTMLElement).textContent = t(locale, 'start.handle');
      (profileLabels[1] as HTMLElement).textContent = t(locale, 'start.city');
    }
    for (const btn of hud.startModes) {
      btn.textContent = btn.dataset['mode'] === 'hotseat' ? t(locale, 'start.hotseat') : t(locale, 'start.player-vs-ai');
    }
    for (const btn of hud.startDepths) {
      const depth = Number(btn.dataset['depth']) as Difficulty;
      const persona = getPersona(depth, locale);
      btn.textContent = `${persona.firstName} · ${persona.rating}`;
    }

    hud.iconOpponent.title = t(locale, 'icon.opponent.title');
    hud.iconTheme.title = t(locale, 'icon.theme.title');
    hud.iconSettings.title = t(locale, 'icon.settings.title');
    hud.iconPro.title = t(locale, 'icon.pro.title');
    hud.iconInvite.title = t(locale, 'icon.invite.title');

    const resultsTitle = overlay.querySelector('.ck-results-title') as HTMLElement | null;
    if (resultsTitle) resultsTitle.textContent = t(locale, 'results.title');
  }

  function syncProIcon(): void {
    let crown = hud.iconPro.querySelector('.ck-icon-crown');
    if (profile.pro) {
      if (!crown) {
        crown = document.createElement('span');
        crown.className = 'ck-icon-crown';
        crown.textContent = '★';
        hud.iconPro.appendChild(crown);
      }
    } else if (crown) {
      crown.remove();
    }
  }

  function renderCapturedStacks(pieces: readonly CheckersPiece[], locale: Locale): void {
    const whiteAlive = pieces.filter((p) => p.side === 'white').length;
    const blackAlive = pieces.filter((p) => p.side === 'black').length;
    hud.capturedTop.innerHTML = renderCapturedStrip(t(locale, 'capture.label.white'), 'white', 12 - whiteAlive);
    hud.capturedBottom.innerHTML = renderCapturedStrip(t(locale, 'capture.label.black'), 'black', 12 - blackAlive);
    hud.capturedTop.classList.toggle('empty', 12 - whiteAlive === 0);
    hud.capturedBottom.classList.toggle('empty', 12 - blackAlive === 0);
  }

  function renderCapturedStrip(label: string, color: 'white' | 'black', count: number): string {
    if (count === 0) return `<span class="label">${escapeHtml(label)} · 0</span>`;
    const visible = Math.min(count, 10);
    const extra = count - visible;
    const discs = new Array(visible).fill(0).map(() => `<span class="ck-disc ${color}"></span>`).join('');
    return `<span class="label">${escapeHtml(label)}</span>${discs}${extra > 0 ? `<span class="ck-extra">+${extra}</span>` : ''}`;
  }

  function setCameraMode(next: CameraMode): void {
    if (cameraMode === next) return;
    cameraMode = next;
    setCamera(camera, cameraMode);
    refreshUi();
  }

  function togglePopover(name: 'opponent' | 'settings'): void {
    if (openPopover === name) {
      closePopovers();
      return;
    }
    closePopovers();
    openPopover = name;
    const el = name === 'opponent' ? hud.popoverOpponent : hud.popoverSettings;
    const anchor = name === 'opponent' ? hud.iconOpponent : hud.iconSettings;
    el.classList.add('open');
    anchor.classList.add('active');
    const rect = anchor.getBoundingClientRect();
    el.style.top = `${Math.max(64, rect.top)}px`;
  }

  function closePopovers(): void {
    if (!openPopover) return;
    openPopover = null;
    hud.popoverOpponent.classList.remove('open');
    hud.popoverSettings.classList.remove('open');
    hud.iconOpponent.classList.remove('active');
    hud.iconSettings.classList.remove('active');
  }

  function showConfirmSurrender(): void {
    hud.confirmSurrender.classList.add('open');
  }

  function hideConfirmSurrender(): void {
    hud.confirmSurrender.classList.remove('open');
  }

  function openReview(): void {
    hud.gameOver.classList.remove('show');
    refreshReviewBody();
    hud.review.classList.add('open');
  }

  function closeReview(): void {
    hud.review.classList.remove('open');
    const result = getGameResult(state);
    const winner = state.winner ?? result?.winner ?? null;
    if (Boolean(winner || result?.winner === null)) hud.gameOver.classList.add('show');
  }

  function refreshReviewBody(): void {
    hud.reviewBody.innerHTML = renderReview(state, profile);
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
      ? { kind: 'draw', reason: result.reason, moves: state.history.length }
      : { kind: 'win', side: winner, reason: result.reason, moves: state.history.length };
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
      const ghost = makePieceMesh(ghostPiece, profile.skin);
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

function makePieceMesh(piece: CheckersPiece, skin: PieceSkin): THREE.Group {
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
  setPieceVisual(group, piece, skin);
  return group;
}

function setPieceVisual(group: THREE.Group, piece: CheckersPiece, skin: PieceSkin): void {
  const palette = piecePalette(piece, skin);
  for (const child of group.children) {
    const mesh = child as THREE.Mesh;
    const material = mesh.material as THREE.MeshStandardMaterial;
    if (child.name === 'crown') {
      child.visible = piece.king;
      material.color.set(palette.crown);
      continue;
    }
    material.color.set(child === group.children[0] ? palette.body : palette.rim);
  }
}

function piecePalette(piece: CheckersPiece, skin: PieceSkin): { body: number; rim: number; crown: number } {
  if (skin === 'obsidian') {
    return piece.side === 'white'
      ? { body: 0xf6f0e7, rim: 0x65c7da, crown: 0xa9f2ff }
      : { body: 0x090b12, rim: 0x2ed0b3, crown: 0x7fffe8 };
  }
  if (skin === 'aurora') {
    return piece.side === 'white'
      ? { body: 0xe9fff5, rim: 0xd39a3a, crown: 0xffd77a }
      : { body: 0x17142b, rim: 0x9a63ff, crown: 0xd9c2ff };
  }
  return piece.side === 'white'
    ? { body: 0xf2dec1, rim: 0xc78d52, crown: 0xffd989 }
    : { body: 0x19100d, rim: 0x9f3428, crown: 0xffd989 };
}

interface CheckersHud {
  camera2d: HTMLButtonElement;
  camera3d: HTMLButtonElement;
  capturedTop: HTMLElement;
  capturedBottom: HTMLElement;
  coach: HTMLElement;
  confirmCancel: HTMLButtonElement;
  confirmConfirm: HTMLButtonElement;
  confirmSurrender: HTMLElement;
  exit: HTMLButtonElement;
  forced: HTMLElement;
  editProfile: HTMLButtonElement;
  feats: HTMLElement[];
  gameOver: HTMLElement;
  gameOverCopy: HTMLElement;
  gameOverRestart: HTMLButtonElement;
  gameOverReview: HTMLButtonElement;
  guide: HTMLElement;
  help: HTMLElement;
  hero: HTMLElement;
  hotseatBtn: HTMLButtonElement;
  language: HTMLButtonElement;
  profileLang: HTMLButtonElement;
  next: HTMLButtonElement;
  prev: HTMLButtonElement;
  stepBody: HTMLElement;
  stepEyebrow: HTMLElement;
  stepIndicator: HTMLElement;
  stepTitle: HTMLElement;
  iconOpponent: HTMLButtonElement;
  iconTheme: HTMLButtonElement;
  iconSettings: HTMLButtonElement;
  iconPro: HTMLButtonElement;
  iconInvite: HTMLButtonElement;
  moves: HTMLElement;
  leaderboard: HTMLElement;
  leaderboardTitle: HTMLElement;
  opponentCards: HTMLButtonElement[];
  popoverOpponent: HTMLElement;
  popoverSettings: HTMLElement;
  pro: HTMLButtonElement;
  profileCity: HTMLInputElement;
  profileHandle: HTMLInputElement;
  profileLabel: HTMLElement;
  restart: HTMLButtonElement;
  results: HTMLElement;
  review: HTMLElement;
  reviewBody: HTMLElement;
  share: HTMLButtonElement;
  skin: HTMLButtonElement;
  start: HTMLButtonElement;
  startDepths: HTMLButtonElement[];
  startDifficultyLabel: HTMLElement;
  startModeLabel: HTMLElement;
  startModes: HTMLButtonElement[];
  surrender: HTMLButtonElement;
  theme: HTMLButtonElement;
  turn: HTMLElement;
  turnPill: HTMLElement;
  undo: HTMLButtonElement;
}

function createHud(root: HTMLElement): CheckersHud {
  const overlay = document.createElement('div');
  overlay.className = 'checkers-overlay';
  overlay.innerHTML = `
    <div class="checkers-top">
      <div>
        <div class="checkers-title">Premium Checkers</div>
        <div class="checkers-sub">AI Coach · forced captures · flying kings</div>
      </div>
      <button class="ck-btn" id="ck-exit">Menu</button>
    </div>

    <div class="ck-coach-rail">
      <div class="ck-coach-card" id="ck-coach"></div>
      <div class="ck-history-card">
        <div class="ck-history-title">Move History</div>
        <div class="ck-log" id="ck-moves"></div>
      </div>
    </div>

    <div class="ck-captured-stack top" id="ck-captured-top"></div>
    <div class="ck-captured-stack bottom" id="ck-captured-bottom"></div>

    <div class="ck-turn-board" id="ck-turn-pill">
      <span class="turn-dot"></span>
      <span id="ck-turn"></span>
      <span class="forced-chip" id="ck-forced" style="display:none"></span>
    </div>

    <div class="ck-camera-toggle">
      <button id="ck-cam-3d" class="active">3D</button>
      <button id="ck-cam-2d">2D</button>
    </div>

    <div class="ck-icon-rail">
      <button class="ck-icon-btn opponent" id="ck-icon-opponent" title="Choose opponent">DE</button>
      <button class="ck-icon-btn" id="ck-icon-theme" title="Switch theme" aria-label="Switch theme">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      </button>
      <button class="ck-icon-btn" id="ck-icon-settings" title="Match settings" aria-label="Match settings">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82c.16.36.49.62.86.74H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      </button>
      <button class="ck-icon-btn" id="ck-icon-pro" title="Pro skin" aria-label="Pro skin">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17l3-9 4 6 2-10 2 10 4-6 3 9z"/></svg>
      </button>
      <button class="ck-icon-btn" id="ck-icon-invite" title="Invite link" aria-label="Invite link">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.07 0l3.54-3.54a5 5 0 1 0-7.07-7.07L11.5 4.5"/><path d="M14 11a5 5 0 0 0-7.07 0L3.39 14.54a5 5 0 1 0 7.07 7.07L12.5 19.5"/></svg>
      </button>
    </div>

    <div class="ck-popover" id="ck-popover-opponent">
      <div class="ck-popover-title">Choose opponent</div>
      <button class="ck-persona-card" data-depth="2">
        <div class="ck-persona-avatar" data-avatar="yara" style="--persona-accent:#7ef5b3">YB</div>
        <div class="ck-persona-meta"><div class="ck-persona-name">Yara Bishop</div><div class="ck-persona-sub">Tactical training</div></div>
        <div class="ck-persona-rating">1100</div>
      </button>
      <button class="ck-persona-card active" data-depth="4">
        <div class="ck-persona-avatar" data-avatar="dana" style="--persona-accent:#8fd0ff">DE</div>
        <div class="ck-persona-meta"><div class="ck-persona-name">Dana Endgame</div><div class="ck-persona-sub">Solid positional</div></div>
        <div class="ck-persona-rating">1500</div>
      </button>
      <button class="ck-persona-card" data-depth="6">
        <div class="ck-persona-avatar" data-avatar="magnus" style="--persona-accent:#ff9a5c">M8</div>
        <div class="ck-persona-meta"><div class="ck-persona-name">Magnus 8</div><div class="ck-persona-sub">Punishes mistakes</div></div>
        <div class="ck-persona-rating">2000</div>
      </button>
      <div class="ck-popover-divider"></div>
      <button class="ck-btn wide" id="ck-hotseat">Switch to Local Hotseat</button>
    </div>

    <div class="ck-popover" id="ck-popover-settings">
      <div class="ck-popover-title">Settings</div>
      <button class="ck-btn wide" id="ck-skin">Skin: Classic</button>
      <button class="ck-btn wide" id="ck-language">Language: Русский</button>
      <button class="ck-btn wide" id="ck-pro">Upgrade to Pro</button>
      <div class="ck-popover-divider"></div>
      <div class="ck-actions">
        <button class="ck-btn" id="ck-undo">Undo</button>
        <button class="ck-btn" id="ck-restart">Restart</button>
      </div>
      <button class="ck-btn wide danger" id="ck-surrender">Surrender</button>
    </div>

    <div class="ck-confirm" id="ck-confirm-surrender">
      <div class="ck-confirm-card">
        <h3>Surrender?</h3>
        <p>Surrender counts as a loss in this match.</p>
        <div class="ck-confirm-actions">
          <button class="ck-btn" id="ck-confirm-cancel">Cancel</button>
          <button class="ck-btn danger" id="ck-confirm-yes">Yes, surrender</button>
        </div>
      </div>
    </div>

    <div class="checkers-gameover" id="ck-gameover">
      <div id="ck-gameover-copy"></div>
      <div class="ck-row" style="margin-top:18px">
        <button class="ck-btn pro" id="ck-gameover-review">Open Coach Review</button>
        <button class="ck-btn" id="ck-gameover-restart">New Match</button>
      </div>
    </div>

    <div class="ck-review" id="ck-review">
      <div class="ck-review-card" id="ck-review-body"></div>
    </div>

    <div class="checkers-guide" id="ck-guide"></div>
    <div class="checkers-help" id="ck-help">Click a piece, then a highlighted square. Orange means capture is forced.</div>
    <div class="checkers-start">
      <div class="ck-hero-card" id="ck-hero" data-step="1">
        <div class="ck-step-indicator" id="ck-step-indicator"></div>
        <div class="ck-eyebrow" id="ck-step-eyebrow"></div>
        <h1 id="ck-step-title"></h1>
        <p id="ck-step-body"></p>

        <div class="ck-feats" id="ck-feats">
          <div class="ck-feat" data-feat="1"><b></b><span></span></div>
          <div class="ck-feat" data-feat="2"><b></b><span></span></div>
          <div class="ck-feat" data-feat="3"><b></b><span></span></div>
        </div>

        <div class="ck-profile" id="ck-profile-block">
          <div class="ck-profile-grid">
            <label>
              <span>Handle</span>
              <input id="ck-profile-handle" maxlength="24" autocomplete="off" />
            </label>
            <label>
              <span>City</span>
              <input id="ck-profile-city" maxlength="24" autocomplete="off" />
            </label>
          </div>
          <button class="ck-btn wide" id="ck-profile-lang">Язык: Русский</button>
        </div>

        <div class="ck-welcome-back-meta" id="ck-wb-meta">
          <div class="ck-profile-label" id="ck-profile-label">Guest Strategist · Almaty</div>
        </div>

        <div class="ck-start-grid">
          <div class="ck-choice">
            <div class="ck-choice-head">
              <span data-i18n-label="start.game-type">Game Type</span>
              <b id="ck-start-mode-label">Player vs AI</b>
            </div>
            <div class="ck-row">
              <button class="ck-btn start-mode active" data-mode="ai">Player vs AI</button>
              <button class="ck-btn start-mode" data-mode="hotseat">Hotseat</button>
            </div>
          </div>
          <div class="ck-choice">
            <div class="ck-choice-head">
              <span data-i18n-label="start.opponent">Opponent</span>
              <b id="ck-start-difficulty-label">Dana Endgame · 1500</b>
            </div>
            <div class="ck-row">
              <button class="ck-btn start-depth" data-depth="2">Yara · 1100</button>
              <button class="ck-btn start-depth active" data-depth="4">Dana · 1500</button>
              <button class="ck-btn start-depth" data-depth="6">Magnus · 2000</button>
            </div>
          </div>
        </div>

        <div class="ck-step-actions">
          <button class="ck-btn" id="ck-prev">Назад</button>
          <button class="ck-btn ghost" id="ck-edit-profile">Изменить профиль</button>
          <button class="ck-start-btn" id="ck-next">Дальше</button>
          <button class="ck-start-btn" id="ck-start">Начать партию</button>
        </div>
      </div>
      <div class="ck-results-card">
        <div class="ck-results-title">Results Table</div>
        <div id="ck-results"></div>
        <div class="ck-results-title city" id="ck-leaderboard-title">Top Almaty</div>
        <div id="ck-leaderboard"></div>
      </div>
    </div>
  `;
  root.appendChild(overlay);
  return {
    camera2d: overlay.querySelector('#ck-cam-2d') as HTMLButtonElement,
    camera3d: overlay.querySelector('#ck-cam-3d') as HTMLButtonElement,
    capturedTop: overlay.querySelector('#ck-captured-top') as HTMLElement,
    capturedBottom: overlay.querySelector('#ck-captured-bottom') as HTMLElement,
    coach: overlay.querySelector('#ck-coach') as HTMLElement,
    confirmCancel: overlay.querySelector('#ck-confirm-cancel') as HTMLButtonElement,
    confirmConfirm: overlay.querySelector('#ck-confirm-yes') as HTMLButtonElement,
    confirmSurrender: overlay.querySelector('#ck-confirm-surrender') as HTMLElement,
    editProfile: overlay.querySelector('#ck-edit-profile') as HTMLButtonElement,
    exit: overlay.querySelector('#ck-exit') as HTMLButtonElement,
    feats: [...overlay.querySelectorAll('.ck-feat')] as HTMLElement[],
    forced: overlay.querySelector('#ck-forced') as HTMLElement,
    gameOver: overlay.querySelector('#ck-gameover') as HTMLElement,
    gameOverCopy: overlay.querySelector('#ck-gameover-copy') as HTMLElement,
    gameOverRestart: overlay.querySelector('#ck-gameover-restart') as HTMLButtonElement,
    gameOverReview: overlay.querySelector('#ck-gameover-review') as HTMLButtonElement,
    guide: overlay.querySelector('#ck-guide') as HTMLElement,
    help: overlay.querySelector('#ck-help') as HTMLElement,
    hero: overlay.querySelector('#ck-hero') as HTMLElement,
    hotseatBtn: overlay.querySelector('#ck-hotseat') as HTMLButtonElement,
    language: overlay.querySelector('#ck-language') as HTMLButtonElement,
    profileLang: overlay.querySelector('#ck-profile-lang') as HTMLButtonElement,
    next: overlay.querySelector('#ck-next') as HTMLButtonElement,
    prev: overlay.querySelector('#ck-prev') as HTMLButtonElement,
    stepBody: overlay.querySelector('#ck-step-body') as HTMLElement,
    stepEyebrow: overlay.querySelector('#ck-step-eyebrow') as HTMLElement,
    stepIndicator: overlay.querySelector('#ck-step-indicator') as HTMLElement,
    stepTitle: overlay.querySelector('#ck-step-title') as HTMLElement,
    iconOpponent: overlay.querySelector('#ck-icon-opponent') as HTMLButtonElement,
    iconTheme: overlay.querySelector('#ck-icon-theme') as HTMLButtonElement,
    iconSettings: overlay.querySelector('#ck-icon-settings') as HTMLButtonElement,
    iconPro: overlay.querySelector('#ck-icon-pro') as HTMLButtonElement,
    iconInvite: overlay.querySelector('#ck-icon-invite') as HTMLButtonElement,
    moves: overlay.querySelector('#ck-moves') as HTMLElement,
    leaderboard: overlay.querySelector('#ck-leaderboard') as HTMLElement,
    leaderboardTitle: overlay.querySelector('#ck-leaderboard-title') as HTMLElement,
    opponentCards: [...overlay.querySelectorAll('.ck-persona-card')] as HTMLButtonElement[],
    popoverOpponent: overlay.querySelector('#ck-popover-opponent') as HTMLElement,
    popoverSettings: overlay.querySelector('#ck-popover-settings') as HTMLElement,
    pro: overlay.querySelector('#ck-pro') as HTMLButtonElement,
    profileCity: overlay.querySelector('#ck-profile-city') as HTMLInputElement,
    profileHandle: overlay.querySelector('#ck-profile-handle') as HTMLInputElement,
    profileLabel: overlay.querySelector('#ck-profile-label') as HTMLElement,
    restart: overlay.querySelector('#ck-restart') as HTMLButtonElement,
    results: overlay.querySelector('#ck-results') as HTMLElement,
    review: overlay.querySelector('#ck-review') as HTMLElement,
    reviewBody: overlay.querySelector('#ck-review-body') as HTMLElement,
    share: overlay.querySelector('#ck-icon-invite') as HTMLButtonElement,
    skin: overlay.querySelector('#ck-skin') as HTMLButtonElement,
    start: overlay.querySelector('#ck-start') as HTMLButtonElement,
    startDepths: [...overlay.querySelectorAll('.start-depth')] as HTMLButtonElement[],
    startDifficultyLabel: overlay.querySelector('#ck-start-difficulty-label') as HTMLElement,
    startModeLabel: overlay.querySelector('#ck-start-mode-label') as HTMLElement,
    startModes: [...overlay.querySelectorAll('.start-mode')] as HTMLButtonElement[],
    surrender: overlay.querySelector('#ck-surrender') as HTMLButtonElement,
    theme: overlay.querySelector('#ck-icon-theme') as HTMLButtonElement,
    turn: overlay.querySelector('#ck-turn') as HTMLElement,
    turnPill: overlay.querySelector('#ck-turn-pill') as HTMLElement,
    undo: overlay.querySelector('#ck-undo') as HTMLButtonElement,
  };
}

function resultLabel(result: CheckersResult | null, locale: Locale): string | null {
  if (!result) return null;
  const key = `result.${result.reason === 'no-pieces' ? 'no-pieces' : result.reason}`;
  return t(locale, key);
}

function resultSuffix(reason: CheckersResult['reason'] | undefined, locale: Locale): string {
  if (!reason) return '';
  if (reason === 'resign') return t(locale, 'result.suffix.resign');
  if (reason === 'pat') return t(locale, 'result.suffix.pat');
  if (reason === 'king-majority') return t(locale, 'result.suffix.king-majority');
  if (reason === 'no-pieces') return t(locale, 'result.suffix.no-pieces');
  return '';
}

function gameOverCopy(result: CheckersResult | null, winner: CheckersSide | null, locale: Locale): string {
  if (result?.winner === null) {
    return `<div class="ck-gameover-kicker">${escapeHtml(resultLabel(result, locale) ?? '')}</div><div class="ck-gameover-title">${escapeHtml(t(locale, 'turn.draw'))}</div><div class="ck-gameover-sub">${escapeHtml(drawCopy(result, locale))}</div>`;
  }
  if (!winner) return '';
  const kicker = resultLabel(result, locale) ?? t(locale, 'gameover.match-complete');
  return `<div class="ck-gameover-kicker">${escapeHtml(kicker)}</div><div class="ck-gameover-title">${escapeHtml(t(locale, 'turn.wins', { side: labelSide(winner, locale) }))}</div><div class="ck-gameover-sub">${escapeHtml(winCopy(result, winner, locale))}</div>`;
}

function winCopy(result: CheckersResult | null, winner: CheckersSide, locale: Locale): string {
  if (result?.reason === 'resign') return t(locale, 'win.resign', { side: labelSide(result.loser, locale) });
  if (result?.reason === 'pat') return t(locale, 'win.pat', { side: labelSide(opponent(winner), locale) });
  if (result?.reason === 'king-majority') return t(locale, 'win.king-majority', { side: labelSide(winner, locale) });
  return t(locale, 'win.no-pieces');
}

function drawCopy(result: CheckersResult, locale: Locale): string {
  if (result.reason === 'draw-repetition') return t(locale, 'draw.repetition');
  if (result.reason === 'draw-no-progress') return t(locale, 'draw.no-progress');
  return t(locale, 'draw.generic');
}

function opponent(side: CheckersSide): CheckersSide {
  return side === 'white' ? 'black' : 'white';
}


function loadResults(): CheckersResults {
  try {
    const raw = window.localStorage.getItem(RESULTS_KEY);
    if (!raw) return emptyResults();
    const parsed = JSON.parse(raw) as Partial<CheckersResults> & { lastResult?: unknown };
    const last = parsed.lastResult;
    const lastResult: LastResultData | null =
      last && typeof last === 'object' && 'kind' in (last as object)
        ? (last as LastResultData)
        : null;
    return {
      aiWins: Number(parsed.aiWins) || 0,
      aiLosses: Number(parsed.aiLosses) || 0,
      draws: Number(parsed.draws) || 0,
      hotseatGames: Number(parsed.hotseatGames) || 0,
      lastResult,
    };
  } catch {
    return emptyResults();
  }
}

function saveResults(results: CheckersResults): void {
  window.localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
}

function emptyResults(): CheckersResults {
  return { aiWins: 0, aiLosses: 0, draws: 0, hotseatGames: 0, lastResult: null };
}

function renderResults(results: CheckersResults, locale: Locale): string {
  const last = results.lastResult;
  let lastLine: string;
  if (!last) {
    lastLine = t(locale, 'results.no-matches');
  } else if (last.kind === 'win' && last.side) {
    lastLine = t(locale, 'results.last-win', {
      side: labelSide(last.side, locale),
      suffix: resultSuffix(last.reason, locale),
      n: last.moves,
    });
  } else {
    lastLine = t(locale, 'results.last-draw', {
      reason: resultLabel({ winner: null, reason: last.reason } as CheckersResult, locale) ?? '',
      n: last.moves,
    });
  }
  return `
    <div class="ck-result-row"><span>${escapeHtml(t(locale, 'results.ai-wins'))}</span><b>${results.aiWins}</b></div>
    <div class="ck-result-row"><span>${escapeHtml(t(locale, 'results.ai-losses'))}</span><b>${results.aiLosses}</b></div>
    <div class="ck-result-row"><span>${escapeHtml(t(locale, 'results.draws'))}</span><b>${results.draws}</b></div>
    <div class="ck-result-row"><span>${escapeHtml(t(locale, 'results.hotseat'))}</span><b>${results.hotseatGames}</b></div>
    <div class="ck-last-result">${escapeHtml(lastLine)}</div>
  `;
}

function renderHistory(history: readonly { move: CheckersMove; turn: CheckersSide }[], locale: Locale): string {
  if (history.length === 0) return `<div class="empty">${escapeHtml(t(locale, 'history.empty'))}</div>`;
  const rows: string[] = [];
  for (let i = 0; i < history.length; i += 2) {
    const first = history[i];
    const second = history[i + 1];
    const number = Math.floor(i / 2) + 1;
    const firstMove = first ? `${escapeHtml(labelSide(first.turn, locale))} ${escapeHtml(formatHistoryMove(first.move))}` : '';
    const secondMove = second ? `${escapeHtml(labelSide(second.turn, locale))} ${escapeHtml(formatHistoryMove(second.move))}` : '';
    rows.push(`<div><b>${number}.</b> ${firstMove}${secondMove ? ` <span class="ck-history-sep">/</span> ${secondMove}` : ''}</div>`);
  }
  return rows.slice(-8).join('');
}

function formatHistoryMove(move: CheckersMove): string {
  return `${coord(move.from)}-${move.path.map(coord).join('-')}${move.captures.length ? ` ×${move.captures.length}` : ''}`;
}

function renderCoachCard(gameStarted: boolean, gameOver: boolean, state: CheckersState, mode: CheckersMode, difficulty: Difficulty, aiThinking: boolean, locale: Locale): string {
  const persona = mode === 'hotseat' ? getHotseatPersona(locale) : getPersona(difficulty, locale);
  const avatarAttr = mode === 'ai' ? ` data-avatar="${PERSONA_AVATAR_KEY[difficulty]}"` : '';
  const head = `
    <div class="ck-persona">
      <div class="ck-persona-avatar"${avatarAttr} style="--persona-accent:${persona.accent}">${escapeHtml(persona.initials)}</div>
      <div class="ck-persona-meta">
        <div class="ck-persona-name">${escapeHtml(persona.handle)}</div>
        <div class="ck-persona-sub">${escapeHtml(persona.tagline)}</div>
      </div>
      ${persona.rating > 0 ? `<div class="ck-persona-rating">${persona.rating}</div>` : ''}
    </div>
  `;
  if (!gameStarted) {
    return `${head}
      <div class="ck-coach-hint">${escapeHtml(t(locale, 'coach.idle'))}</div>
    `;
  }
  if (gameOver) {
    const report = buildCoachReport(state.history, state, locale);
    return `${head}
      <div class="ck-coach-status"><span>${escapeHtml(t(locale, 'coach.status.complete'))}</span><span>${report.score}/100</span></div>
      <div class="ck-coach-hint">${escapeHtml(report.headline)} — ${escapeHtml(report.summary)}</div>
      <button class="ck-coach-review-cta" data-action="open-review-from-coach">${escapeHtml(t(locale, 'coach.review-cta'))}</button>
      ${renderEvalBar(state, locale)}
    `;
  }
  const meta = liveCoachTipMeta(state, 2);
  const tone = TONE_BY_TIP[meta.key] ?? 'idea';
  const lookForKey = LOOKFOR_BY_TIP[meta.key] ?? 'lookfor.default';
  const tipText = t(locale, meta.key, meta.vars);
  const lookForText = t(locale, lookForKey);
  const thinkingLabel = t(locale, 'coach.status.thinking', { name: persona.firstName });
  const liveLabel = t(locale, 'coach.status.live');
  const moveLabel = t(locale, 'coach.status.move', { n: state.history.length + 1 });
  const status = aiThinking
    ? `<div class="ck-coach-status thinking"><span><span class="dot"></span> ${escapeHtml(thinkingLabel)}</span><span>${persona.rating > 0 ? persona.rating : ''}</span></div>`
    : `<div class="ck-coach-status"><span><span class="dot"></span> ${escapeHtml(liveLabel)}</span><span>${escapeHtml(moveLabel)}</span></div>`;
  const tipLabel = t(locale, 'coach.tip.label');
  const body = aiThinking
    ? `<div class="ck-coach-tip ${tone}"><div class="ck-coach-tip-label">${escapeHtml(tipLabel)}</div><div class="ck-coach-tip-skeleton"></div><div class="ck-coach-tip-skeleton" style="width:62%"></div></div>`
    : `<div class="ck-coach-tip ${tone}"><div class="ck-coach-tip-label">${escapeHtml(tipLabel)}</div><div class="ck-coach-tip-body">${escapeHtml(tipText)}</div></div>`;
  return `${head}${status}${body}
    <div class="ck-coach-lookfor">
      <div class="ck-coach-tip-label">${escapeHtml(t(locale, 'coach.lookfor.label'))}</div>
      <div class="ck-coach-tip-body">${escapeHtml(lookForText)}</div>
    </div>
    ${renderEvalBar(state, locale)}
  `;
}

function renderEvalBar(state: CheckersState, locale: Locale): string {
  const score = evaluatePosition(state);
  const fill = Math.max(4, Math.min(96, 50 + (score / 12) * 50));
  const label = score === 0
    ? t(locale, 'coach.eval.even')
    : score > 0
      ? t(locale, 'coach.eval.white', { n: score })
      : t(locale, 'coach.eval.black', { n: -score });
  return `
    <div class="ck-eval">
      <div class="ck-eval-head"><span>${escapeHtml(t(locale, 'coach.eval.label'))}</span><span>${escapeHtml(label)}</span></div>
      <div class="ck-eval-bar"><div class="ck-eval-fill" style="width:${fill}%"></div><div class="ck-eval-center"></div></div>
    </div>
  `;
}

function renderReview(state: CheckersState, profile: CheckersProfile): string {
  const locale = profile.locale;
  const report = buildCoachReport(state.history, state, locale);
  const proCta = profile.pro
    ? ''
    : `<div class="ck-review-pro">${t(locale, 'review.pro-upsell')} — <button class="ck-btn" data-action="pro" style="margin-left:6px">${escapeHtml(t(locale, 'review.pro-upgrade'))}</button></div>`;
  return `
    <div class="ck-review-head">
      <div>
        <div class="ck-review-eyebrow">${escapeHtml(t(locale, 'review.eyebrow'))}</div>
        <div class="ck-review-headline">${escapeHtml(report.headline)}</div>
      </div>
      <div class="ck-review-score"><b>${report.score}</b><span>${escapeHtml(t(locale, 'review.score-label'))}</span></div>
    </div>
    <div class="ck-review-summary">${escapeHtml(report.summary)}</div>
    <div class="ck-review-insights">
      ${report.insights.map((insight) => `
        <div class="ck-insight ${insight.tone}">
          <b>${escapeHtml(insight.title)}</b>
          <span>${escapeHtml(insight.body)}</span>
        </div>
      `).join('')}
    </div>
    <div class="ck-review-actions">
      <button class="ck-btn primary" data-action="replay">${escapeHtml(t(locale, 'review.replay'))}</button>
      <button class="ck-btn" data-action="close">${escapeHtml(t(locale, 'review.back'))}</button>
      <button class="ck-btn" data-action="menu">${escapeHtml(t(locale, 'review.menu'))}</button>
    </div>
    ${proCta}
  `;
}

function renderLeaderboard(profile: CheckersProfile, results: CheckersResults): string {
  const locale = profile.locale;
  const playerRating = 1000 + results.aiWins * 28 + results.hotseatGames * 10 + results.draws * 4 - results.aiLosses * 12;
  const rows: LeaderboardRow[] = [
    { handle: profile.handle, city: profile.city, rating: playerRating, streak: results.aiWins > results.aiLosses ? t(locale, 'leader.streak.form') : t(locale, 'leader.streak.training') },
    { handle: 'Aida.K', city: profile.city, rating: 1168, streak: t(locale, 'leader.streak.win-template', { n: 7 }) },
    { handle: 'Timur Blitz', city: profile.city, rating: 1116, streak: t(locale, 'leader.streak.win-template', { n: 3 }) },
    { handle: t(locale, 'persona.dana.handle'), city: profile.city, rating: 1084, streak: t(locale, 'leader.streak.coach') },
  ].sort((a, b) => b.rating - a.rating);
  return rows.map((row, index) => `
    <div class="ck-leader-row ${row.handle === profile.handle ? 'me' : ''}">
      <span>${index + 1}</span>
      <b>${escapeHtml(row.handle)}</b>
      <em>${row.rating}</em>
      <small>${escapeHtml(row.streak)}</small>
    </div>
  `).join('');
}

function loadProfile(): CheckersProfile {
  const defaults = emptyProfile();
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<CheckersProfile>;
    const locale = LOCALES.includes(parsed.locale as Locale) ? (parsed.locale as Locale) : DEFAULT_LOCALE;
    return {
      handle: sanitizeProfileValue(normalizeDefaultProfileText(parsed.handle, locale, 'handle'), t(locale, 'start.guest')),
      city: sanitizeProfileValue(normalizeDefaultProfileText(parsed.city, locale, 'city'), t(locale, 'start.default-city')),
      theme: parsed.theme === 'light' ? 'light' : 'midnight',
      pro: Boolean(parsed.pro),
      skin: normalizeSkin(parsed.skin, Boolean(parsed.pro)),
      locale,
      onboarded: parsed.onboarded === undefined ? true : Boolean(parsed.onboarded),
    };
  } catch {
    return defaults;
  }
}

function saveProfile(profile: CheckersProfile): void {
  window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}

function emptyProfile(): CheckersProfile {
  const locale = DEFAULT_LOCALE;
  return {
    handle: t(locale, 'start.guest'),
    city: t(locale, 'start.default-city'),
    theme: 'midnight',
    pro: false,
    skin: 'classic',
    locale,
    onboarded: false,
  };
}

function sanitizeProfileValue(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed.slice(0, 24) : fallback;
}

function normalizeDefaultProfileText(value: unknown, locale: Locale, field: 'handle' | 'city'): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  const defaultValues = field === 'handle'
    ? ['Guest Strategist', 'Гость-стратег']
    : ['Almaty', 'Алматы'];
  if (!defaultValues.includes(trimmed)) return value;
  return t(locale, field === 'handle' ? 'start.guest' : 'start.default-city');
}

function normalizeSkin(value: unknown, pro: boolean): PieceSkin {
  if (value === 'obsidian' && pro) return 'obsidian';
  if (value === 'aurora' && pro) return 'aurora';
  return 'classic';
}

function nextSkin(skin: PieceSkin, pro: boolean): PieceSkin {
  if (!pro) return 'classic';
  if (skin === 'classic') return 'obsidian';
  if (skin === 'obsidian') return 'aurora';
  return 'classic';
}

function skinLabel(skin: PieceSkin, locale: Locale): string {
  if (skin === 'obsidian') return t(locale, 'skin.obsidian');
  if (skin === 'aurora') return t(locale, 'skin.aurora');
  return t(locale, 'skin.classic');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

function labelSide(side: CheckersSide, locale: Locale): string {
  return t(locale, side === 'white' ? 'side.white' : 'side.black');
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
