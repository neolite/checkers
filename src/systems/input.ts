import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import { screenToGround } from '@render/picking';
import type { BuildingKind } from '@config/buildings';
import { UI, MAP, WORLD } from '@config/gameplay';
import { sampleFog } from '@render/fogOverlay';
import { BUILDING_STATS } from '@config/buildings';
import { BuildingGhost } from '@render/ghost';

// Inline-SVG cursors. Hotspot for "diamond" resource cursor is at bottom tip (spec).
const CUR_ATTACK = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 28 28'><circle cx='14' cy='14' r='10' fill='none' stroke='%23ff6e6e' stroke-width='2'/><line x1='14' y1='2' x2='14' y2='26' stroke='%23ff6e6e' stroke-width='2'/><line x1='2' y1='14' x2='26' y2='14' stroke='%23ff6e6e' stroke-width='2'/></svg>") 14 14, crosshair`;
const CUR_RESOURCE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='28' viewBox='0 0 24 28'><polygon points='12,2 22,14 12,26 2,14' fill='%2355e0c6' stroke='%23ffffff' stroke-width='1.5'/></svg>") 12 26, cell`;
const CUR_MOVE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path d='M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3' fill='none' stroke='%237ef5b3' stroke-width='2'/></svg>") 12 12, crosshair`;
const CUR_PLACE = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><rect x='4' y='4' width='16' height='16' fill='none' stroke='%237ef5b3' stroke-width='2'/><line x1='12' y1='1' x2='12' y2='7' stroke='%237ef5b3' stroke-width='2'/><line x1='12' y1='17' x2='12' y2='23' stroke='%237ef5b3' stroke-width='2'/><line x1='1' y1='12' x2='7' y2='12' stroke='%237ef5b3' stroke-width='2'/><line x1='17' y1='12' x2='23' y2='12' stroke='%237ef5b3' stroke-width='2'/></svg>") 12 12, cell`;
const CUR_SELECT = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><rect x='5' y='5' width='14' height='14' fill='%237ef5b3' fill-opacity='0.18' stroke='%237ef5b3' stroke-width='2' stroke-dasharray='3,2'/><path d='M12 2v5M12 17v5M2 12h5M17 12h5' stroke='%237ef5b3' stroke-width='2'/></svg>") 12 12, crosshair`;

// Input system converts DOM events into typed game events and handles box-select.
// It owns the select-box DOM layer and the placement-ghost state.
export class InputSystem implements ISystem {
  readonly name = 'input';
  private boxStart: { x: number; y: number } | null = null;
  private boxEl: HTMLDivElement | null = null;
  private placement: BuildingKind | null = null;
  private placementValid = true;
  private placementX = 0;
  private placementY = 0;
  private hostEl: HTMLElement;
  private ghostDiv: HTMLDivElement | null = null;
  private ghostMesh: BuildingGhost | null = null;
  private dragMoveOff: ((e: MouseEvent) => void) | null = null;
  private dragUpOff: ((e: MouseEvent) => void) | null = null;
  // Cursor type cache: DOM `style.cursor` writes re-render the OS cursor even when
  // value is identical in Chrome, which produces the visible "jump" on mousemove.
  // Track the last-applied value and only write when it changes.
  private lastCursor: string = '';

  constructor(hostEl: HTMLElement) {
    this.hostEl = hostEl;
  }

