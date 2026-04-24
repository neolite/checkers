import * as THREE from 'three';
import type { World } from '@engine/world';

// Procedural SFX kernel. All sounds are synthesized at play-time from oscillators
// and noise — no audio files, no licenses. Positional via PannerNode at a world
// (x, z), listener is attached to the camera and refreshed each frame.
//
// Architecture: one AudioContext, one masterGain (for global mute/volume), one
// THREE.AudioListener piggybacking on the context so PositionalAudio / direct
// PannerNodes share it.

export interface AudioKernelHandle {
  mute(on: boolean): void;
  isMuted(): boolean;
  updateListener(): void;
  destroy(): void;
}

export function mountAudio(world: World): AudioKernelHandle {
  // Must be gated on the first user gesture on some browsers.
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) {
    return { mute: () => {}, isMuted: () => true, updateListener: () => {}, destroy: () => {} };
  }
  const ctx: AudioContext = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  let muted = false;
  function setMuted(on: boolean): void {
    muted = on;
    master.gain.value = on ? 0 : 0.55;
  }

  // THREE listener to share the same AudioContext (for any PositionalAudio uses later).
  const listener = new THREE.AudioListener();
  // Replace the internal context with ours so positional sources share state.
  (listener as unknown as { context: AudioContext }).context = ctx;
  // Attach to camera once it exists. If missing at mount we'll retry in updateListener.
  attachListener();

  function attachListener(): void {
    const cam = world.three.camera;
    if (cam && !cam.children.includes(listener)) cam.add(listener);
  }

  // --- synth helpers ---
  function panner(wx: number, wy: number): PannerNode {
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 10;
    p.maxDistance = 110;
    p.rolloffFactor = 1.2;
    p.positionX.value = wx;
    p.positionY.value = 1.2;
    p.positionZ.value = wy;
    return p;
  }

  function tone(freq: number, dur: number, type: OscillatorType, gain: number, wx?: number, wy?: number): void {
    if (muted) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g);
    if (wx !== undefined && wy !== undefined) {
      const p = panner(wx, wy);
      g.connect(p);
      p.connect(master);
    } else {
      g.connect(master);
    }
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.05);
  }

  function sweep(f0: number, f1: number, dur: number, type: OscillatorType, gain: number, wx?: number, wy?: number): void {
    if (muted) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), ctx.currentTime + dur);
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g);
    if (wx !== undefined && wy !== undefined) {
      const p = panner(wx, wy);
      g.connect(p);
      p.connect(master);
    } else {
      g.connect(master);
    }
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.05);
  }

  // Noise burst through a bandpass — for "impact" crunches.
  let sharedNoise: AudioBuffer | null = null;
  function getNoise(): AudioBuffer {
    if (sharedNoise) return sharedNoise;
    const len = ctx.sampleRate * 0.5;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    sharedNoise = buf;
    return buf;
  }
  function noiseBurst(centerHz: number, q: number, dur: number, gain: number, wx?: number, wy?: number): void {
    if (muted) return;
    const src = ctx.createBufferSource();
    src.buffer = getNoise();
    const filt = ctx.createBiquadFilter();
    filt.type = 'bandpass';
    filt.frequency.value = centerHz;
    filt.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    src.connect(filt);
    filt.connect(g);
    if (wx !== undefined && wy !== undefined) {
      const p = panner(wx, wy);
      g.connect(p);
      p.connect(master);
    } else {
      g.connect(master);
    }
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
  }

  // --- event subscriptions ---
  const offs: Array<() => void> = [];

  offs.push(world.bus.on('weapon:fired', ({ attackerId }) => {
    const u = world.units.findById(attackerId);
    const b = u ? null : world.buildings.findById(attackerId);
    const x = u ? u.x : (b?.x ?? 0);
    const y = u ? u.y : (b?.y ?? 0);
    const klass = u?.stats.weapon?.klass ?? b?.stats.weapon?.klass ?? 'aInfantry';
    // Per-class sonic identity: rifles = short high chirp; armor = low thump;
    // structure = slightly metallic warble.
    if (klass === 'aInfantry') {
      sweep(1400 + Math.random() * 140, 520, 0.08, 'square', 0.08, x, y);
    } else if (klass === 'aArmor') {
      sweep(260, 90, 0.16, 'sawtooth', 0.18, x, y);
      noiseBurst(800, 2, 0.08, 0.1, x, y);
    } else {
      sweep(500, 180, 0.22, 'triangle', 0.14, x, y);
    }
  }));

  offs.push(world.bus.on('projectile:impact', ({ x, y, damage }) => {
    if (damage <= 0) return;
    // Impact: low thud + broadband noise scaled by damage.
    const gain = Math.min(0.35, 0.06 + damage / 220);
    tone(140 - Math.random() * 30, 0.18, 'sine', gain, x, y);
    noiseBurst(1800, 0.9, 0.15, gain * 0.7, x, y);
  }));

  offs.push(world.bus.on('unit:died', ({ x, y, faction }) => {
    // Ally death: slightly lower; enemy death: slightly brighter.
    const isAlly = faction === world.playerFaction;
    tone(isAlly ? 170 : 320, 0.3, 'sine', 0.16, x, y);
    noiseBurst(900, 1.2, 0.25, 0.1, x, y);
  }));

  offs.push(world.bus.on('building:completed', ({ id, faction }) => {
    if (faction !== world.playerFaction) return;
    const b = world.buildings.findById(id);
    const x = b?.x ?? 0; const y = b?.y ?? 0;
    // Two-tone "confirm" chime.
    tone(520, 0.16, 'triangle', 0.16, x, y);
    setTimeout(() => tone(780, 0.2, 'triangle', 0.16, x, y), 110);
  }));

  offs.push(world.bus.on('unit:spawned', ({ faction, x, y }) => {
    if (faction !== world.playerFaction) return;
    tone(640 + Math.random() * 60, 0.06, 'square', 0.07, x, y);
  }));

  offs.push(world.bus.on('credits:deposited', ({ faction, x, y }) => {
    if (faction !== world.playerFaction) return;
    tone(920, 0.06, 'triangle', 0.12, x, y);
    setTimeout(() => tone(1180, 0.08, 'triangle', 0.12, x, y), 40);
  }));

  offs.push(world.bus.on('building:destroyed', ({ faction }) => {
    // No position leak for destroyed enemy buildings in fog — use global rumble.
    const isAlly = faction === world.playerFaction;
    sweep(220, 40, 0.55, 'sawtooth', isAlly ? 0.28 : 0.2);
    noiseBurst(600, 0.5, 0.6, isAlly ? 0.22 : 0.15);
  }));

  offs.push(world.bus.on('hq:destroyed', () => {
    sweep(180, 30, 1.2, 'sawtooth', 0.35);
    noiseBurst(400, 0.4, 1.0, 0.25);
  }));

  offs.push(world.bus.on('game:victory', () => {
    // Triumphant stinger.
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => setTimeout(() => tone(n, 0.5, 'triangle', 0.28), i * 180));
  }));

  offs.push(world.bus.on('game:defeat', () => {
    const notes = [329.63, 261.63, 196.00, 146.83];
    notes.forEach((n, i) => setTimeout(() => tone(n, 0.6, 'sawtooth', 0.22), i * 240));
  }));

  // Resume the context on first user gesture (Chrome autoplay policy).
  const resume = (): void => {
    if (ctx.state === 'suspended') ctx.resume();
  };
  window.addEventListener('mousedown', resume, { once: true });
  window.addEventListener('keydown', resume, { once: true });

  // Mute toggle on M.
  const keyHandler = (e: KeyboardEvent): void => {
    if (e.code === 'KeyM') setMuted(!muted);
  };
  window.addEventListener('keydown', keyHandler);

  return {
    mute: setMuted,
    isMuted: () => muted,
    updateListener: () => {
      attachListener();
      // Listener follows the camera automatically because it's a child of it.
    },
    destroy: () => {
      for (const off of offs) off();
      window.removeEventListener('keydown', keyHandler);
      if (listener.parent) listener.parent.remove(listener);
      master.disconnect();
      ctx.close().catch(() => { /* swallow */ });
    },
  };
}
