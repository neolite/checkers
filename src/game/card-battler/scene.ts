import { takeAiTurn } from './ai';
import {
  CARD_DEFS,
  attack,
  cardName,
  createCardBattlerState,
  endTurn,
  getCard,
  playCard,
  type CardBattlerState,
  type CardInHand,
  type CardTarget,
  type MinionInstance,
} from './rules';

interface SceneHandle {
  destroy(): void;
}

type Selection =
  | { kind: 'hand'; uid: number }
  | { kind: 'attacker'; instanceId: number }
  | null;

export function startCardBattlerScene(host: HTMLElement, exitToMenu: () => void): SceneHandle {
  const root = document.createElement('div');
  root.className = 'cb-root';
  host.appendChild(root);

  let state = createCardBattlerState();
  let selected: Selection = null;
  let aiTimer = 0;
  let notice = 'Summon minions, cast spells, and reduce the enemy hero to zero.';

  root.addEventListener('click', onClick);
  render();

  return {
    destroy() {
      window.clearTimeout(aiTimer);
      root.removeEventListener('click', onClick);
      root.remove();
    },
  };

  function onClick(event: MouseEvent): void {
    const el = (event.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!el || state.turn !== 'player' || state.winner) {
      if (el?.dataset['action'] === 'menu') exitToMenu();
      if (el?.dataset['action'] === 'restart') restart();
      return;
    }
    const action = el.dataset['action'];
    try {
      if (action === 'menu') exitToMenu();
      if (action === 'restart') restart();
      if (action === 'end') endPlayerTurn();
      if (action === 'card') selectCard(Number(el.dataset['uid']));
      if (action === 'own-minion') selectAttacker(Number(el.dataset['id']));
      if (action === 'enemy-hero') useTarget({ type: 'hero', player: 'opponent' });
      if (action === 'enemy-minion') useTarget({ type: 'minion', player: 'opponent', instanceId: Number(el.dataset['id']) });
      render();
    } catch (err) {
      notice = err instanceof Error ? err.message : 'Illegal action';
      render();
    }
  }

  function selectCard(uid: number): void {
    const cardInHand = state.players.player.hand.find((c) => c.uid === uid);
    if (!cardInHand) return;
    const card = getCard(cardInHand.cardId);
    if (card.kind === 'minion') {
      state = playCard(state, uid);
      selected = null;
      notice = `${card.name} enters the board.`;
      return;
    }
    selected = { kind: 'hand', uid };
    notice = `Choose a target for ${card.name}.`;
  }

  function selectAttacker(instanceId: number): void {
    const minion = state.players.player.board.find((m) => m.instanceId === instanceId);
    if (!minion) return;
    if (!minion.ready) {
      notice = `${cardName(minion.cardId)} is exhausted.`;
      return;
    }
    selected = { kind: 'attacker', instanceId };
    notice = `Choose what ${cardName(minion.cardId)} attacks.`;
  }

  function useTarget(target: CardTarget): void {
    if (!selected) {
      notice = 'Select a spell or ready minion first.';
      return;
    }
    if (selected.kind === 'hand') {
      state = playCard(state, selected.uid, target);
      selected = null;
      notice = 'Spell resolved.';
      return;
    }
    state = attack(state, selected.instanceId, target);
    selected = null;
    notice = 'Attack resolved.';
  }

  function endPlayerTurn(): void {
    selected = null;
    state = endTurn(state);
    notice = 'AI is thinking...';
    render();
    aiTimer = window.setTimeout(() => {
      state = takeAiTurn(state);
      notice = state.winner ? 'Match complete.' : 'Your turn.';
      render();
    }, 520);
  }

  function restart(): void {
    window.clearTimeout(aiTimer);
    state = createCardBattlerState();
    selected = null;
    notice = 'New duel started.';
    render();
  }

  function render(): void {
    root.innerHTML = `
      <div class="cb-backdrop"></div>
      <div class="cb-topbar">
        <div>
          <div class="cb-title">Arcane Duel</div>
          <div class="cb-sub">Premium tactical card battler prototype</div>
        </div>
        <div class="cb-pill ${state.turn === 'player' ? 'active' : ''}">${state.turn === 'player' ? 'Your turn' : 'AI turn'}</div>
        <div class="cb-pill">${state.players.player.mana}/${state.players.player.maxMana} mana</div>
        <button class="cb-btn" data-action="restart">Restart</button>
        <button class="cb-btn" data-action="menu">Menu</button>
      </div>
      <div class="cb-arena">
        ${heroPanel('opponent')}
        <div class="cb-board">
          <div class="cb-lane enemy">${renderBoard('opponent')}</div>
          <div class="cb-center">
            <div class="cb-orb"></div>
            <div class="cb-notice">${state.winner ? winnerText() : notice}</div>
          </div>
          <div class="cb-lane friendly">${renderBoard('player')}</div>
        </div>
        ${heroPanel('player')}
      </div>
      <div class="cb-hand">${state.players.player.hand.map(renderHandCard).join('')}</div>
      <div class="cb-side">
        <div class="cb-side-title">Battle Log</div>
        <div class="cb-log">${state.log.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}</div>
        <button class="cb-end" data-action="end" ${state.turn !== 'player' || Boolean(state.winner) ? 'disabled' : ''}>End Turn</button>
      </div>
    `;
  }

  function heroPanel(playerId: 'player' | 'opponent'): string {
    const player = state.players[playerId];
    const enemyAction = playerId === 'opponent' ? 'data-action="enemy-hero"' : '';
    const targetClass = selected && playerId === 'opponent' ? 'targetable' : '';
    return `
      <div class="cb-hero ${playerId} ${targetClass}" ${enemyAction}>
        <div class="cb-portrait">${playerId === 'player' ? 'A' : 'V'}</div>
        <div>
          <div class="cb-hero-name">${playerId === 'player' ? 'Archmage' : 'Void Dealer'}</div>
          <div class="cb-hero-sub">${player.deck.length} deck · ${player.hand.length} hand</div>
        </div>
        <div class="cb-health">${Math.max(0, player.heroHealth)}</div>
      </div>
    `;
  }

  function renderBoard(playerId: 'player' | 'opponent'): string {
    const board = state.players[playerId].board;
    if (board.length === 0) return '<div class="cb-empty-slot">empty board</div>';
    return board.map((m) => renderMinion(m, playerId)).join('');
  }

  function renderMinion(minion: MinionInstance, owner: 'player' | 'opponent'): string {
    const card = getCard(minion.cardId);
    const action = owner === 'player' ? 'own-minion' : 'enemy-minion';
    const selectedClass = selected?.kind === 'attacker' && selected.instanceId === minion.instanceId ? 'selected' : '';
    const targetClass = owner === 'opponent' && selected ? 'targetable' : '';
    const readyClass = owner === 'player' && minion.ready ? 'ready' : '';
    return `
      <button class="cb-minion ${owner} ${selectedClass} ${targetClass} ${readyClass}" data-action="${action}" data-id="${minion.instanceId}">
        <div class="cb-minion-art">${card.name.slice(0, 1)}</div>
        <div class="cb-minion-name">${card.name}</div>
        <div class="cb-stat atk">${minion.attack}</div>
        <div class="cb-stat hp">${Math.max(0, minion.health)}</div>
      </button>
    `;
  }

  function renderHandCard(card: CardInHand): string {
    const def = CARD_DEFS[card.cardId as keyof typeof CARD_DEFS];
    const playable = state.turn === 'player' && def.cost <= state.players.player.mana && !state.winner;
    const selectedClass = selected?.kind === 'hand' && selected.uid === card.uid ? 'selected' : '';
    return `
      <button class="cb-card ${playable ? 'playable' : ''} ${selectedClass}" data-action="card" data-uid="${card.uid}">
        <div class="cb-cost">${def.cost}</div>
        <div class="cb-card-art">${def.kind === 'spell' ? '*' : 'D'}</div>
        <div class="cb-card-name">${def.name}</div>
        <div class="cb-card-text">${def.text}</div>
        ${def.kind === 'minion' ? `<div class="cb-card-stats">${def.attack}/${def.health}</div>` : ''}
      </button>
    `;
  }

  function winnerText(): string {
    return state.winner === 'player' ? 'Victory. The table is yours.' : 'Defeat. The Void Dealer wins.';
  }
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (char) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return map[char] ?? char;
  });
}
