import { describe, expect, it } from 'vitest';
import { takeAiTurn } from './ai';
import { createCardBattlerState, type CardBattlerState } from './rules';

function opponentTurnState(): CardBattlerState {
  const state = createCardBattlerState();
  state.turn = 'opponent';
  state.players.opponent.maxMana = 4;
  state.players.opponent.mana = 4;
  state.players.opponent.hand = [
    { uid: 200, cardId: 'firebolt' },
    { uid: 201, cardId: 'mirrorGuard' },
  ];
  state.players.opponent.board = [{
    instanceId: 900,
    cardId: 'emberSquire',
    owner: 'opponent',
    attack: 1,
    health: 2,
    maxHealth: 2,
    ready: true,
  }];
  state.players.player.board = [{
    instanceId: 901,
    cardId: 'emberSquire',
    owner: 'player',
    attack: 1,
    health: 2,
    maxHealth: 2,
    ready: true,
  }];
  return state;
}

describe('arcane card battler AI', () => {
  it('takes a deterministic legal turn and returns control to the player', () => {
    const state = opponentTurnState();

    const first = takeAiTurn(state);
    const second = takeAiTurn(state);

    expect(first).toEqual(second);
    expect(first.turn).toBe('player');
    expect(first.players.opponent.mana).toBeLessThanOrEqual(4);
    expect(first.players.opponent.heroHealth).toBeGreaterThan(0);
  });

  it('uses lethal direct damage when available', () => {
    const state = opponentTurnState();
    state.players.player.heroHealth = 3;
    state.players.player.board = [];

    const next = takeAiTurn(state);

    expect(next.winner).toBe('opponent');
  });

  it('does not cast friendly-only healing spells on enemy targets', () => {
    const state = opponentTurnState();
    state.players.opponent.hand = [{ uid: 210, cardId: 'mend' }];
    state.players.opponent.board = [];
    state.players.opponent.heroHealth = 30;

    const next = takeAiTurn(state);

    expect(next.turn).toBe('player');
    expect(next.players.opponent.hand).toEqual([{ uid: 210, cardId: 'mend' }]);
  });
});
