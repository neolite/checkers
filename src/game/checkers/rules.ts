export type CheckersSide = 'black' | 'white';

export interface CheckersSquare {
  x: number;
  y: number;
}

export interface CheckersPiece extends CheckersSquare {
  id: number;
  side: CheckersSide;
  king: boolean;
}

export interface CheckersMove {
  pieceId: number;
  from: CheckersSquare;
  path: CheckersSquare[];
  captures: CheckersSquare[];
  promotes: boolean;
}

export interface CheckersHistoryEntry {
  move: CheckersMove;
  pieces: CheckersPiece[];
  turn: CheckersSide;
}

export interface CheckersState {
  turn: CheckersSide;
  pieces: CheckersPiece[];
  history: CheckersHistoryEntry[];
  winner: CheckersSide | null;
}

export interface CheckersResult {
  winner: CheckersSide;
  reason: 'no-pieces' | 'pat';
}

const BOARD_SIZE = 8;
const DIAGONALS: readonly CheckersSquare[] = [
  { x: -1, y: -1 },
  { x: 1, y: -1 },
  { x: -1, y: 1 },
  { x: 1, y: 1 },
];

export function createInitialCheckersState(): CheckersState {
  const pieces: CheckersPiece[] = [];
  let id = 1;
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (isDarkSquare(x, y)) pieces.push({ id: id++, side: 'black', x, y, king: false });
    }
  }
  for (let y = 5; y < BOARD_SIZE; y++) {
    for (let x = 0; x < BOARD_SIZE; x++) {
      if (isDarkSquare(x, y)) pieces.push({ id: id++, side: 'white', x, y, king: false });
    }
  }
  return { turn: 'white', pieces, history: [], winner: null };
}

export function generateLegalMoves(state: CheckersState): CheckersMove[] {
  const active = state.pieces.filter((p) => p.side === state.turn);
  const captures = active.flatMap((piece) => captureMovesForPiece(state.pieces, piece));
  if (captures.length > 0) return sortMoves(captures);
  return sortMoves(active.flatMap((piece) => quietMovesForPiece(state.pieces, piece)));
}

export function applyMove(state: CheckersState, move: CheckersMove): CheckersState {
  const captured = new Set(move.captures.map(squareKey));
  const final = move.path[move.path.length - 1];
  if (!final) return state;
  const pieces = state.pieces
    .filter((p) => p.id === move.pieceId || !captured.has(squareKey(p)))
    .map((p) => {
      if (p.id !== move.pieceId) return { ...p };
      return {
        ...p,
        x: final.x,
        y: final.y,
        king: p.king || reachesKingRow(p.side, final.y) || move.promotes,
      };
    });
  const next: CheckersState = {
    turn: opponent(state.turn),
    pieces,
    history: [...state.history, { move, pieces: state.pieces.map((p) => ({ ...p })), turn: state.turn }],
    winner: null,
  };
  const result = getGameResult(next);
  return result ? { ...next, winner: result.winner } : next;
}

export function getGameResult(state: CheckersState): CheckersResult | null {
  if (!state.pieces.some((p) => p.side === state.turn)) {
    return { winner: opponent(state.turn), reason: 'no-pieces' };
  }
  if (generateLegalMoves(state).length === 0) {
    return { winner: opponent(state.turn), reason: 'pat' };
  }
  return null;
}

function quietMovesForPiece(pieces: CheckersPiece[], piece: CheckersPiece): CheckersMove[] {
  if (piece.king) {
    const moves: CheckersMove[] = [];
    for (const d of DIAGONALS) {
      for (let x = piece.x + d.x, y = piece.y + d.y; inBoard(x, y); x += d.x, y += d.y) {
        if (pieceAt(pieces, x, y)) break;
        moves.push(makeMove(piece, [{ x, y }], []));
      }
    }
    return moves;
  }

  const dy = piece.side === 'white' ? -1 : 1;
  return [-1, 1].flatMap((dx) => {
    const x = piece.x + dx;
    const y = piece.y + dy;
    if (!inBoard(x, y) || pieceAt(pieces, x, y)) return [];
    return [makeMove(piece, [{ x, y }], [])];
  });
}

function captureMovesForPiece(pieces: CheckersPiece[], piece: CheckersPiece): CheckersMove[] {
  return continueCaptures(pieces, piece, piece.x, piece.y, piece.king, [], [], false, new Set());
}

