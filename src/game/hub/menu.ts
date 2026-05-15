import type { GameRoute } from '@engine/core/runtime';
import { GAME_ROUTES } from '@game/catalog';
import { FACTIONS } from '@game/rts/content/factions';
import { FACTION_COLORS, type FactionId } from '@config/palette';

export type GameMode = 'ffa' | 'allVsYou' | 'playground';
type StartGame = <TOptions>(route: GameRoute<TOptions>, options: TOptions) => void;

export function renderGameHub(
  host: HTMLElement,
  startGame: StartGame,
): void {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'menu';
  wrap.innerHTML = `
    <div class="menu-panel">
      <h1><span class="accent">Tactical Arcade</span> — Game Lab</h1>
      <p>
        Pick a game. RTS controls: LMB drag = box select · LMB click = pick ·
        RMB = move/attack/harvest · Ctrl+RMB = attack-move · RMB on ground while HQ/Barracks
        selected = rally point · X = stop · H = hold · M = mute · WASD/Edge = pan · Wheel = zoom.
      </p>

      <div class="section-label">Featured Games</div>
      <div class="mode-row">
        <div class="mode-card game-card" id="checkers-btn">
          <h3>Premium Checkers</h3>
          <div class="desc">Luxury Russian 8x8 checkers with flying kings, AI and cinematic board.</div>
        </div>
        <div class="mode-card game-card" id="card-battler-btn">
          <h3>Arcane Duel</h3>
          <div class="desc">Hearthstone-like tactical card battler with mana, minions, spells and local AI.</div>
        </div>
        <div class="mode-card game-card" id="td-btn">
          <h3>Tripod Defense</h3>
          <div class="desc">Tower defense with heat-ray tripods and waves.</div>
        </div>
        <div class="mode-card game-card" id="rogue-btn">
          <h3>Roguelike</h3>
          <div class="desc">Compact dungeon combat prototype.</div>
        </div>
      </div>

      <div class="section-label">RTS Mode</div>
      <div class="mode-row" id="menu-modes">
        <div class="mode-card" data-mode="ffa">
          <h3>Free-for-all</h3>
          <div class="desc">Three teams, one each. Everyone fights everyone.</div>
        </div>
        <div class="mode-card" data-mode="allVsYou">
          <h3>All vs You</h3>
          <div class="desc">Both AI factions are allied against you. Harder start.</div>
        </div>
        <div class="mode-card" data-mode="playground">
          <h3>Playground</h3>
          <div class="desc">Battle Lab. Empty revealed map with unit spawn controls and live config tuning.</div>
        </div>
      </div>

      <div class="section-label">Faction</div>
      <div class="faction-row" id="menu-factions"></div>

      <div class="menu-actions">
        <div class="hint">Game modules share one TypeScript + Three.js runtime.</div>
        <button class="btn" id="start-btn" disabled>Start</button>
      </div>
    </div>
  `;
  host.appendChild(wrap);
  const row = wrap.querySelector('#menu-factions') as HTMLDivElement;
  const modeRow = wrap.querySelector('#menu-modes') as HTMLDivElement;
  const btn = wrap.querySelector('#start-btn') as HTMLButtonElement;
  const tdBtn = wrap.querySelector('#td-btn') as HTMLButtonElement;
  const rogueBtn = wrap.querySelector('#rogue-btn') as HTMLButtonElement;
  const checkersBtn = wrap.querySelector('#checkers-btn') as HTMLButtonElement;
  const cardBattlerBtn = wrap.querySelector('#card-battler-btn') as HTMLButtonElement;
  let chosen: FactionId | null = null;
  let mode: GameMode = 'ffa';

  function highlightMode(): void {
    for (const c of modeRow.children) {
      const el = c as HTMLDivElement;
      const active = el.dataset['mode'] === mode;
      el.style.outline = active ? '2px solid #6fd0ff' : '';
    }
  }
  for (const c of modeRow.children) {
    const el = c as HTMLDivElement;
    el.addEventListener('click', () => {
      mode = (el.dataset['mode'] as GameMode) ?? 'ffa';
      highlightMode();
    });
  }
  highlightMode();

  for (const id of Object.keys(FACTIONS) as FactionId[]) {
    const meta = FACTIONS[id];
    const col = FACTION_COLORS[id];
    const card = document.createElement('div');
    card.className = 'faction-card';
    card.style.setProperty('--accent', col.accentCss);
    card.style.borderColor = col.primaryCss;
    card.innerHTML = `
      <h3 style="color:${col.primaryCss}">${meta.displayName}</h3>
      <span class="tag">${meta.tag}</span>
      <div class="desc">${meta.description}</div>
    `;
    card.addEventListener('click', () => {
      chosen = id;
      btn.disabled = false;
      for (const c of row.children) {
        (c as HTMLDivElement).style.outline = '';
      }
      card.style.outline = `2px solid ${col.accentCss}`;
    });
    row.appendChild(card);
  }

  btn.addEventListener('click', () => {
    if (chosen) startGame(GAME_ROUTES.rts, { faction: chosen, mode });
  });
  tdBtn.addEventListener('click', () => {
    startGame(GAME_ROUTES.towerDefense, {});
  });
  rogueBtn.addEventListener('click', () => {
    startGame(GAME_ROUTES.roguelike, {});
  });
  checkersBtn.addEventListener('click', () => {
    startGame(GAME_ROUTES.checkers, {});
  });
  cardBattlerBtn.addEventListener('click', () => {
    startGame(GAME_ROUTES.cardBattler, {});
  });
}

export function destroyGameHub(host: HTMLElement): void {
  const m = host.querySelector('.menu');
  if (m && m.parentElement) m.parentElement.removeChild(m);
}
