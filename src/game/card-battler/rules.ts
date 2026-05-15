export type PlayerId = 'player' | 'opponent';

export interface CardDefinition {
  id: string;
  name: string;
  cost: number;
  kind: 'minion' | 'spell';
  text: string;
  attack?: number;
  health?: number;
  spell?: {
    type: 'damage' | 'heal';
    amount: number;
    targets: 'enemy' | 'friendly' | 'any';
  };
}

export interface CardInHand {
  uid: number;
  cardId: string;
}

export interface MinionInstance {
  instanceId: number;
  cardId: string;
  owner: PlayerId;
  attack: number;
  health: number;
  maxHealth: number;
  ready: boolean;
}

export interface PlayerState {
  id: PlayerId;
  heroHealth: number;
  maxMana: number;
  mana: number;
  deck: string[];
  hand: CardInHand[];
  board: MinionInstance[];
  fatigue: number;
}

export interface CardBattlerState {
  turn: PlayerId;
  players: Record<PlayerId, PlayerState>;
  nextCardUid: number;
  nextMinionId: number;
  log: string[];
  winner: PlayerId | null;
}

export type CardTarget =
  | { readonly type: 'hero'; readonly player: PlayerId }
  | { readonly type: 'minion'; readonly player: PlayerId; readonly instanceId: number };

export const MAX_HAND = 10;
export const MAX_BOARD = 5;
export const MAX_MANA = 10;

export const CARD_DEFS = {
  emberSquire: {
    id: 'emberSquire',
    name: 'Ember Squire',
    cost: 1,
    kind: 'minion',
    attack: 1,
    health: 2,
    text: 'Cheap body for early board control.',
  },
  mirrorGuard: {
    id: 'mirrorGuard',
    name: 'Mirror Guard',
    cost: 2,
    kind: 'minion',
    attack: 2,
    health: 3,
    text: 'Stable defensive minion.',
  },
  vaultRaider: {
    id: 'vaultRaider',
    name: 'Vault Raider',
    cost: 3,
    kind: 'minion',
    attack: 4,
    health: 2,
    text: 'High attack, fragile pressure.',
  },
  ironColossus: {
    id: 'ironColossus',
    name: 'Iron Colossus',
    cost: 6,
    kind: 'minion',
    attack: 6,
    health: 7,
    text: 'Late-game finisher.',
  },
  firebolt: {
    id: 'firebolt',
    name: 'Firebolt',
    cost: 2,
    kind: 'spell',
    text: 'Deal 3 damage to an enemy.',
    spell: { type: 'damage', amount: 3, targets: 'enemy' },
  },
  mend: {
    id: 'mend',
    name: 'Mend',
    cost: 1,
    kind: 'spell',
    text: 'Restore 2 health to a friendly target.',
    spell: { type: 'heal', amount: 2, targets: 'friendly' },
  },
} as const satisfies Record<string, CardDefinition>;

export type CardId = keyof typeof CARD_DEFS;

const STARTING_DECK: readonly CardId[] = [
  'emberSquire',
  'mirrorGuard',
  'firebolt',
  'vaultRaider',
  'mend',
  'emberSquire',
  'mirrorGuard',
  'firebolt',
  'vaultRaider',
  'ironColossus',
  'emberSquire',
  'mirrorGuard',
  'firebolt',
  'vaultRaider',
  'ironColossus',
];

function cloneState(state: CardBattlerState): CardBattlerState {
  return {
    turn: state.turn,
    nextCardUid: state.nextCardUid,
    nextMinionId: state.nextMinionId,
    winner: state.winner,
    log: [...state.log],
    players: {
      player: clonePlayer(state.players.player),
      opponent: clonePlayer(state.players.opponent),
    },
  };
}

function clonePlayer(player: PlayerState): PlayerState {
  return {
    ...player,
    deck: [...player.deck],
    hand: [...player.hand],
    board: player.board.map((m) => ({ ...m })),
  };
}

function other(player: PlayerId): PlayerId {
  return player === 'player' ? 'opponent' : 'player';
}

function pushLog(state: CardBattlerState, entry: string): CardBattlerState {
  return { ...state, log: [entry, ...state.log].slice(0, 40) };
}

function createPlayer(id: PlayerId): PlayerState {
  return {
    id,
    heroHealth: 30,
    maxMana: 0,
    mana: 0,
    deck: [...STARTING_DECK],
    hand: [],
    board: [],
    fatigue: 0,
  };
}

