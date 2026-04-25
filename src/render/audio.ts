import type { World } from '@engine/world';

// Procedural SFX kernel. All sounds are synthesized at play-time from oscillators
// and noise — no audio files, no licenses. Positional mix is camera-relative:
// distance controls gain, x-offset controls stereo pan, and a shared delay/reverb
// bus gives far impacts some space without depending on fragile 3D listener state.
//
// Architecture: one AudioContext, one masterGain (for global mute/volume), plus
// one shared echo bus. Individual sounds route through short-lived gain/pan nodes.

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

  const delay = ctx.createDelay(0.8);
  delay.delayTime.value = 0.18;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.26;
  const echoFilter = ctx.createBiquadFilter();
  echoFilter.type = 'lowpass';
  echoFilter.frequency.value = 2200;
  const echoGain = ctx.createGain();
  echoGain.gain.value = 0.22;
  delay.connect(echoFilter);
  echoFilter.connect(feedback);
  feedback.connect(delay);
  echoFilter.connect(echoGain);
  echoGain.connect(master);

  // --- synth helpers ---
  function spatialParams(wx: number, wy: number): { gain: number; pan: number; wet: number } {
    const cam = world.three.camera;
    if (!cam) return { gain: 0.75, pan: 0, wet: 0.12 };
    const dx = wx - cam.position.x;
    const dy = wy - cam.position.z;
    const d = Math.hypot(dx, dy);
    // Gentle top-down RTS attenuation: off-screen combat is quieter, not gone.
    const gain = Math.max(0.16, Math.min(1, 1 / (1 + d / 36)));
    const pan = Math.max(-0.85, Math.min(0.85, dx / 42));
    const wet = Math.max(0.08, Math.min(0.32, d / 220));
    return { gain, pan, wet };
  }

  function connectOutput(node: AudioNode, wx?: number, wy?: number, wetAmount = 0.12): void {
    if (wx === undefined || wy === undefined) {
      node.connect(master);
      const send = ctx.createGain();
      send.gain.value = wetAmount * 0.55;
      node.connect(send);
      send.connect(delay);
      return;
    }
    const params = spatialParams(wx, wy);
    const distGain = ctx.createGain();
    distGain.gain.value = params.gain;
    const pan = ctx.createStereoPanner();
    pan.pan.value = params.pan;
    node.connect(distGain);
    distGain.connect(pan);
    pan.connect(master);

    const send = ctx.createGain();
    send.gain.value = params.wet * wetAmount;
    distGain.connect(send);
    send.connect(delay);
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
    connectOutput(g, wx, wy, 0.12);
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
    connectOutput(g, wx, wy, 0.18);
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
    connectOutput(g, wx, wy, 0.35);
    src.start();
    src.stop(ctx.currentTime + dur + 0.05);
  }

  // --- event subscriptions ---
  const offs: Array<() => void> = [];

  offs.push(world.bus.on('weapon:fired', ({ attackerId, attackerIsBuilding }) => {
    const u = attackerIsBuilding ? null : world.units.findById(attackerId);
    const b = attackerIsBuilding ? world.buildings.findById(attackerId) : null;
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

  offs.push(world.bus.on('projectile:impact', ({ x, y, damage, klass }) => {
    if (damage <= 0) return;
    // Impact: low thud + broadband noise scaled by damage.
    const gain = Math.min(0.35, 0.06 + damage / 220);
    const base = klass === 'aStructure' ? 95 : klass === 'aArmor' ? 125 : 165;
    tone(base - Math.random() * 20, 0.18, 'sine', gain, x, y);
    noiseBurst(klass === 'aStructure' ? 700 : 1800, 0.9, 0.15, gain * 0.7, x, y);
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
    updateListener: () => { /* camera is sampled when each sound is created */ },
    destroy: () => {
      for (const off of offs) off();
      window.removeEventListener('keydown', keyHandler);
      master.disconnect();
      delay.disconnect();
      feedback.disconnect();
      echoFilter.disconnect();
      echoGain.disconnect();
      ctx.close().catch(() => { /* swallow */ });
    },
  };
}
