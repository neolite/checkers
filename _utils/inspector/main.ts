import { buildSchema, type InspectorCategory, type InspectorField } from './schema';
import { UI_LAYOUT } from '../../src/config/uiLayout';
import * as Gameplay from '../../src/config/gameplay';
import { BUILDING_STATS } from '../../src/config/buildings';
import { UNIT_STATS } from '../../src/config/units';
import { DAMAGE_MATRIX } from '../../src/config/matrix';
import { FACTIONS } from '../../src/config/factions';
import * as Palette from '../../src/config/palette';
import { FX_TUNING } from '../../src/config/fx';
import './style.css';

type Roots = Record<string, unknown>;
type DirtyMap = Map<string, { before: unknown; value: unknown }>;

const patchChannel = new BroadcastChannel('patch');
const snapshotChannel = new BroadcastChannel('snapshot');
const rootEl = document.getElementById('inspector-root');
if (!rootEl) throw new Error('#inspector-root missing');

let roots: Roots = localSnapshot();
let baseRoots: Roots = clone(roots);
let schema: InspectorCategory[] = buildSchema(roots);
let activeCategory = 'Character';
let activeGroup = '';
let dirty: DirtyMap = new Map();
let selectedUiElement = 'resources';

snapshotChannel.addEventListener('message', (ev: MessageEvent<{ type: string; roots: Roots }>) => {
  if (ev.data?.type !== 'snapshot') return;
  roots = ev.data.roots;
  baseRoots = clone(ev.data.roots);
  schema = buildSchema(roots);
  render();
});

patchChannel.postMessage({ type: 'requestSnapshot' });
render();

function render(): void {
  const category = schema.find((x) => x.title === activeCategory) ?? schema[0]!;
  if (!category.groups.some((g) => g.title === activeGroup)) activeGroup = category.groups[0]?.title ?? '';
  rootEl.innerHTML = `
    <div class="shell">
      <aside class="sidebar"></aside>
      <main class="panel">
        <div class="toolbar">
          <div>
            <h1>Config Inspector</h1>
            <p>Live patch via BroadcastChannel. Save writes only dirty config paths.</p>
          </div>
          <div class="actions">
            <button id="revert-btn" ${dirty.size === 0 ? 'disabled' : ''}>Revert</button>
            <button id="save-btn" ${dirty.size === 0 ? 'disabled' : ''}>Save ${dirty.size ? `(${dirty.size})` : ''}</button>
          </div>
        </div>
        <div class="content"></div>
      </main>
    </div>
  `;
  renderSidebar(category);
  renderContent(category);
  rootEl.querySelector('#revert-btn')?.addEventListener('click', revertAll);
  rootEl.querySelector('#save-btn')?.addEventListener('click', saveDirty);
}

function renderSidebar(category: InspectorCategory): void {
  const sidebar = rootEl.querySelector('.sidebar')!;
  const items = [...schema.map((c) => c.title), 'UI Editor'];
  sidebar.innerHTML = items.map((item) => `<button class="nav ${item === activeCategory ? 'active' : ''}" data-cat="${item}">${item}</button>`).join('');
  sidebar.querySelectorAll<HTMLButtonElement>('.nav').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeCategory = btn.dataset['cat']!;
      activeGroup = '';
      render();
    });
  });
  if (activeCategory !== 'UI Editor') {
    const sub = document.createElement('div');
    sub.className = 'subnav';
    sub.innerHTML = category.groups.map((g) => `<button class="${g.title === activeGroup ? 'active' : ''}" data-group="${g.title}">${g.title}</button>`).join('');
    sub.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeGroup = btn.dataset['group']!;
        render();
      });
    });
    sidebar.appendChild(sub);
  }
}

function renderContent(category: InspectorCategory): void {
  const content = rootEl.querySelector('.content')!;
  if (activeCategory === 'UI Editor') {
    renderUiEditor(content);
    return;
  }
  const group = category.groups.find((g) => g.title === activeGroup) ?? category.groups[0];
  if (!group) {
    content.innerHTML = '<div class="empty">No fields.</div>';
    return;
  }
  content.innerHTML = `<h2>${category.title} / ${group.title}</h2><div class="fields"></div>`;
  const fieldsEl = content.querySelector('.fields')!;
  for (const field of group.fields) {
    const current = getPath(roots, field.path);
    if (current === undefined) continue;
    fieldsEl.appendChild(renderField(field, current));
  }
}

