import type { World } from '@engine/world';
import { FACTION_COLORS } from '@config/palette';
import { FACTIONS } from '@config/factions';
import type { CameraSystem } from '@systems/camera';
import { WORLD } from '@config/gameplay';

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