export function createCardBattlerState(): CardBattlerState {
  let state: CardBattlerState = {
    turn: 'player',
    nextCardUid: 1,
    nextMinionId: 1,
    winner: null,
    log: ['Duel started'],
    players: {
      player: createPlayer('player'),
      opponent: createPlayer('opponent'),
    },
  };
  for (let i = 0; i < 4; i += 1) {
    state = drawCard(drawCard(state, 'player'), 'opponent');
  }
  state = setPlayer(state, 'player', { ...state.players.player, maxMana: 1, mana: 1 });
  return state;
}

export function getCard(cardId: string): CardDefinition {
  const card = CARD_DEFS[cardId as CardId];
  if (!card) throw new Error(`Unknown card: ${cardId}`);
  return card;
}

export function setPlayer(
  state: CardBattlerState,
  playerId: PlayerId,
  player: PlayerState,
): CardBattlerState {
  return {
    ...state,
    players: {
      ...state.players,
      [playerId]: player,
    },
  };
}

export function drawCard(state: CardBattlerState, playerId: PlayerId): CardBattlerState {
  const player = state.players[playerId];
  if (player.deck.length === 0) {
    const fatigue = player.fatigue + 1;
    const damaged = { ...player, fatigue, heroHealth: player.heroHealth - fatigue };
    return resolveDeaths(pushLog(setPlayer(state, playerId, damaged), `${label(playerId)} takes ${fatigue} fatigue`));
  }
  const [cardId, ...deck] = player.deck;
  if (!cardId || player.hand.length >= MAX_HAND) {
    return setPlayer(state, playerId, { ...player, deck });
  }
  const hand = [...player.hand, { uid: state.nextCardUid, cardId }];
  return {
    ...setPlayer(state, playerId, { ...player, deck, hand }),
    nextCardUid: state.nextCardUid + 1,
  };
}

function startTurn(state: CardBattlerState, playerId: PlayerId): CardBattlerState {
  const player = state.players[playerId];
  const maxMana = Math.min(MAX_MANA, player.maxMana + 1);
  const board = player.board.map((m) => ({ ...m, ready: true }));
  let next = setPlayer(state, playerId, { ...player, maxMana, mana: maxMana, board });
  next = drawCard(next, playerId);
  return pushLog(next, `${label(playerId)} turn ${maxMana}/${MAX_MANA}`);
}

export function endTurn(state: CardBattlerState): CardBattlerState {
  if (state.winner) return state;
  const nextTurn = other(state.turn);
  return startTurn({ ...state, turn: nextTurn }, nextTurn);
}

export function playCard(
  input: CardBattlerState,
  handUid: number,
  target?: CardTarget,
): CardBattlerState {
  if (input.winner) return input;
  const state = cloneState(input);
  const player = state.players[state.turn];
  const cardInHand = player.hand.find((c) => c.uid === handUid);
  if (!cardInHand) throw new Error('Card is not in hand');
  const card = getCard(cardInHand.cardId);
  if (card.cost > player.mana) throw new Error('Not enough mana');
  let nextPlayer: PlayerState = {
    ...player,
    mana: player.mana - card.cost,
    hand: player.hand.filter((c) => c.uid !== handUid),
  };
  let next = setPlayer(state, state.turn, nextPlayer);

  if (card.kind === 'minion') {
    if (nextPlayer.board.length >= MAX_BOARD) throw new Error('Board is full');
    const minion: MinionInstance = {
      instanceId: state.nextMinionId,
      cardId: card.id,
      owner: state.turn,
      attack: card.attack ?? 0,
      health: card.health ?? 1,
      maxHealth: card.health ?? 1,
      ready: false,
    };
    nextPlayer = { ...nextPlayer, board: [...nextPlayer.board, minion] };
    next = {
      ...setPlayer(next, state.turn, nextPlayer),
      nextMinionId: state.nextMinionId + 1,
    };
    return pushLog(next, `${label(state.turn)} summons ${card.name}`);
  }

  if (!card.spell) throw new Error('Spell has no effect');
  if (!target) throw new Error('Spell requires a target');
  validateSpellTarget(state.turn, card, target);
  next = applySpell(next, state.turn, card, target);
  return resolveDeaths(pushLog(next, `${label(state.turn)} casts ${card.name}`));
}

