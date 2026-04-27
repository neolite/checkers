import { FACTIONS } from '@game/rts/content/factions';
import { FACTION_COLORS, type FactionId } from '@config/palette';

export type GameMode = 'ffa' | 'allVsYou' | 'playground';

export function renderMenu(host: HTMLElement, onStart: (faction: FactionId, mode: GameMode) => void): void {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'menu';
  wrap.innerHTML = `
    <div class="menu-panel">
      <h1><span class="accent">Three Factions</span> — RTS Prototype</h1>
      <p>
        Pick a faction and a game mode. Controls: LMB drag = box select · LMB click = pick ·
        RMB = move/attack/harvest · Ctrl+RMB = attack-move · RMB on ground while HQ/Barracks
        selected = rally point · X = stop · H = hold · M = mute · WASD/Edge = pan · Wheel = zoom.
      </p>

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
        <div class="hint">Single-player · procedural terrain · textured faction materials.</div>
        <button class="btn" id="start-btn" disabled>Start</button>
      </div>
    </div>
  `;
  host.appendChild(wrap);
  const row = wrap.querySelector('#menu-factions') as HTMLDivElement;
  const modeRow = wrap.querySelector('#menu-modes') as HTMLDivElement;
  const btn = wrap.querySelector('#start-btn') as HTMLButtonElement;
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
    if (chosen) onStart(chosen, mode);
  });
}

export function destroyMenu(host: HTMLElement): void {
  const m = host.querySelector('.menu');
  if (m && m.parentElement) m.parentElement.removeChild(m);
}
