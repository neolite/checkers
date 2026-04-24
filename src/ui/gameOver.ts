import { FACTIONS } from '@config/factions';
import { FACTION_COLORS, type FactionId } from '@config/palette';

export function showGameOver(
  host: HTMLElement,
  kind: 'victory' | 'defeat',
  winner: FactionId | null,
  onRestart: () => void,
): void {
  const wrap = document.createElement('div');
  wrap.className = `game-over ${kind}`;
  const title = kind === 'victory' ? 'Victory' : 'Defeat';
  const subtitle = winner
    ? `Winner: <span style="color:${FACTION_COLORS[winner].primaryCss}">${FACTIONS[winner].displayName}</span>`
    : 'All factions eliminated.';
  wrap.innerHTML = `
    <div class="panel">
      <h2>${title}</h2>
      <div style="margin-bottom:18px; font-size:13px;">${subtitle}</div>
      <button class="btn" id="btn-restart">Back to menu</button>
    </div>
  `;
  host.appendChild(wrap);
  const btn = wrap.querySelector('#btn-restart') as HTMLButtonElement;
  btn.addEventListener('click', () => {
    if (wrap.parentElement) wrap.parentElement.removeChild(wrap);
    onRestart();
  });
}
