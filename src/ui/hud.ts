import type { World } from '@engine/world';
import { FACTION_COLORS } from '@config/palette';
import { FACTIONS } from '@config/factions';
import type { CameraSystem } from '@systems/camera';
import { WORLD } from '@config/gameplay';
import { UNIT_STATS, type UnitKind } from '@config/units';
import { icon, type IconName } from '@ui/icons';
import type { Role } from '@config/gameplay';
import type { BuildingKind } from '@config/buildings';

export interface HudHandle {
  tick(): void;
  destroy(): void;
}

export function createHud(host: HTMLElement, world: World, camera: CameraSystem): HudHandle {
  const layer = document.createElement('div');
  layer.className = 'overlay';
  layer.innerHTML = `
    <div class="hud-top">
      <div class="hud-resources">
        <div class="metric">
          <span class="label">Credits</span>
          <span class="value" id="m-credits">0</span>
        </div>
        <div class="metric">
          <span class="label">Power</span>
          <span class="value" id="m-power">0</span>
        </div>
        <div class="metric">
          <span class="label">Units</span>
          <span class="value" id="m-units">0 / 0</span>
        </div>
        <div class="metric">
          <span class="label">Faction</span>
          <span class="value" id="m-faction">—</span>
        </div>
      </div>
      <div class="hud-minimap">
        <canvas id="minimap" width="160" height="160"></canvas>
      </div>
    </div>
    <div class="hud-bottom">
      <div class="selection-info" id="selection-info">
        <h4>No selection</h4>
        <div class="meta">Drag to select units, click buildings to build units.</div>
      </div>
      <div class="hud-middle" id="hud-middle">
        <div class="mid-section" id="construction-section" style="display:none">
          <div class="mid-title">Under construction</div>
          <div class="tile-row" id="construction-row"></div>
        </div>
        <div class="mid-section" id="queue-section" style="display:none">
          <div class="mid-title">Production queue</div>
          <div class="tile-row" id="queue-row"></div>
        </div>
        <div class="mid-section" id="avatar-section" style="display:none">
          <div class="mid-title">Selected</div>
          <div class="tile-row" id="avatar-row"></div>
        </div>
        <div class="empty" id="mid-empty">Select units or a building to see details here.</div>
      </div>
      <div class="command-card" id="command-card"></div>
    </div>
    <div class="float-layer" id="float-layer"></div>
  `;
  host.appendChild(layer);

  const credits = layer.querySelector('#m-credits') as HTMLSpanElement;
  const power = layer.querySelector('#m-power') as HTMLSpanElement;
  const unitsLbl = layer.querySelector('#m-units') as HTMLSpanElement;
  const factionLbl = layer.querySelector('#m-faction') as HTMLSpanElement;
  const minimap = layer.querySelector('#minimap') as HTMLCanvasElement;
  const minimapCtx = minimap.getContext('2d')!;
  // Click / drag-pan on minimap.
  const minimapPan = (ev: MouseEvent): void => {
    const rect = minimap.getBoundingClientRect();
    const nx = (ev.clientX - rect.left) / rect.width;
    const ny = (ev.clientY - rect.top) / rect.height;
    if (nx < 0 || ny < 0 || nx > 1 || ny > 1) return;
    camera.centerOn(nx * WORLD.width, ny * WORLD.depth);
  };
  minimap.addEventListener('mousedown', (ev) => {
    ev.preventDefault();
    minimapPan(ev);
    const onMove = (e: MouseEvent) => minimapPan(e);
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
  minimap.style.cursor = 'crosshair';

  const faction = FACTIONS[world.playerFaction];
  factionLbl.textContent = faction.displayName;
  factionLbl.style.color = FACTION_COLORS[world.playerFaction].primaryCss;

  const queueSection = layer.querySelector('#queue-section') as HTMLDivElement;
  const queueRow = layer.querySelector('#queue-row') as HTMLDivElement;
  const avatarSection = layer.querySelector('#avatar-section') as HTMLDivElement;
  const avatarRow = layer.querySelector('#avatar-row') as HTMLDivElement;
  const constructionSection = layer.querySelector('#construction-section') as HTMLDivElement;
  const constructionRow = layer.querySelector('#construction-row') as HTMLDivElement;
  const midEmpty = layer.querySelector('#mid-empty') as HTMLDivElement;

  function tick(): void {
    const fs = world.factions[world.playerFaction];
    credits.textContent = Math.floor(fs.credits).toString();
    const net = fs.powerProduced - fs.powerConsumed;
    power.textContent = `${fs.powerProduced} / ${fs.powerConsumed}`;
    if (net < 0) power.classList.add('low');
    else power.classList.remove('low');

    let alive = 0;
    world.units.forEachAlive((u) => { if (u.faction === world.playerFaction) alive++; });
    unitsLbl.textContent = `${alive} / ${world.units.capacity}`;

    drawMinimap(minimapCtx, minimap, world);
    renderMidPanel(world, queueSection, queueRow, avatarSection, avatarRow, constructionSection, constructionRow, midEmpty);
  }

  return {
    tick,
    destroy() {
      if (layer.parentElement) layer.parentElement.removeChild(layer);
    },
  };
}

function drawMinimap(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, world: World): void {
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  // Terrain
  ctx.fillStyle = '#1a2330';
  ctx.fillRect(0, 0, w, h);

  const scaleX = w / (world.navGrid.w * (window as unknown as { _tileSize?: number })._tileSize! || 1);
  // simpler: project world space
  const worldW = world.navGrid.w * 2; // MAP.tileSize=2
  const worldH = world.navGrid.h * 2;
  const sx = w / worldW;
  const sy = h / worldH;

  // Fog: paint explored area slightly lighter.
  const fog = world.factions[world.playerFaction].fog;
  const tileW = world.navGrid.w;
  const tileH = world.navGrid.h;
  const cellW = w / tileW;
  const cellH = h / tileH;
  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      const v = fog[ty * tileW + tx]!;
      if (v === 2) ctx.fillStyle = '#2c3a4c';
      else if (v === 1) ctx.fillStyle = '#232b38';
      else ctx.fillStyle = '#11161f';
      ctx.fillRect(tx * cellW, ty * cellH, cellW + 0.5, cellH + 0.5);
    }
  }

  // Draw buildings.
  world.buildings.forEachAlive((b) => {
    const visible = b.faction === world.playerFaction || isVisible(fog, b.x, b.y, tileW, tileH);
    if (!visible) return;
    const c = FACTION_COLORS[b.faction].primaryCss;
    ctx.fillStyle = c;
    ctx.fillRect(b.x * sx - 2, b.y * sy - 2, 4, 4);
  });
  // Draw units.
  world.units.forEachAlive((u) => {
    const visible = u.faction === world.playerFaction || isVisible(fog, u.x, u.y, tileW, tileH) === 2;
    if (!visible) return;
    ctx.fillStyle = FACTION_COLORS[u.faction].accentCss;
    ctx.fillRect(u.x * sx - 1, u.y * sy - 1, 2, 2);
  });

  // Camera viewport rectangle.
  const cam = world.three.camera;
  if (cam) {
    const cx = cam.position.x;
    const cy = cam.position.z;
    const view = 36;
    ctx.strokeStyle = 'rgba(255,255,255,0.45)';
    ctx.strokeRect((cx - view / 2) * sx, (cy - view / 2) * sy, view * sx, view * sy);
  }
  void scaleX;
}

