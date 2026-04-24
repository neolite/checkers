import type { World } from '@engine/world';
import { FACTIONS } from '@config/factions';
import { BUILDING_STATS, type BuildingKind } from '@config/buildings';
import type { Role } from '@config/gameplay';
import { UNIT_STATS, type UnitKind } from '@config/units';
import { icon, type IconName } from '@ui/icons';
import type { ArmorClass, WeaponClass } from '@config/gameplay';

interface CommandContext {
  world: World;
}

interface CommandCell {
  key: string;        // stable identity so we can diff across refreshes
  icon: IconName;
  label: string;
  cost?: number;
  hint?: string;
  disabled?: boolean;
  badge?: string;     // e.g. "×3" queue counter
  onClick: () => void;
}

interface MountedCell {
  spec: CommandCell;
  el: HTMLDivElement;
  progressEl: HTMLDivElement | null;
  badgeEl: HTMLSpanElement | null;
}

export interface CommandCardHandle {
  tick(): void;
  destroy(): void;
}

// Two-layer render pattern:
//  - rebuild(): structural render; called when the command list changes (selection
//    changed, a prereq became available, a cell appeared/disappeared). Tears
//    the DOM and rebuilds. Relatively rare.
//  - refresh(): fast path; called at ~10 Hz so progress bars slide smoothly.
//    Touches only .progress scaleY, .badge text, .disabled class on existing
//    cells. Keeps the cursor's :hover target intact — no flicker.
export function mountCommandCard(world: World): CommandCardHandle {
  const host = document.querySelector('#command-card') as HTMLDivElement;
  const info = document.querySelector('#selection-info') as HTMLDivElement;
  const ctx: CommandContext = { world };

  let mounted: Map<string, MountedCell> = new Map();
  let lastKeys = '';

  function rebuild(specs: CommandCell[]): void {
    host.innerHTML = '';
    mounted = new Map();
    for (const c of specs) {
      const div = document.createElement('div');
      div.className = 'cmd-cell';
      if (c.disabled) div.classList.add('disabled');
      const badgePart = c.badge ? `<span class="badge">${escapeHtml(c.badge)}</span>` : '';
      div.innerHTML = `
        <span class="label">${escapeHtml(c.label)}</span>
        ${icon(c.icon)}
        ${c.cost !== undefined ? `<span class="cost">${c.cost}</span>` : ''}
        ${badgePart}
      `;
      div.setAttribute('title', c.hint ? `${c.label} — ${c.hint}` : c.label);
      div.addEventListener('click', () => { if (!mounted.get(c.key)?.spec.disabled) c.onClick(); });
      host.appendChild(div);
      mounted.set(c.key, {
        spec: c,
        el: div,
        progressEl: null, // progress is shown in the bottom panel instead, not on the button
        badgeEl: div.querySelector('.badge'),
      });
    }
  }

  function refreshExisting(specs: CommandCell[]): void {
    for (const c of specs) {
      const m = mounted.get(c.key);
      if (!m) continue;
      m.spec = c;
      // disabled state
      if (c.disabled) m.el.classList.add('disabled');
      else m.el.classList.remove('disabled');
      // badge
      if (c.badge) {
        if (!m.badgeEl) {
          const b = document.createElement('span');
          b.className = 'badge';
          m.el.appendChild(b);
          m.badgeEl = b;
        }
        m.badgeEl.textContent = c.badge;
      } else if (m.badgeEl) {
        m.badgeEl.remove();
        m.badgeEl = null;
      }
    }
  }

  function render(): void {
    const cells = buildCells(ctx);
    const keys = cells.map((c) => c.key).join('|');
    if (keys !== lastKeys) {
      lastKeys = keys;
      rebuild(cells);
    } else {
      refreshExisting(cells);
    }
    renderInfo();
  }

  function renderInfo(): void {
    const w = ctx.world;
    if (w.selectedBuildings.size > 0) {
      const id = [...w.selectedBuildings][0]!;
      const b = w.buildings.findById(id);
      if (b) {
        info.innerHTML = `
          <h4>${escapeHtml(b.stats.displayName)}${b.completed ? '' : ' (building…)'}</h4>
          <div class="meta">HP ${Math.ceil(b.hp)} / ${b.stats.maxHp} · armor: ${armorLabel(b.stats.armor)}${
            b.stats.weapon ? ` · wpn: ${weaponLabel(b.stats.weapon.klass)} · rng ${b.stats.weapon.range}` : ''
          }${b.productionQueue.length > 0 ? ` · queue ${b.productionQueue.length}` : ''}</div>
        `;
        return;
      }
    }
    if (w.selectedUnits.size > 0) {
      const list = [...w.selectedUnits].map((id) => w.units.findById(id)).filter((u) => u);
      if (list.length === 1) {
        const u = list[0]!;
        info.innerHTML = `
          <h4>${escapeHtml(u.stats.displayName)}</h4>
          <div class="meta">HP ${Math.ceil(u.hp)} / ${u.stats.maxHp} · armor: ${armorLabel(u.stats.armor)}${
            u.stats.weapon ? ` · wpn: ${weaponLabel(u.stats.weapon.klass)} · rng ${u.stats.weapon.range}${(u.stats.weapon.splash ?? 0) > 0 ? ` · splash ${u.stats.weapon.splash}` : ''}` : ''
          } · state: ${u.state}${
            u.cargo > 0 ? ` · cargo ${u.cargo}` : ''
          }</div>
        `;
      } else {
        const tally: Record<string, number> = {};
        for (const u of list) tally[u!.stats.displayName] = (tally[u!.stats.displayName] ?? 0) + 1;
        const parts = Object.keys(tally).map((k) => `${tally[k]}× ${k}`);
        info.innerHTML = `
          <h4>${list.length} units selected</h4>
          <div class="meta">${escapeHtml(parts.join(' · '))}</div>
        `;
      }
      return;
    }
    info.innerHTML = `
      <h4>No selection</h4>
      <div class="meta">Drag to select units, click buildings to build units.</div>
    `;
  }

  function buildCells(ctx: CommandContext): CommandCell[] {
    const w = ctx.world;
    const cells: CommandCell[] = [];

    if (w.selectedBuildings.size > 0) {
      const id = [...w.selectedBuildings][0]!;
      const b = w.buildings.findById(id);
      if (!b || !b.completed) return [];
      const meta = FACTIONS[w.playerFaction];
      // Trains.
      for (const role of b.stats.trains ?? []) {
        const kind = resolveKind(role, meta);
        if (!kind) continue;
        const stats = UNIT_STATS[kind];
        const cost = Math.round(stats.cost * meta.mods.costMul);
        const inQueue = b.productionQueue.filter((q) => q.role === role && q.kind === kind).length;
        const cell: CommandCell = {
          key: `train:${role}`,
          icon: roleIcon(role),
          label: stats.displayName,
          cost,
          disabled: w.factions[w.playerFaction].credits < cost || b.productionQueue.length >= 5,
          onClick: () => w.bus.emit('input:trainUnit', { buildingId: b.id, role, kindKey: null }),
        };
        if (inQueue > 0) cell.badge = `×${inQueue}`;
        cells.push(cell);
      }
      // Extra units on this building.
      if (b.kind === 'barracks' && meta.extraBarracksUnit) {
        const stats = UNIT_STATS[meta.extraBarracksUnit];
        const cost = Math.round(stats.cost * meta.mods.costMul);
        cells.push({
          key: `extra:barracks:${meta.extraBarracksUnit}`,
          icon: unitIcon(meta.extraBarracksUnit, stats.role),
          label: stats.displayName,
          cost,
          disabled: w.factions[w.playerFaction].credits < cost || b.productionQueue.length >= 5,
          onClick: () => w.bus.emit('input:trainUnit', { buildingId: b.id, role: stats.role, kindKey: meta.extraBarracksUnit! }),
        });
      }
      if (b.kind === 'factory' && meta.extraFactoryUnit) {
        const stats = UNIT_STATS[meta.extraFactoryUnit];
        const cost = Math.round(stats.cost * meta.mods.costMul);
        cells.push({
          key: `extra:factory:${meta.extraFactoryUnit}`,
          icon: 'tank',
          label: stats.displayName,
          cost,
          disabled: w.factions[w.playerFaction].credits < cost || b.productionQueue.length >= 5,
          onClick: () => w.bus.emit('input:trainUnit', { buildingId: b.id, role: 'tank', kindKey: meta.extraFactoryUnit! }),
        });
      }
      // Rally marker toggle — visual hint that RMB on ground sets rally.
      cells.push({
        key: 'rally',
        icon: 'move',
        label: b.rallyX !== null ? 'Rally set' : 'Set rally',
        hint: 'RMB on ground',
        onClick: () => {
          // Clicking the cell without a target clears rally.
          b.rallyX = null;
          b.rallyY = null;
        },
      });
      return cells;
    }

    // Selected unit(s) — show build options for workers, else unit commands.
    const selectedUnits = [...w.selectedUnits].map((id) => w.units.findById(id)).filter((u) => u !== null);
    const hasWorker = selectedUnits.some((u) => u!.stats.role === 'worker');

    if (hasWorker) {
      const meta = FACTIONS[w.playerFaction];
      for (const kind of meta.availableBuildings) {
        if (kind === 'hq') continue;
        const stats = BUILDING_STATS[kind];
        if (stats.prereq && !hasCompleted(w, stats.prereq)) continue;
        const cost = Math.round(stats.cost * meta.mods.costMul);
        cells.push({
          key: `build:${kind}`,
          icon: buildingIcon(kind),
          label: stats.displayName,
          cost,
          disabled: w.factions[w.playerFaction].credits < cost,
          onClick: () => {
            w.bus.emit('input:cancelPlacement', {});
            w.bus.emit('input:startPlacement', { kind });
          },
        });
      }
    }

    if (selectedUnits.length > 0) {
      cells.push({ key: 'cmd:move', icon: 'move', label: 'Move', hint: 'RMB on ground',
                   onClick: () => {} });
      cells.push({ key: 'cmd:attack', icon: 'attack', label: 'Attack',
                   hint: 'RMB on enemy · Ctrl+RMB = A-move', onClick: () => {} });
      cells.push({ key: 'cmd:stop', icon: 'stop', label: 'Stop', hint: 'X',
                   onClick: () => w.bus.emit('input:commandStop', {}) });
      cells.push({ key: 'cmd:hold', icon: 'special', label: 'Hold', hint: 'H',
                   onClick: () => w.bus.emit('input:commandHold', {}) });
    }
    return cells;
  }

  render();

  return {
    tick: render,
    destroy() {
      host.innerHTML = '';
    },
  };
}

