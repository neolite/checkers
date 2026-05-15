import { describe, expect, it } from 'vitest';
import { chooseAiMove } from './ai';
import { applyMove, generateLegalMoves, type CheckersState } from './rules';

describe('checkers AI', () => {
  it('chooses a mandatory capture when available', () => {
    const state: CheckersState = {
      turn: 'black',
      pieces: [
        { id: 1, side: 'black', x: 3, y: 2, king: false },
        { id: 2, side: 'white', x: 4, y: 3, king: false },
      ],
      history: [],
      winner: null,
    };

    const move = chooseAiMove(state, 2);

    expect(move).toMatchObject({
      path: [{ x: 5, y: 4 }],
      captures: [{ x: 4, y: 3 }],
    });
  });

  it('returns only legal moves', () => {
    const state: CheckersState = {
      turn: 'black',
      pieces: [
        { id: 1, side: 'black', x: 1, y: 2, king: false },
        { id: 2, side: 'white', x: 6, y: 5, king: false },
      ],
      history: [],
      winner: null,
    };

    const move = chooseAiMove(state, 4);
    expect(generateLegalMoves(state)).toContainEqual(move);
    expect(applyMove(state, move!).turn).toBe('white');
  });

  it('is deterministic for the same state and depth', () => {
    const state: CheckersState = {
      turn: 'black',
      pieces: [
        { id: 1, side: 'black', x: 1, y: 2, king: false },
        { id: 2, side: 'black', x: 3, y: 2, king: false },
        { id: 3, side: 'white', x: 2, y: 5, king: false },
      ],
      history: [],
      winner: null,
    };

    expect(chooseAiMove(state, 4)).toEqual(chooseAiMove(state, 4));
  });
});
