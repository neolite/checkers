import { describe, expect, it } from 'vitest';
import {
  attack,
  createCardBattlerState,
  endTurn,
  getWinner,
  playCard,
  type CardBattlerState,
  type MinionInstance,
} from './rules';

function readyBoardState(): CardBattlerState {
  const state = createCardBattlerState();
  state.players.player.hand = [
    { uid: 100, cardId: 'emberSquire' },
    { uid: 101, cardId: 'firebolt' },
  ];
  state.players.player.mana = 5;
  state.players.player.maxMana = 5;
  state.players.opponent.board = [
    {
      instanceId: 77,
      cardId: 'mirrorGuard',
      owner: 'opponent',
      attack: 2,
      health: 2,
      maxHealth: 2,
      ready: true,
    },
  ];
  return state;
}

describe('arcane card battler rules', () => {
  it('starts on player turn with one mana and opening hands', () => {
    const state = createCardBattlerState();

    expect(state.turn).toBe('player');
    expect(state.players.player.mana).toBe(1);
    expect(state.players.player.maxMana).toBe(1);
    expect(state.players.player.hand).toHaveLength(4);
    expect(state.players.opponent.hand).toHaveLength(4);
  });

  it('plays an affordable minion from hand and spends mana', () => {
    const state = readyBoardState();
    const next = playCard(state, 100);

    expect(next.players.player.mana).toBe(4);
    expect(next.players.player.hand.map((c) => c.uid)).toEqual([101]);
    expect(next.players.player.board).toEqual([
      expect.objectContaining({ cardId: 'emberSquire', attack: 1, health: 2, ready: false }),
    ]);
  });

  it('rejects cards that cost more than available mana', () => {
    const state = readyBoardState();
    state.players.player.hand = [{ uid: 102, cardId: 'ironColossus' }];
    state.players.player.mana = 3;

    expect(() => playCard(state, 102)).toThrow(/mana/i);
  });

  it('requires spell targets and resolves damage against minions', () => {
    const state = readyBoardState();
    expect(() => playCard(state, 101)).toThrow(/target/i);

    const next = playCard(state, 101, { type: 'minion', player: 'opponent', instanceId: 77 });

    expect(next.players.player.mana).toBe(3);
    expect(next.players.opponent.board).toHaveLength(0);
    expect(next.log[0]).toMatch(/Firebolt/);
  });

  it('readies sleeping minions on their owner next turn', () => {
    const state = readyBoardState();
    const withMinion = playCard(state, 100);
    const opponentTurn = endTurn(withMinion);
    const playerTurn = endTurn(opponentTurn);

    expect(playerTurn.turn).toBe('player');
    expect(playerTurn.players.player.board[0]?.ready).toBe(true);
  });

  it('lets ready minions attack hero or minions once per turn', () => {
    const state = readyBoardState();
    const minion: MinionInstance = {
      instanceId: 55,
      cardId: 'emberSquire',
      owner: 'player',
      attack: 2,
      health: 2,
      maxHealth: 2,
      ready: true,
    };
    state.players.player.board = [minion];

    const next = attack(state, 55, { type: 'hero', player: 'opponent' });

    expect(next.players.opponent.heroHealth).toBe(28);
    expect(next.players.player.board[0]?.ready).toBe(false);
    expect(() => attack(next, 55, { type: 'hero', player: 'opponent' })).toThrow(/ready/i);
  });

  it('detects the winner after lethal hero damage', () => {
    const state = readyBoardState();
    state.players.opponent.heroHealth = 2;
    state.players.player.board = [{
      instanceId: 88,
      cardId: 'mirrorGuard',
      owner: 'player',
      attack: 2,
      health: 3,
      maxHealth: 3,
      ready: true,
    }];

    const next = attack(state, 88, { type: 'hero', player: 'opponent' });

    expect(getWinner(next)).toBe('player');
    expect(next.winner).toBe('player');
  });
});
