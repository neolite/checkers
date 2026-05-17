import { describe, expect, it } from 'vitest';
import { buildCoachReport, getLiveCoachTip } from './coach';
import { applyMove, generateLegalMoves, type CheckersHistoryEntry, type CheckersMove, type CheckersPiece, type CheckersState } from './rules';

function state(turn: CheckersState['turn'], pieces: CheckersPiece[]): CheckersState {
  return {
    turn,
    pieces,
    history: [],
    winner: null,
  };
}

function entryFromMove(before: CheckersState, move: CheckersMove): CheckersHistoryEntry {
  return {
    turn: before.turn,
    pieces: before.pieces.map((p) => ({ ...p })),
    move,
  };
}

describe('checkers coach', () => {
  it('suggests the forced capture in live tips', () => {
    const tip = getLiveCoachTip(state('white', [
      { id: 1, side: 'white', x: 2, y: 5, king: false },
      { id: 2, side: 'black', x: 3, y: 4, king: false },
    ]));

    expect(tip).toContain('Forced jump');
    expect(tip).toContain('c3');
  });

  it('reports a missed bigger capture sequence', () => {
    const before = state('white', [
      { id: 1, side: 'white', x: 0, y: 5, king: false },
      { id: 2, side: 'black', x: 1, y: 4, king: false },
      { id: 3, side: 'black', x: 3, y: 2, king: false },
      { id: 4, side: 'white', x: 5, y: 6, king: false },
      { id: 5, side: 'black', x: 6, y: 5, king: false },
    ]);
    const legal = generateLegalMoves(before);
    const smallCapture = legal.find((m) => m.pieceId === 4)!;
    const after = applyMove(before, smallCapture);
    const report = buildCoachReport([entryFromMove(before, smallCapture)], after);

    expect(report.insights[0]?.title).toContain('bigger combo');
    expect(report.summary).toContain('missed combo');
    expect(report.score).toBeLessThan(70);
  });
});
