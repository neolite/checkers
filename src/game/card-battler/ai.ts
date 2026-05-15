import {
  attack,
  endTurn,
  getCard,
  getEnemyTargets,
  getPlayableHand,
  playCard,
  type CardBattlerState,
  type CardTarget,
} from './rules';

export function takeAiTurn(input: CardBattlerState): CardBattlerState {
  if (input.turn !== 'opponent' || input.winner) return input;
  let state = input;
  state = playLethalSpellIfAvailable(state);
  if (state.winner) return state;
  state = playAffordableCards(state);
  if (state.winner) return state;
  state = attackWithBoard(state);
  if (state.winner) return state;
  return endTurn(state);
}

function playLethalSpellIfAvailable(state: CardBattlerState): CardBattlerState {
  for (const hand of getPlayableHand(state, 'opponent')) {
    const card = getCard(hand.cardId);
    if (card.kind !== 'spell' || card.spell?.type !== 'damage') continue;
    if (state.players.player.heroHealth <= card.spell.amount) {
      return playCard(state, hand.uid, { type: 'hero', player: 'player' });
    }
  }
  return state;
}

function playAffordableCards(input: CardBattlerState): CardBattlerState {
  let state = input;
  let changed = true;
  while (changed && !state.winner) {
    changed = false;
    const playable = getPlayableHand(state, 'opponent')
      .map((h) => ({ hand: h, card: getCard(h.cardId) }))
      .sort((a, b) => b.card.cost - a.card.cost || a.card.name.localeCompare(b.card.name));
    for (const { hand, card } of playable) {
      if (card.kind === 'minion') {
        if (state.players.opponent.board.length >= 5) continue;
        state = playCard(state, hand.uid);
        changed = true;
        break;
      }
      const target = chooseSpellTarget(state, card);
      if (target) {
        state = playCard(state, hand.uid, target);
        changed = true;
        break;
      }
    }
  }
  return state;
}

function chooseSpellTarget(state: CardBattlerState, card: ReturnType<typeof getCard>): CardTarget | null {
  const spell = card.spell;
  if (!spell) return null;
  if (spell.targets === 'friendly') {
    const damagedMinion = [...state.players.opponent.board]
      .filter((m) => m.health < m.maxHealth)
      .sort((a, b) => b.attack - a.attack || a.health - b.health)[0];
    if (damagedMinion) return { type: 'minion', player: 'opponent', instanceId: damagedMinion.instanceId };
    if (state.players.opponent.heroHealth < 30) return { type: 'hero', player: 'opponent' };
    return null;
  }
  const amount = spell.amount;
  const lethalMinion = [...state.players.player.board]
    .sort((a, b) => b.attack - a.attack || a.health - b.health)
    .find((m) => m.health <= amount);
  if (lethalMinion) return { type: 'minion', player: 'player', instanceId: lethalMinion.instanceId };
  return { type: 'hero', player: 'player' };
}

function attackWithBoard(input: CardBattlerState): CardBattlerState {
  let state = input;
  const attackers = [...state.players.opponent.board]
    .filter((m) => m.ready)
    .sort((a, b) => b.attack - a.attack || a.instanceId - b.instanceId);
  for (const attacker of attackers) {
    if (state.winner) break;
    const live = state.players.opponent.board.find((m) => m.instanceId === attacker.instanceId);
    if (!live?.ready) continue;
    const target = chooseAttackTarget(state, live.attack);
    state = attack(state, live.instanceId, target);
  }
  return state;
}

function chooseAttackTarget(state: CardBattlerState, attackPower: number): CardTarget {
  const killable = [...state.players.player.board]
    .filter((m) => m.health <= attackPower)
    .sort((a, b) => b.attack - a.attack || a.health - b.health)[0];
  if (killable) return { type: 'minion', player: 'player', instanceId: killable.instanceId };
  return getEnemyTargets(state, 'opponent')[0]!;
}