function renderField(field: InspectorField, value: unknown): HTMLElement {
  const wrap = document.createElement('label');
  wrap.className = `field ${dirty.has(field.path) ? 'dirty' : ''}`;
  wrap.innerHTML = `<span class="field-label">${field.label}</span>${field.hint ? `<span class="hint">${field.hint}</span>` : ''}`;
  const input = document.createElement('input');
  input.dataset['path'] = field.path;
  if (field.kind === 'number') {
    input.type = 'range';
    input.min = String(field.min ?? 0);
    input.max = String(field.max ?? 100);
    input.step = String(field.step ?? 1);
    input.value = String(Number(value));
    const numberInput = document.createElement('input');
    numberInput.type = 'number';
    numberInput.min = input.min;
    numberInput.max = input.max;
    numberInput.step = input.step;
    numberInput.value = input.value;
    input.addEventListener('input', () => { numberInput.value = input.value; setValue(field.path, Number(input.value)); });
    numberInput.addEventListener('change', () => { input.value = numberInput.value; setValue(field.path, Number(numberInput.value)); });
    wrap.append(input, numberInput);
  } else if (field.kind === 'bool') {
    input.type = 'checkbox';
    input.checked = Boolean(value);
    input.addEventListener('change', () => setValue(field.path, input.checked));
    wrap.appendChild(input);
  } else if (field.kind === 'color') {
    input.type = 'color';
    input.value = normalizeColor(value);
    input.addEventListener('input', () => {
      const nextValue = typeof value === 'number' ? Number.parseInt(input.value.slice(1), 16) : input.value;
      setValue(field.path, nextValue);
    });
    wrap.appendChild(input);
  } else {
    input.type = 'text';
    input.value = String(value);
    input.addEventListener('change', () => setValue(field.path, input.value));
    wrap.appendChild(input);
  }
  return wrap;
}

function renderUiEditor(content: Element): void {
  const elements = getPath(roots, 'UI_LAYOUT.elements') as Record<string, { anchor: string; x: number; y: number; width: number; height: number }> | undefined;
  if (!elements) {
    content.innerHTML = '<div class="empty">UI_LAYOUT.elements missing.</div>';
    return;
  }
  if (!elements[selectedUiElement]) selectedUiElement = Object.keys(elements)[0]!;
  const selected = elements[selectedUiElement]!;
  content.innerHTML = `
    <h2>UI Editor</h2>
    <div class="ui-editor">
      <svg id="canvas" viewBox="0 0 1280 720"></svg>
      <div class="ui-props">
        <select id="ui-element">${Object.keys(elements).map((k) => `<option ${k === selectedUiElement ? 'selected' : ''}>${k}</option>`).join('')}</select>
        <div class="anchor-grid"></div>
        <div class="fields"></div>
      </div>
    </div>
  `;
  const svg = content.querySelector<SVGSVGElement>('#canvas')!;
  svg.innerHTML = Object.entries(elements).map(([name, el]) => {
    const box = toScreenBox(el);
    return `<rect data-el="${name}" class="ui-box ${name === selectedUiElement ? 'selected' : ''}" x="${box.x}" y="${box.y}" width="${el.width}" height="${el.height}" rx="6" />
      <text x="${box.x + 8}" y="${box.y + 18}">${name}</text>
      ${name === selectedUiElement ? `<rect data-resize="${name}" class="resize" x="${box.x + el.width - 10}" y="${box.y + el.height - 10}" width="10" height="10" />` : ''}`;
  }).join('');
  svg.querySelectorAll<SVGRectElement>('.ui-box').forEach((rect) => {
    rect.addEventListener('pointerdown', (e) => startDrag(e, rect.dataset['el']!, false));
  });
  svg.querySelectorAll<SVGRectElement>('.resize').forEach((rect) => {
    rect.addEventListener('pointerdown', (e) => startDrag(e, rect.dataset['resize']!, true));
  });

  content.querySelector<HTMLSelectElement>('#ui-element')!.addEventListener('change', (e) => {
    selectedUiElement = (e.target as HTMLSelectElement).value;
    render();
  });

  const anchors = ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right'];
  const grid = content.querySelector('.anchor-grid')!;
  grid.innerHTML = anchors.map((a) => `<button class="${a === selected.anchor ? 'active' : ''}" data-anchor="${a}">${a.replace(/.*-/, '')}</button>`).join('');
  grid.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    btn.addEventListener('click', () => setValue(`UI_LAYOUT.elements.${selectedUiElement}.anchor`, btn.dataset['anchor']!));
  });

  const fields = content.querySelector('.ui-props .fields')!;
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    fields.appendChild(renderField({ path: `UI_LAYOUT.elements.${selectedUiElement}.${key}`, label: key, kind: 'number', min: key === 'width' || key === 'height' ? 10 : -640, max: 1280, step: 1 }, selected[key]));
  }
}

