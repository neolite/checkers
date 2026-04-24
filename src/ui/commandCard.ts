import type { World } from '@engine/world';
import { FACTIONS } from '@config/factions';
import { BUILDING_STATS, type BuildingKind } from '@config/buildings';
import type { Role } from '@config/gameplay';
import { UNIT_STATS, type UnitKind } from '@config/units';
import { icon, type IconName } from '@ui/icons';

interface CommandContext {
  world: World;
}

interface CommandCell {
  icon: IconName;
  label: string;
  cost?: number;
  hint?: string;
  disabled?: boolean;
  progress?: number; // 0..1 progress bar (production queue in flight)
  badge?: string; // e.g. "×3" queue counter
  onClick: () => void;
}

export interface CommandCardHandle {
  tick(): void;
  destroy(): void;
}

export function mountCommandCard(world: World): CommandCardHandle {
  const host = document.querySelector('#command-card') as HTMLDivElement;
  const info = document.querySelector('#selection-info') as HTMLDivElement;
  const ctx: CommandContext = { world };

  function render(): void {
    const cells: CommandCell[] = buildCells(ctx);
    host.innerHTML = '';
    for (const c of cells) {
      const div = document.createElement('div');
      div.className = 'cmd-cell';
      if (c.disabled) div.classList.add('disabled');
      const progressPart = c.progress !== undefined
        ? `<div class="progress" style="transform: scaleY(${Math.max(0, Math.min(1, c.progress))})"></div>`
        : '';
      const badge = c.badge ? `<span class="badge">${escapeHtml(c.badge)}</span>` : '';
      const hint = c.hint ? ` title="${escapeHtml(c.label)} — ${escapeHtml(c.hint)}"` : ` title="${escapeHtml(c.label)}"`;
      div.innerHTML = `
        ${progressPart}
        <span class="label">${escapeHtml(c.label)}</span>
        ${icon(c.icon)}
        ${c.cost !== undefined ? `<span class="cost">${c.cost}</span>` : ''}
        ${badge}
      `;
      div.setAttribute('title', c.hint ? `${c.label} — ${c.hint}` : c.label);
      void hint;
      div.addEventListener('click', () => { if (!c.disabled) c.onClick(); });
      host.appendChild(div);
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
          <div class="meta">HP ${Math.ceil(b.hp)} / ${b.stats.maxHp}${
            b.stats.weapon ? ` · rng ${b.stats.weapon.range}` : ''
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
          <div class="meta">HP ${Math.ceil(u.hp)} / ${u.stats.maxHp} · state: ${u.state}${
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
        const inQueue = b.productionQueue.filter((r) => r === role).length;
        const active = b.productionQueue[0] === role && b.productionMsLeft > 0;
        const totalMs = Math.round(stats.buildMs * meta.mods.costMul);
        const cell: CommandCell = {
          icon: roleIcon(role),
          label: stats.displayName,
          cost,
          disabled: w.factions[w.playerFaction].credits < cost || b.productionQueue.length >= 5,
          onClick: () => w.bus.emit('input:trainUnit', { buildingId: b.id, role, kindKey: null }),
        };
        if (active) cell.progress = 1 - (b.productionMsLeft / Math.max(1, totalMs));
        if (inQueue > 1) cell.badge = `×${inQueue}`;
        cells.push(cell);
      }
      // Extra units on this building.
      if (b.kind === 'barracks' && meta.extraBarracksUnit) {
        const stats = UNIT_STATS[meta.extraBarracksUnit];
        const cost = Math.round(stats.cost * meta.mods.costMul);
        cells.push({
          icon: stats.role === 'drone' ? 'drone' : 'infantry',
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
          icon: 'tank',
          label: stats.displayName,
          cost,
          disabled: w.factions[w.playerFaction].credits < cost || b.productionQueue.length >= 5,
          onClick: () => w.bus.emit('input:trainUnit', { buildingId: b.id, role: 'tank', kindKey: meta.extraFactoryUnit! }),
        });
      }
      // Rally marker toggle — visual hint that RMB on ground sets rally.
      cells.push({
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
      // Standard movement/combat commands for any selection of player units.
      cells.push({
        icon: 'move', label: 'Move',
        hint: 'RMB on ground',
        onClick: () => { /* move is RMB-driven; the button just showcases the binding */ },
      });
      cells.push({
        icon: 'attack', label: 'Attack',
        hint: 'RMB on enemy · Ctrl+RMB = A-move',
        onClick: () => { /* idem */ },
      });
      cells.push({
        icon: 'stop', label: 'Stop',
        hint: 'X',
        onClick: () => w.bus.emit('input:commandStop', {}),
      });
      cells.push({
        icon: 'special', label: 'Hold',
        hint: 'H',
        onClick: () => w.bus.emit('input:commandHold', {}),
      });
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

function buildingIcon(kind: BuildingKind): IconName {
  return kind;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
