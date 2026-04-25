import type { World } from '@engine/world';
import { worldToScreen } from '@render/picking';

interface Bubble {
  el: HTMLSpanElement;
  wx: number;
  wy: number;
  wz: number;
  spawnMs: number;
  lifeMs: number;
}

export interface FloatingTextHandle {
  tick(): void;
  destroy(): void;
}

export function mountFloatingText(world: World): FloatingTextHandle {
  const layer = document.querySelector('#float-layer') as HTMLDivElement;
  const bubbles: Bubble[] = [];
  let toastUntil = 0;
  const toast = document.createElement('div');
  toast.className = 'hud-toast';
  layer.appendChild(toast);

  const push = (text: string, cls: string, wx: number, wy: number, wz: number): void => {
    const el = document.createElement('span');
    el.className = `float-text ${cls}`;
    el.textContent = text;
    layer.appendChild(el);
    bubbles.push({ el, wx, wy, wz, spawnMs: performance.now(), lifeMs: 1100 });
  };

  const offs: Array<() => void> = [];
  offs.push(world.bus.on('unit:damaged', ({ amount, x, y }) => {
    if (amount > 0) push(`-${amount}`, 'dmg', x, 1.5, y);
  }));
  offs.push(world.bus.on('building:damaged', ({ amount, x, y }) => {
    if (amount > 0) push(`-${amount}`, 'dmg', x, 2.5, y);
  }));
  offs.push(world.bus.on('credits:deposited', ({ amount, x, y, faction }) => {
    if (faction !== world.playerFaction) return;
    push(`+${amount}`, 'credit', x, 2.2, y);
  }));
  offs.push(world.bus.on('cargo:gathered', ({ unitId, amount }) => {
    const u = world.units.findById(unitId);
    if (!u || u.faction !== world.playerFaction) return;
    push(`+${amount}`, 'info', u.x, 2.0, u.y);
  }));
  offs.push(world.bus.on('ui:notice', ({ text }) => {
    toast.textContent = text;
    toast.classList.add('show');
    toastUntil = performance.now() + 1700;
  }));

  function tick(): void {
    const now = performance.now();
    if (toastUntil > 0 && now >= toastUntil) {
      toast.classList.remove('show');
      toastUntil = 0;
    }
    const cam = world.three.camera;
    if (!cam) return;
    const width = window.innerWidth, height = window.innerHeight;
    for (let i = bubbles.length - 1; i >= 0; i--) {
      const b = bubbles[i]!;
      const age = now - b.spawnMs;
      if (age >= b.lifeMs) {
        if (b.el.parentElement) b.el.parentElement.removeChild(b.el);
        bubbles.splice(i, 1);
        continue;
      }
      const t = age / b.lifeMs;
      const rise = t * 40;
      const p = worldToScreen(cam, b.wx, b.wy, b.wz, width, height);
      if (p.behind) continue;
      b.el.style.transform = `translate(${p.x}px, ${p.y - rise}px)`;
      b.el.style.opacity = `${1 - t}`;
    }
  }

  return {
    tick,
    destroy() {
      for (const off of offs) off();
      for (const b of bubbles) if (b.el.parentElement) b.el.parentElement.removeChild(b.el);
      if (toast.parentElement) toast.parentElement.removeChild(toast);
    },
  };
}