  init(w: World): void {
    const canvas = w.three.renderer?.domElement;
    if (!canvas) return;

    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0 /* LMB */) {
        if (this.placement) {
          this.commitPlacement(w);
        } else {
          this.beginSelectionDrag(w, canvas, e);
        }
      } else if (e.button === 2 /* RMB */) {
        if (this.placement) {
          this.cancelPlacement(w);
          return;
        }
        this.handleRightClick(w, e);
      }
    });

    canvas.addEventListener('mousemove', (e) => {
      if (this.boxStart) {
        this.setCursor(canvas, CUR_SELECT);
        return;
      }
      if (this.placement) {
        this.updatePlacementGhost(w, e.clientX, e.clientY);
        this.setCursor(canvas, this.placementValid ? CUR_PLACE : 'not-allowed');
      } else {
        this.updateCursor(w, canvas, e.clientX, e.clientY);
      }
    });

    window.addEventListener('keydown', (e) => {
      // e.code = physical key; layout-independent so Russian QWERTY maps to KeyW/KeyS/etc.
      if (e.code === 'Escape') {
        if (this.placement) this.cancelPlacement(w);
        else w.bus.emit('input:selectSingle', { id: null, additive: false });
      }
      if (e.code === 'KeyH') {
        if (w.selectedUnits.size > 0) w.bus.emit('input:commandHold', {});
      }
      if (e.code === 'KeyX') {
        if (w.selectedUnits.size > 0) w.bus.emit('input:commandStop', {});
      }
    });

    // Listen to placement start requests from UI.
    w.bus.on('input:startPlacement', ({ kind }) => {
      this.placement = kind;
      this.ensureGhost();
      if (!this.ghostMesh && w.three.scene) {
        this.ghostMesh = new BuildingGhost(w.three.scene, w.playerFaction);
      }
      if (this.ghostMesh) this.ghostMesh.show(kind);
    });
    w.bus.on('input:cancelPlacement', () => {
      this.cancelPlacement(w);
    });
  }

  update(_w: World, _dtMs: number): void {
    // No per-frame work; all input is event-driven.
  }

  private beginSelectionDrag(w: World, canvas: HTMLCanvasElement, e: MouseEvent): void {
    this.endSelectionDragListeners();
    this.boxStart = { x: e.clientX, y: e.clientY };
    this.drawBox(e.clientX, e.clientY);
    this.setCursor(canvas, CUR_SELECT);

    const onMove = (ev: MouseEvent): void => {
      if (!this.boxStart) return;
      this.drawBox(ev.clientX, ev.clientY);
    };
    const onUp = (ev: MouseEvent): void => {
      if (ev.button !== 0 || !this.boxStart) return;
      const endX = ev.clientX, endY = ev.clientY;
      const minX = Math.min(this.boxStart.x, endX);
      const minY = Math.min(this.boxStart.y, endY);
      const maxX = Math.max(this.boxStart.x, endX);
      const maxY = Math.max(this.boxStart.y, endY);
      this.clearBox();
      this.endSelectionDragListeners();
      this.boxStart = null;

      const additive = ev.shiftKey;
      if ((maxX - minX) < UI.selectionMinPx && (maxY - minY) < UI.selectionMinPx) {
        this.singleSelectAt(w, endX, endY, additive);
      } else {
        w.bus.emit('input:selectBox', { minX, minY, maxX, maxY, additive });
      }
      this.updateCursor(w, canvas, endX, endY);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    this.dragMoveOff = onMove;
    this.dragUpOff = onUp;
  }

  private endSelectionDragListeners(): void {
    if (this.dragMoveOff) {
      window.removeEventListener('mousemove', this.dragMoveOff);
      this.dragMoveOff = null;
    }
    if (this.dragUpOff) {
      window.removeEventListener('mouseup', this.dragUpOff);
      this.dragUpOff = null;
    }
  }

  private setCursor(canvas: HTMLCanvasElement, value: string): void {
    if (this.lastCursor === value) return;
    this.lastCursor = value;
    canvas.style.cursor = value;
  }

  private updateCursor(w: World, canvas: HTMLCanvasElement, cx: number, cy: number): void {
    const ground = screenToGround(w.three.camera!, cx, cy, window.innerWidth, window.innerHeight);
    if (!ground) { this.setCursor(canvas, ''); return; }
    const pick = this.pickEntityUnderCursor(w, ground.x, ground.z);
    if (pick && pick.hostile) {
      this.setCursor(canvas, CUR_ATTACK);
    } else if (pick && pick.isResource) {
      this.setCursor(canvas, CUR_RESOURCE);
    } else if (w.selectedUnits.size > 0 || w.selectedBuildings.size > 0) {
      this.setCursor(canvas, CUR_MOVE);
    } else {
      this.setCursor(canvas, '');
    }
  }

  private handleRightClick(w: World, e: MouseEvent): void {
    const ground = screenToGround(w.three.camera!, e.clientX, e.clientY, window.innerWidth, window.innerHeight);
    if (!ground) return;
    const target = this.pickEntityUnderCursor(w, ground.x, ground.z);
    const additive = e.shiftKey;

    // If a building is selected and no unit is, set rally point.
    if (w.selectedBuildings.size > 0 && w.selectedUnits.size === 0) {
      w.bus.emit('input:setRally', { x: ground.x, y: ground.z });
      return;
    }
    if (target && target.hostile) {
      w.bus.emit('input:commandAttack', { targetId: target.id, additive });
    } else if (target && target.isResource) {
      w.bus.emit('input:commandHarvest', { resourceId: target.id });
    } else {
      const attackMove = e.ctrlKey;
      w.bus.emit('input:commandMove', { x: ground.x, y: ground.z, additive, attackMove });
    }
  }

  private singleSelectAt(w: World, sx: number, sy: number, additive: boolean): void {
    const ground = screenToGround(w.three.camera!, sx, sy, window.innerWidth, window.innerHeight);
    if (!ground) return;
    const pick = this.pickEntityUnderCursor(w, ground.x, ground.z);
    if (pick && pick.ownedByPlayer && !pick.isResource) {
      w.bus.emit('input:selectSingle', { id: pick.id, additive });
    } else {
      // Clicked empty ground, enemy, or resource — clear selection unless additive.
      if (!additive) w.bus.emit('input:selectSingle', { id: null, additive: false });
    }
  }

  private pickEntityUnderCursor(w: World, wx: number, wy: number): {
    id: number; isBuilding: boolean; isResource: boolean; ownedByPlayer: boolean; hostile: boolean;
  } | null {
    // Tiered lookup. Previously: units-first with `radius + 0.6` padding always won
    // over buildings, so a worker locked to a construction site (or just parked by
    // a barracks) stole every click meant for the structure, and the player could
    // never switch selection off the worker. New order:
    //   1. Unit whose TIGHT radius contains the cursor — player clearly meant that unit.
    //   2. Building whose radius contains the cursor — click inside footprint wins.
    //   3. Unit within padded radius — forgiving fallback for small targets.
    //   4. Resource node.
    type UnitHit = { id: number; dist: number; own: boolean; hostile: boolean };
    type BuildingHit = { id: number; dist: number; own: boolean; hostile: boolean };

    const wrapUnit = (hit: UnitHit) =>
      ({ id: hit.id, isBuilding: false, isResource: false, ownedByPlayer: hit.own, hostile: hit.hostile });
    const wrapBuilding = (hit: BuildingHit) =>
      ({ id: hit.id, isBuilding: true, isResource: false, ownedByPlayer: hit.own, hostile: hit.hostile });

    let tightUnit: UnitHit | null = null;
    let paddedUnit: UnitHit | null = null;
    w.units.forEachAlive((u) => {
      const d = Math.hypot(u.x - wx, u.y - wy);
      const tight = u.stats.radius;
      const padded = u.stats.radius + 0.6;
      if (d >= padded) return;
      const fogV = sampleFog(w.factions[w.playerFaction].fog, u.x, u.y);
      const visible = u.faction === w.playerFaction || fogV === 2;
      if (!visible) return;
      const candidate: UnitHit = {
        id: u.id, dist: d,
        own: u.faction === w.playerFaction,
        hostile: w.areHostile(u.faction, w.playerFaction),
      };
      if (d < tight) {
        if (!tightUnit || d < tightUnit.dist) tightUnit = candidate;
      } else {
        if (!paddedUnit || d < paddedUnit.dist) paddedUnit = candidate;
      }
    });
    if (tightUnit !== null) return wrapUnit(tightUnit);

    let bestB: BuildingHit | null = null;
    w.buildings.forEachAlive((b) => {
      const d = Math.hypot(b.x - wx, b.y - wy);
      if (d < b.stats.radius) {
        const fogV = sampleFog(w.factions[w.playerFaction].fog, b.x, b.y);
        const visible = b.faction === w.playerFaction || fogV === 2 || fogV === 1;
        if (!visible) return;
        if (!bestB || d < bestB.dist) bestB = {
          id: b.id, dist: d,
          own: b.faction === w.playerFaction,
          hostile: w.areHostile(b.faction, w.playerFaction),
        };
      }
    });
    if (bestB !== null) return wrapBuilding(bestB);

    if (paddedUnit !== null) return wrapUnit(paddedUnit);

    // Resource nodes (always neutral).
    let bestR: { id: number; dist: number } | null = null;
    w.resources.forEachAlive((r) => {
      const d = Math.hypot(r.x - wx, r.y - wy);
      if (d < 1.4) {
        const fogV = sampleFog(w.factions[w.playerFaction].fog, r.x, r.y);
        if (fogV === 0) return;
        if (!bestR || d < bestR.dist) bestR = { id: r.id, dist: d };
      }
    });
    if (bestR !== null) {
      const br = bestR as { id: number; dist: number };
      return { id: br.id, isBuilding: false, isResource: true, ownedByPlayer: false, hostile: false };
    }
    return null;
  }

  private drawBox(x: number, y: number): void {
    if (!this.boxStart) return;
    if (!this.boxEl) {
      const el = document.createElement('div');
      el.className = 'select-box';
      el.style.zIndex = '30';
      this.hostEl.appendChild(el);
      this.boxEl = el;
    }
    const minX = Math.min(this.boxStart.x, x);
    const minY = Math.min(this.boxStart.y, y);
    const w = Math.abs(this.boxStart.x - x);
    const h = Math.abs(this.boxStart.y - y);
    const el = this.boxEl!;
    el.style.left = `${minX}px`;
    el.style.top = `${minY}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
  }

  private clearBox(): void {
    if (this.boxEl && this.boxEl.parentElement) {
      this.boxEl.parentElement.removeChild(this.boxEl);
    }
    this.boxEl = null;
  }

  private ensureGhost(): void {
    // Placement ghost is a DOM indicator (the world-space ghost plane lives in render/selection).
    if (!this.ghostDiv) {
      const d = document.createElement('div');
      d.style.position = 'absolute';
      d.style.top = '40%';
      d.style.left = '50%';
      d.style.transform = 'translate(-50%, -50%)';
      d.style.background = 'rgba(10, 14, 22, 0.82)';
      d.style.border = '1px solid rgba(126,245,179,0.55)';
      d.style.padding = '6px 10px';
      d.style.borderRadius = '4px';
      d.style.fontSize = '12px';
      d.style.pointerEvents = 'none';
      d.textContent = 'Place structure: LMB to confirm, RMB/ESC to cancel';
      d.dataset['ghost'] = '1';
      this.hostEl.appendChild(d);
      this.ghostDiv = d;
    }
  }

  private updatePlacementGhost(w: World, cx: number, cy: number): void {
    const ground = screenToGround(w.three.camera!, cx, cy, window.innerWidth, window.innerHeight);
    if (!ground) return;
    this.placementX = ground.x;
    this.placementY = ground.z;
    this.placementValid = this.validatePlacement(w, ground.x, ground.z);
    if (this.ghostDiv) {
      this.ghostDiv.style.borderColor = this.placementValid ? 'rgba(126,245,179,0.8)' : 'rgba(255,110,110,0.8)';
    }
    if (this.ghostMesh) this.ghostMesh.update(ground.x, ground.z, this.placementValid);
  }

  private validatePlacement(w: World, wx: number, wz: number): boolean {
    if (!this.placement) return false;
    const stats = BUILDING_STATS[this.placement];
    const tx = Math.floor(wx / MAP.tileSize) - Math.floor(stats.tileW / 2);
    const ty = Math.floor(wz / MAP.tileSize) - Math.floor(stats.tileH / 2);
    // Bounds + blocked check.
    for (let dy = 0; dy < stats.tileH; dy++) {
      for (let dx = 0; dx < stats.tileW; dx++) {
        if (!w.navGrid.inBounds(tx + dx, ty + dy)) return false;
        if (w.navGrid.isBlocked(tx + dx, ty + dy)) return false;
      }
    }
    // Must be explored territory.
    const fog = w.factions[w.playerFaction].fog;
    let allExplored = true;
    for (let dy = 0; dy < stats.tileH; dy++) {
      for (let dx = 0; dx < stats.tileW; dx++) {
        const v = sampleFog(fog, (tx + dx + 0.5) * MAP.tileSize, (ty + dy + 0.5) * MAP.tileSize);
        if (v === 0) { allExplored = false; break; }
      }
      if (!allExplored) break;
    }
    if (!allExplored) return false;
    // Inside world bounds padding.
    if (wx < 0 || wz < 0 || wx > WORLD.width || wz > WORLD.depth) return false;
    return true;
  }

  private commitPlacement(w: World): void {
    if (!this.placement) return;
    if (!this.placementValid) return;
    w.bus.emit('input:placeBuilding', { x: this.placementX, y: this.placementY, kind: this.placement });
    this.cancelPlacement(w);
  }

  private cancelPlacement(_w: World): void {
    this.placement = null;
    if (this.ghostDiv && this.ghostDiv.parentElement) {
      this.ghostDiv.parentElement.removeChild(this.ghostDiv);
    }
    this.ghostDiv = null;
    if (this.ghostMesh) this.ghostMesh.hide();
  }
}
