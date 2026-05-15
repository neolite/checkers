import { describe, expect, it } from 'vitest';
import {
  applyMove,
  createInitialCheckersState,
  generateLegalMoves,
  getGameResult,
  type CheckersPiece,
  type CheckersState,
} from './rules';

function state(turn: CheckersState['turn'], pieces: CheckersPiece[]): CheckersState {
  return {
    turn,
    pieces,
    history: [],
    winner: null,
  };
}

describe('Russian checkers rules', () => {
  it('generates only quiet opening moves in the initial position', () => {
    const moves = generateLegalMoves(createInitialCheckersState());

    expect(moves).toHaveLength(7);
    expect(moves.every((m) => m.captures.length === 0)).toBe(true);
  });

  it('forces captures and blocks quiet moves when capture is available', () => {
    const moves = generateLegalMoves(state('white', [
      { id: 1, side: 'white', x: 2, y: 5, king: false },
      { id: 2, side: 'black', x: 3, y: 4, king: false },
    ]));

    expect(moves).toHaveLength(1);
    expect(moves[0]!.path).toEqual([{ x: 4, y: 3 }]);
    expect(moves[0]!.captures).toEqual([{ x: 3, y: 4 }]);
  });

  it('allows men to capture backward', () => {
    const moves = generateLegalMoves(state('white', [
      { id: 1, side: 'white', x: 2, y: 3, king: false },
      { id: 2, side: 'black', x: 1, y: 4, king: false },
    ]));

    expect(moves).toContainEqual(expect.objectContaining({
      path: [{ x: 0, y: 5 }],
      captures: [{ x: 1, y: 4 }],
    }));
  });

  it('builds full multi-capture paths', () => {
    const moves = generateLegalMoves(state('white', [
      { id: 1, side: 'white', x: 0, y: 5, king: false },
      { id: 2, side: 'black', x: 1, y: 4, king: false },
      { id: 3, side: 'black', x: 3, y: 2, king: false },
    ]));

    expect(moves).toContainEqual(expect.objectContaining({
      path: [{ x: 2, y: 3 }, { x: 4, y: 1 }],
      captures: [{ x: 1, y: 4 }, { x: 3, y: 2 }],
    }));
  });

  it('allows flying kings to capture across distance', () => {
    const moves = generateLegalMoves(state('white', [
      { id: 1, side: 'white', x: 1, y: 5, king: true },
      { id: 2, side: 'black', x: 3, y: 3, king: false },
    ]));

    expect(moves).toContainEqual(expect.objectContaining({
      path: [{ x: 6, y: 0 }],
      captures: [{ x: 3, y: 3 }],
    }));
  });

  it('promotes during a capture chain and continues as a king', () => {
    const moves = generateLegalMoves(state('white', [
      { id: 1, side: 'white', x: 2, y: 2, king: false },
      { id: 2, side: 'black', x: 3, y: 1, king: false },
      { id: 3, side: 'black', x: 6, y: 2, king: false },
    ]));

    expect(moves).toContainEqual(expect.objectContaining({
      path: [{ x: 4, y: 0 }, { x: 7, y: 3 }],
      captures: [{ x: 3, y: 1 }, { x: 6, y: 2 }],
      promotes: true,
    }));
  });

  it('applies captures, promotion, turn switch, and move history', () => {
    const initial = state('white', [
      { id: 1, side: 'white', x: 2, y: 5, king: false },
      { id: 2, side: 'black', x: 3, y: 4, king: false },
    ]);
    const [move] = generateLegalMoves(initial);
    const next = applyMove(initial, move!);

    expect(next.turn).toBe('black');
    expect(next.pieces).toEqual([{ id: 1, side: 'white', x: 4, y: 3, king: false }]);
    expect(next.history).toHaveLength(1);
  });

  it('detects wins when the side to move has no pieces or legal moves', () => {
    expect(getGameResult(state('black', [
      { id: 1, side: 'white', x: 0, y: 1, king: false },
    ]))).toEqual({ winner: 'white', reason: 'no-pieces' });

    expect(getGameResult(state('black', [
      { id: 1, side: 'white', x: 0, y: 1, king: false },
      { id: 2, side: 'black', x: 7, y: 7, king: false },
    ]))).toEqual({ winner: 'white', reason: 'no-moves' });
  });
});