function isVisible(fog: Uint8Array, wx: number, wy: number, tileW: number, tileH: number): 0 | 1 | 2 {
  const tx = Math.floor(wx / 2);
  const ty = Math.floor(wy / 2);
  if (tx < 0 || ty < 0 || tx >= tileW || ty >= tileH) return 0;
  return fog[ty * tileW + tx]! as 0 | 1 | 2;
}

// ----- mid-panel, diff-friendly rendering -----
// Goal: rebuild DOM only when the ROW IDENTITY changes; otherwise just update
// progress / counts / HP. This keeps :hover stable and the browser paint cheap.

interface RowCache {
  keys: string;
  tiles: Map<string, HTMLDivElement>;
}
const midCache: {
  construction?: RowCache;
  queue?: RowCache;
  avatar?: RowCache;
} = {};

function ensureRow(row: HTMLDivElement, cache: RowCache | undefined, keys: string): RowCache {
  if (cache && cache.keys === keys) return cache;
  row.innerHTML = '';
  return { keys, tiles: new Map() };
}

function renderMidPanel(
  world: World,
  queueSection: HTMLDivElement,
  queueRow: HTMLDivElement,
  avatarSection: HTMLDivElement,
  avatarRow: HTMLDivElement,
  constructionSection: HTMLDivElement,
  constructionRow: HTMLDivElement,
  midEmpty: HTMLDivElement,
): void {
  let anything = false;

  // ---- Under-construction own buildings ----
  const constructing: Array<{ id: number; kind: BuildingKind; pct: number; label: string }> = [];
  world.buildings.forEachAlive((b) => {
    if (b.faction !== world.playerFaction) return;
    if (b.completed) return;
    const pct = 1 - b.buildMsLeft / Math.max(1, b.stats.buildMs);
    constructing.push({ id: b.id, kind: b.kind, pct, label: b.stats.displayName });
  });
  constructing.sort((a, b) => a.id - b.id);
  if (constructing.length > 0) {
    const keys = constructing.map((c) => `${c.id}:${c.kind}`).join('|');
    const cache = ensureRow(constructionRow, midCache.construction, keys);
    for (const c of constructing) {
      const key = `${c.id}:${c.kind}`;
      let el = cache.tiles.get(key);
      if (!el) {
        el = document.createElement('div');
        el.className = 'q-tile active';
        el.innerHTML = `${icon(c.kind as IconName)}<div class="q-progress-track"><div class="q-progress-fill"></div></div>`;
        el.title = c.label;
        el.addEventListener('click', () => {
          // Pan camera to this building.
          const b = world.buildings.findById(c.id);
          if (b && world.three.camera) {
            const cam = world.three.camera;
            cam.position.x = b.x;
            cam.position.z = b.y + 30;
          }
        });
        constructionRow.appendChild(el);
        cache.tiles.set(key, el);
      }
      const fill = el.querySelector('.q-progress-fill') as HTMLDivElement | null;
      if (fill) fill.style.width = `${Math.max(0, Math.min(1, c.pct)) * 100}%`;
      el.title = `${c.label} — ${Math.round(c.pct * 100)}%`;
    }
    midCache.construction = cache;
    constructionSection.style.display = '';
    anything = true;
  } else {
    constructionSection.style.display = 'none';
    delete midCache.construction;
  }

  // ---- Production queue (first selected building) ----
  let queueEmpty = true;
  if (world.selectedBuildings.size > 0) {
    const id = [...world.selectedBuildings][0]!;
    const b = world.buildings.findById(id);
    if (b && b.completed && b.productionQueue.length > 0) {
      const meta = FACTIONS[b.faction];
      const items = b.productionQueue.map((order, idx) => ({ ...order, idx }));
      const keys = items.map((x) => `${x.idx}:${x.kind}`).join('|') + `|b:${b.id}`;
      const cache = ensureRow(queueRow, midCache.queue, keys);
      for (const it of items) {
        const key = `${it.idx}:${it.kind}`;
        let el = cache.tiles.get(key);
        if (!el) {
          el = document.createElement('div');
          el.className = `q-tile${it.idx === 0 ? ' active' : ''}`;
          el.innerHTML = `
            <span class="q-index">${it.idx + 1}</span>
            ${icon(roleIcon(it.role))}
            <div class="q-progress-track"><div class="q-progress-fill"></div></div>
          `;
          queueRow.appendChild(el);
          cache.tiles.set(key, el);
        }
        // Only the head of the queue shows live progress; the rest keep an empty track.
        const fill = el.querySelector('.q-progress-fill') as HTMLDivElement | null;
        if (fill) {
          if (it.idx === 0) {
            const stats = UNIT_STATS[it.kind!];
            const total = Math.max(1, Math.round(stats.buildMs * meta.mods.costMul));
            const ratio = 1 - b.productionMsLeft / total;
            fill.style.width = `${Math.max(0, Math.min(1, ratio)) * 100}%`;
          } else {
            fill.style.width = '0%';
          }
        }
      }
      midCache.queue = cache;
      queueSection.style.display = '';
      anything = true;
      queueEmpty = false;
    }
  }
  if (queueEmpty) {
    queueSection.style.display = 'none';
    delete midCache.queue;
  }

  // ---- Avatars of selected units, grouped by kind ----
  if (world.selectedUnits.size > 0) {
    type Bucket = { kind: UnitKind; ids: number[]; hpSum: number; hpMaxSum: number };
    const buckets = new Map<UnitKind, Bucket>();
    for (const id of world.selectedUnits) {
      const u = world.units.findById(id);
      if (!u) continue;
      let bk = buckets.get(u.kind);
      if (!bk) { bk = { kind: u.kind, ids: [], hpSum: 0, hpMaxSum: 0 }; buckets.set(u.kind, bk); }
      bk.ids.push(u.id);
      bk.hpSum += u.hp;
      bk.hpMaxSum += u.stats.maxHp;
    }
    if (buckets.size > 0) {
      const keys = [...buckets.values()].map((b) => `${b.kind}:${b.ids.length}`).join('|');
      const cache = ensureRow(avatarRow, midCache.avatar, keys);
      for (const bk of buckets.values()) {
        const key = bk.kind;
        let el = cache.tiles.get(key);
        const stats = UNIT_STATS[bk.kind];
        if (!el) {
          el = document.createElement('div');
          el.className = 'avatar-tile';
          el.innerHTML = `
            ${icon(roleIcon(stats.role))}
            ${bk.ids.length > 1 ? `<span class="a-count">×${bk.ids.length}</span>` : ''}
            <div class="hp-mini"><div class="fill"></div></div>
          `;
          // Click: re-select only this kind.
          const bucket = bk;
          el.addEventListener('click', (ev) => {
            const additive = (ev as MouseEvent).shiftKey;
            world.bus.emit('input:select', { ids: bucket.ids, additive });
          });
          avatarRow.appendChild(el);
          cache.tiles.set(key, el);
        }
        // Live HP + count.
        const pct = bk.hpSum / Math.max(1, bk.hpMaxSum);
        const hpColor = pct > 0.5 ? '#7ef5b3' : pct > 0.25 ? '#ffd863' : '#ff6e6e';
        const fill = el.querySelector('.hp-mini .fill') as HTMLDivElement | null;
        if (fill) {
          fill.style.width = `${(pct * 100).toFixed(0)}%`;
          fill.style.background = hpColor;
        }
        el.title = `${stats.displayName} — ${bk.ids.length} · HP ${Math.round(bk.hpSum)}/${bk.hpMaxSum}`;
      }
      midCache.avatar = cache;
      avatarSection.style.display = '';
      anything = true;
    } else {
      avatarSection.style.display = 'none';
      delete midCache.avatar;
    }
  } else {
    avatarSection.style.display = 'none';
    delete midCache.avatar;
  }

  midEmpty.style.display = anything ? 'none' : '';
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
