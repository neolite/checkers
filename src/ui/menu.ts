import { FACTIONS } from '@config/factions';
import { FACTION_COLORS, type FactionId } from '@config/palette';

export function renderMenu(host: HTMLElement, onStart: (faction: FactionId) => void): void {
  host.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'menu';
  wrap.innerHTML = `
    <div class="menu-panel">
      <h1><span class="accent">Three Factions</span> — RTS Prototype</h1>
      <p>
        Pick a faction. A single enemy from each other faction starts at opposite corners.
        <br/>LMB drag = box select · LMB click = pick · RMB = move/attack · Ctrl+RMB = attack-move · S = stop · WASD/Edge = pan · Wheel = zoom.
      </p>
      <div class="faction-row" id="menu-factions"></div>
      <div class="menu-actions">
        <div class="hint">Single-player · procedurally rendered · no textures.</div>
        <button class="btn" id="start-btn" disabled>Start</button>
      </div>
    </div>
  `;
  host.appendChild(wrap);
  const row = wrap.querySelector('#menu-factions') as HTMLDivElement;
  const btn = wrap.querySelector('#start-btn') as HTMLButtonElement;
  let chosen: FactionId | null = null;

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
    if (chosen) onStart(chosen);
  });
}

export function destroyMenu(host: HTMLElement): void {
  const m = host.querySelector('.menu');
  if (m && m.parentElement) m.parentElement.removeChild(m);
}