function continueCaptures(
  pieces: CheckersPiece[],
  piece: CheckersPiece,
  x: number,
  y: number,
  king: boolean,
  path: CheckersSquare[],
  captures: CheckersSquare[],
  promotes: boolean,
  capturedIds: Set<number>,
): CheckersMove[] {
  const next = king
    ? kingCaptureSteps(pieces, piece, x, y, capturedIds)
    : manCaptureSteps(pieces, piece, x, y, capturedIds);
  if (next.length === 0) {
    return captures.length > 0 ? [makeMove(piece, path, captures, promotes)] : [];
  }

  return next.flatMap((step) => {
    const nextCaptured = new Set(capturedIds);
    nextCaptured.add(step.captured.id);
    const becameKing = king || reachesKingRow(piece.side, step.to.y);
    return continueCaptures(
      pieces,
      piece,
      step.to.x,
      step.to.y,
      becameKing,
      [...path, step.to],
      [...captures, { x: step.captured.x, y: step.captured.y }],
      promotes || (!king && becameKing),
      nextCaptured,
    );
  });
}

function manCaptureSteps(
  pieces: CheckersPiece[],
  piece: CheckersPiece,
  x: number,
  y: number,
  capturedIds: Set<number>,
): Array<{ to: CheckersSquare; captured: CheckersPiece }> {
  const steps: Array<{ to: CheckersSquare; captured: CheckersPiece }> = [];
  for (const d of DIAGONALS) {
    const enemy = pieceAt(pieces, x + d.x, y + d.y, capturedIds, piece.id);
    const landing = { x: x + d.x * 2, y: y + d.y * 2 };
    if (!enemy || enemy.side === piece.side || !inBoard(landing.x, landing.y)) continue;
    if (pieceAt(pieces, landing.x, landing.y, capturedIds, piece.id)) continue;
    steps.push({ to: landing, captured: enemy });
  }
  return steps;
}

function kingCaptureSteps(
  pieces: CheckersPiece[],
  piece: CheckersPiece,
  x: number,
  y: number,
  capturedIds: Set<number>,
): Array<{ to: CheckersSquare; captured: CheckersPiece }> {
  const steps: Array<{ to: CheckersSquare; captured: CheckersPiece }> = [];
  for (const d of DIAGONALS) {
    let seenEnemy: CheckersPiece | null = null;
    for (let sx = x + d.x, sy = y + d.y; inBoard(sx, sy); sx += d.x, sy += d.y) {
      const occupant = pieceAt(pieces, sx, sy, capturedIds, piece.id);
      if (!occupant) {
        if (seenEnemy) steps.push({ to: { x: sx, y: sy }, captured: seenEnemy });
        continue;
      }
      if (occupant.side === piece.side || seenEnemy) break;
      seenEnemy = occupant;
    }
  }
  return steps;
}

function makeMove(piece: CheckersPiece, path: CheckersSquare[], captures: CheckersSquare[], promotes = false): CheckersMove {
  return {
    pieceId: piece.id,
    from: { x: piece.x, y: piece.y },
    path,
    captures,
    promotes: promotes || (!piece.king && path.some((p) => reachesKingRow(piece.side, p.y))),
  };
}

function pieceAt(
  pieces: readonly CheckersPiece[],
  x: number,
  y: number,
  capturedIds = new Set<number>(),
  movingId = -1,
): CheckersPiece | undefined {
  return pieces.find((p) => p.id !== movingId && !capturedIds.has(p.id) && p.x === x && p.y === y);
}

function reachesKingRow(side: CheckersSide, y: number): boolean {
  return side === 'white' ? y === 0 : y === BOARD_SIZE - 1;
}

function opponent(side: CheckersSide): CheckersSide {
  return side === 'white' ? 'black' : 'white';
}

function isDarkSquare(x: number, y: number): boolean {
  return (x + y) % 2 === 1;
}

function inBoard(x: number, y: number): boolean {
  return x >= 0 && x < BOARD_SIZE && y >= 0 && y < BOARD_SIZE;
}

function squareKey(s: CheckersSquare): string {
  return `${s.x}:${s.y}`;
}

function sortMoves(moves: CheckersMove[]): CheckersMove[] {
  return [...moves].sort((a, b) => {
    const ac = b.captures.length - a.captures.length;
    if (ac !== 0) return ac;
    return moveKey(a).localeCompare(moveKey(b));
  });
}

function moveKey(move: CheckersMove): string {
  return `${move.pieceId}:${move.path.map(squareKey).join('|')}`;
}