function startDrag(ev: PointerEvent, name: string, resize: boolean): void {
  selectedUiElement = name;
  const start = pointer(ev);
  const el = (getPath(roots, `UI_LAYOUT.elements.${name}`) as Record<string, number | string>);
  const startX = Number(el['x']);
  const startY = Number(el['y']);
  const startW = Number(el['width']);
  const startH = Number(el['height']);
  const onMove = (move: PointerEvent): void => {
    const p = pointer(move);
    const dx = Math.round(p.x - start.x);
    const dy = Math.round(p.y - start.y);
    if (resize) {
      setValue(`UI_LAYOUT.elements.${name}.width`, Math.max(10, startW + dx), false);
      setValue(`UI_LAYOUT.elements.${name}.height`, Math.max(10, startH + dy), false);
    } else {
      setValue(`UI_LAYOUT.elements.${name}.x`, startX + dx, false);
      setValue(`UI_LAYOUT.elements.${name}.y`, startY + dy, false);
    }
    render();
  };
  const onUp = (): void => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function setValue(path: string, value: unknown, rerender = true): void {
  const before = getPath(baseRoots, path);
  deepSet(roots, path, value);
  if (JSON.stringify(before) === JSON.stringify(value)) dirty.delete(path);
  else dirty.set(path, { before, value });
  patchChannel.postMessage({ type: 'patch', path, value });
  if (rerender) render();
}

async function saveDirty(): Promise<void> {
  const changes = [...dirty.entries()].map(([path, item]) => ({ path, value: item.value }));
  const res = await fetch('/_utils/save-config', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ changes }),
  });
  const payload = await res.json() as { ok: boolean; error?: string };
  if (!payload.ok) throw new Error(payload.error ?? 'Save failed');
  dirty = new Map();
  baseRoots = clone(roots);
  render();
}

function revertAll(): void {
  for (const [path, item] of dirty) {
    deepSet(roots, path, item.before);
    patchChannel.postMessage({ type: 'patch', path, value: item.before });
  }
  dirty.clear();
  render();
}

function localSnapshot(): Roots {
  return clone({
    MAP: Gameplay.MAP,
    WORLD: Gameplay.WORLD,
    SIM: Gameplay.SIM,
    CAMERA: Gameplay.CAMERA,
    FOG: Gameplay.FOG,
    ECONOMY: Gameplay.ECONOMY,
    VICTORY: Gameplay.VICTORY,
    AI_TUNING: Gameplay.AI_TUNING,
    UI: Gameplay.UI,
    BUILDING_STATS,
    UNIT_STATS,
    DAMAGE_MATRIX,
    FACTIONS,
    FACTION_COLORS: Palette.FACTION_COLORS,
    NEUTRAL_COLORS: Palette.NEUTRAL_COLORS,
    PLAYER_COLOR: Palette.PLAYER_COLOR,
    ENEMY_COLOR: Palette.ENEMY_COLOR,
    FX_TUNING,
    UI_LAYOUT,
  });
}

function getPath(root: Roots, path: string): unknown {
  let cur: unknown = root;
  for (const part of path.split('.')) {
    if (!isRecord(cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function deepSet(root: Roots, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur: unknown = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!isRecord(cur)) return;
    cur = cur[parts[i]!];
  }
  if (!isRecord(cur)) return;
  cur[parts[parts.length - 1]!] = value;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

function normalizeColor(v: unknown): string {
  if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return v;
  if (typeof v === 'number') return `#${v.toString(16).padStart(6, '0').slice(-6)}`;
  return '#ffffff';
}

function toScreenBox(el: { anchor: string; x: number; y: number; width: number; height: number }): { x: number; y: number } {
  const ax = el.anchor.endsWith('left') ? 0 : el.anchor.endsWith('right') ? 1280 : 640;
  const ay = el.anchor.startsWith('top') ? 0 : el.anchor.startsWith('bottom') ? 720 : 360;
  const x = ax + (el.anchor.endsWith('right') ? -el.x - el.width : el.anchor.endsWith('center') ? el.x - el.width / 2 : el.x);
  const y = ay + (el.anchor.startsWith('bottom') ? -el.y - el.height : el.anchor.startsWith('middle') ? el.y - el.height / 2 : el.y);
  return { x, y };
}

function pointer(ev: PointerEvent): { x: number; y: number } {
  const svg = document.querySelector<SVGSVGElement>('#canvas')!;
  const rect = svg.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) / rect.width) * 1280,
    y: ((ev.clientY - rect.top) / rect.height) * 720,
  };
}