function validateSpellTarget(caster: PlayerId, card: CardDefinition, target: CardTarget): void {
  const targetOwner = target.player;
  if (card.spell?.targets === 'enemy' && targetOwner === caster) throw new Error('Spell needs enemy target');
  if (card.spell?.targets === 'friendly' && targetOwner !== caster) throw new Error('Spell needs friendly target');
}

function applySpell(
  state: CardBattlerState,
  caster: PlayerId,
  card: CardDefinition,
  target: CardTarget,
): CardBattlerState {
  const spell = card.spell;
  if (!spell) return state;
  if (target.type === 'hero') {
    const player = state.players[target.player];
    const delta = spell.type === 'damage' ? -spell.amount : spell.amount;
    return setPlayer(state, target.player, { ...player, heroHealth: Math.min(30, player.heroHealth + delta) });
  }
  const owner = state.players[target.player];
  const board = owner.board.map((m) => {
    if (m.instanceId !== target.instanceId) return m;
    if (spell.type === 'damage') return { ...m, health: m.health - spell.amount };
    return { ...m, health: Math.min(m.maxHealth, m.health + spell.amount) };
  });
  if (!board.some((m) => m.instanceId === target.instanceId)) throw new Error('Target minion not found');
  return setPlayer(state, target.player, { ...owner, board });
}

export function attack(
  input: CardBattlerState,
  attackerInstanceId: number,
  target: CardTarget,
): CardBattlerState {
  if (input.winner) return input;
  const state = cloneState(input);
  const attackerOwner = state.players[state.turn];
  const attacker = attackerOwner.board.find((m) => m.instanceId === attackerInstanceId);
  if (!attacker) throw new Error('Attacker not found');
  if (!attacker.ready) throw new Error('Minion is not ready');
  if (target.player === state.turn) throw new Error('Cannot attack friendly targets');

  let next = setMinion(state, state.turn, { ...attacker, ready: false });
  if (target.type === 'hero') {
    const defender = next.players[target.player];
    next = setPlayer(next, target.player, { ...defender, heroHealth: defender.heroHealth - attacker.attack });
    return resolveDeaths(pushLog(next, `${cardName(attacker.cardId)} hits ${label(target.player)} hero`));
  }

  const targetMinion = next.players[target.player].board.find((m) => m.instanceId === target.instanceId);
  if (!targetMinion) throw new Error('Target minion not found');
  next = setMinion(next, state.turn, { ...attacker, health: attacker.health - targetMinion.attack, ready: false });
  next = setMinion(next, target.player, { ...targetMinion, health: targetMinion.health - attacker.attack });
  return resolveDeaths(pushLog(next, `${cardName(attacker.cardId)} trades into ${cardName(targetMinion.cardId)}`));
}

function setMinion(
  state: CardBattlerState,
  playerId: PlayerId,
  minion: MinionInstance,
): CardBattlerState {
  const player = state.players[playerId];
  const board = player.board.map((m) => (m.instanceId === minion.instanceId ? minion : m));
  if (!board.some((m) => m.instanceId === minion.instanceId)) throw new Error('Minion not found');
  return setPlayer(state, playerId, { ...player, board });
}

export function resolveDeaths(state: CardBattlerState): CardBattlerState {
  let next = state;
  for (const playerId of ['player', 'opponent'] as const) {
    const player = next.players[playerId];
    next = setPlayer(next, playerId, { ...player, board: player.board.filter((m) => m.health > 0) });
  }
  const playerDead = next.players.player.heroHealth <= 0;
  const opponentDead = next.players.opponent.heroHealth <= 0;
  if (playerDead && opponentDead) return { ...next, winner: 'opponent' };
  if (playerDead) return { ...next, winner: 'opponent' };
  if (opponentDead) return { ...next, winner: 'player' };
  return next;
}

export function getWinner(state: CardBattlerState): PlayerId | null {
  return state.winner;
}

export function getPlayableHand(state: CardBattlerState, playerId: PlayerId = state.turn): CardInHand[] {
  const player = state.players[playerId];
  return player.hand.filter((c) => getCard(c.cardId).cost <= player.mana);
}

export function getEnemyTargets(state: CardBattlerState, playerId: PlayerId): CardTarget[] {
  const enemy = other(playerId);
  return [
    { type: 'hero', player: enemy },
    ...state.players[enemy].board.map((m) => ({ type: 'minion' as const, player: enemy, instanceId: m.instanceId })),
  ];
}

export function label(playerId: PlayerId): string {
  return playerId === 'player' ? 'You' : 'AI';
}

export function cardName(cardId: string): string {
  return getCard(cardId).name;
}