function resolveKind(role: Role, meta: ReturnType<typeof _faction>): UnitKind | null {
  switch (role) {
    case 'worker': return meta.workerKind;
    case 'infantry': return meta.infantryKind;
    case 'tank': return meta.tankKind;
    case 'special': return meta.specialKind;
    case 'drone': return null;
  }
  return null;
}
// helper type only
function _faction() { return FACTIONS.vanguard; }

function hasCompleted(w: World, kind: BuildingKind): boolean {
  let found = false;
  w.buildings.forEachAlive((b) => {
    if (b.faction === w.playerFaction && b.kind === kind && b.completed) found = true;
  });
  return found;
}

function roleIcon(role: Role): IconName {
  switch (role) {
    case 'worker': return 'worker';
    case 'infantry': return 'infantry';
    case 'tank': return 'tank';
    case 'special': return 'special';
    case 'drone': return 'drone';
  }
}

function unitIcon(kind: UnitKind, role: Role): IconName {
  if (kind === 'atGrenadier') return 'atGrenadier';
  return roleIcon(role);
}

function buildingIcon(kind: BuildingKind): IconName {
  return kind;
}

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

// Short labels for the selection info panel. These surface the RPS matrix
// axes (armor on defender, weapon class on attacker) so the player can read
// matchups at a glance without opening a separate tooltip.
function armorLabel(a: ArmorClass): string {
  return ({ light: 'Light', medium: 'Medium', heavy: 'Heavy', structure: 'Structure' } as const)[a];
}

function weaponLabel(w: WeaponClass): string {
  // AP = anti-personnel, AT = anti-tank, Siege = structure/demolition
  return ({ aInfantry: 'AP', aArmor: 'AT', aStructure: 'Siege' } as const)[w];
}
