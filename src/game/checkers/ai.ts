import { applyMove, generateLegalMoves, getGameResult, type CheckersMove, type CheckersSide, type CheckersState } from './rules';

const WIN_SCORE = 100_000;

export function chooseAiMove(state: CheckersState, depth: number): CheckersMove | null {
  const moves = generateLegalMoves(state);
  if (moves.length === 0) return null;
  const aiSide = state.turn;
  let best = moves[0]!;
  let bestScore = -Infinity;
  for (const move of moves) {
    const score = minimax(applyMove(state, move), Math.max(0, depth - 1), -Infinity, Infinity, aiSide);
    if (score > bestScore) {
      bestScore = score;
      best = move;
    }
  }
  return best;
}

function minimax(state: CheckersState, depth: number, alpha: number, beta: number, aiSide: CheckersSide): number {
  const result = getGameResult(state);
  if (result) return result.winner === aiSide ? WIN_SCORE + depth : -WIN_SCORE - depth;
  if (depth <= 0) return evaluate(state, aiSide);

  const maximizing = state.turn === aiSide;
  const moves = generateLegalMoves(state);
  if (maximizing) {
    let value = -Infinity;
    for (const move of moves) {
      value = Math.max(value, minimax(applyMove(state, move), depth - 1, alpha, beta, aiSide));
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break;
    }
    return value;
  }

  let value = Infinity;
  for (const move of moves) {
    value = Math.min(value, minimax(applyMove(state, move), depth - 1, alpha, beta, aiSide));
    beta = Math.min(beta, value);
    if (alpha >= beta) break;
  }
  return value;
}

function evaluate(state: CheckersState, aiSide: CheckersSide): number {
  const material = state.pieces.reduce((sum, p) => {
    const side = p.side === aiSide ? 1 : -1;
    const value = p.king ? 510 : 180;
    const center = 24 - (Math.abs(p.x - 3.5) + Math.abs(p.y - 3.5)) * 4;
    const advancement = p.king ? 0 : p.side === 'white' ? (7 - p.y) * 5 : p.y * 5;
    return sum + side * (value + center + advancement);
  }, 0);
  const currentMoves = generateLegalMoves(state);
  const mobility = currentMoves.length * (state.turn === aiSide ? 8 : -8);
  const forcedCapture = currentMoves.some((m) => m.captures.length > 0) ? (state.turn === aiSide ? 35 : -35) : 0;
  return material + mobility + forcedCapture;
}
