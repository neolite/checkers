import type { FactionId } from '@config/palette';
import { FACTION_IDS, FACTION_COLORS } from '@config/palette';
import { FACTIONS } from '@game/rts/content/factions';
import { UNIT_STATS, type UnitKind } from '@game/rts/content/units';

export interface PlaygroundPanelHandle {
  destroy(): void;
}

export function mountPlaygroundPanel(
  host: HTMLElement,
  spawn: (faction: FactionId, kind: UnitKind, count: number) => void,
  clear: () => void,
): PlaygroundPanelHandle {
  const panel = document.createElement('div');
  panel.className = 'playground-panel';
  panel.innerHTML = `
    <div class="pg-head">
      <div>
        <div class="pg-title">Battle Lab</div>
        <div class="pg-sub">Spawn units · tune live</div>
      </div>
      <div class="pg-actions">
        <button class="pg-btn" id="pg-dev">Dev Panel</button>
        <button class="pg-btn danger" id="pg-clear">Clear</button>
      </div>
    </div>
    <div class="pg-factions"></div>
  `;
  host.appendChild(panel);

  const factionsEl = panel.querySelector('.pg-factions') as HTMLDivElement;
  factionsEl.innerHTML = FACTION_IDS.map((faction) => renderFaction(faction)).join('');

  panel.querySelectorAll<HTMLButtonElement>('[data-spawn]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [faction, kind, count] = btn.dataset['spawn']!.split(':') as [FactionId, UnitKind, string];
      spawn(faction, kind, Number(count));
    });
  });

  panel.querySelector<HTMLButtonElement>('#pg-clear')!.addEventListener('click', clear);

  let drawer: HTMLDivElement | null = null;
  const devButton = panel.querySelector<HTMLButtonElement>('#pg-dev')!;
  if (!import.meta.env.DEV) {
    devButton.disabled = true;
  }
  devButton.addEventListener('click', () => {
    if (!import.meta.env.DEV) return;
    if (drawer) {
      drawer.remove();
      drawer = null;
      panel.classList.remove('with-inspector');
      return;
    }
    drawer = document.createElement('div');
    drawer.className = 'playground-inspector';
    drawer.innerHTML = `
      <div class="pg-inspector-top">
        <strong>Config Inspector</strong>
        <button class="pg-btn" id="pg-close-dev">Close</button>
      </div>
      <iframe src="/_utils/inspector/" title="Config Inspector"></iframe>
    `;
    host.appendChild(drawer);
    panel.classList.add('with-inspector');
    drawer.querySelector<HTMLButtonElement>('#pg-close-dev')!.addEventListener('click', () => {
      drawer?.remove();
      drawer = null;
      panel.classList.remove('with-inspector');
    });
  });

  return {
    destroy(): void {
      drawer?.remove();
      panel.remove();
    },
  };
}

function renderFaction(faction: FactionId): string {
  const meta = FACTIONS[faction];
  const color = FACTION_COLORS[faction];
  const kinds = uniqueKinds([
    meta.workerKind,
    meta.infantryKind,
    meta.extraBarracksUnit,
    meta.tankKind,
    meta.specialKind,
  ]);
  return `
    <section class="pg-faction" style="--pg-accent:${color.accentCss}; --pg-primary:${color.primaryCss}">
      <h3>${meta.displayName}</h3>
      <div class="pg-unit-list">
        ${kinds.map((kind) => renderUnitRow(faction, kind)).join('')}
      </div>
    </section>
  `;
}

function renderUnitRow(faction: FactionId, kind: UnitKind): string {
  const stats = UNIT_STATS[kind];
  return `
    <div class="pg-unit">
      <span>
        <b>${stats.displayName}</b>
        <small>${stats.role} · ${stats.armor}${stats.weapon ? ` · ${stats.weapon.behavior ?? 'projectile'}` : ''}</small>
      </span>
      <button class="pg-mini" data-spawn="${faction}:${kind}:1">+1</button>
      <button class="pg-mini" data-spawn="${faction}:${kind}:5">+5</button>
    </div>
  `;
}

function uniqueKinds(kinds: Array<UnitKind | undefined>): UnitKind[] {
  const out: UnitKind[] = [];
  for (const kind of kinds) {
    if (!kind) continue;
    if (!out.includes(kind)) out.push(kind);
  }
  return out;
}
