import * as THREE from 'three';
import type { UnitKind } from '@game/rts/content/units';
import type { WeaponBehavior } from '@config/gameplay';
import type { BuildingKind } from '@game/rts/content/buildings';
import type { FactionId } from '@config/palette';

// Shared tint material cache (by color key).
const materialCache = new Map<string, THREE.MeshLambertMaterial>();
function mat(hex: number, opts: { emissive?: number; opacity?: number } = {}): THREE.MeshLambertMaterial {
  const key = `${hex}-${opts.emissive ?? 0}-${opts.opacity ?? 1}`;
  const cached = materialCache.get(key);
  if (cached) return cached;
  const m = new THREE.MeshLambertMaterial({
    color: hex,
    flatShading: true,
    emissive: opts.emissive ?? 0x000000,
    transparent: opts.opacity !== undefined && opts.opacity < 1,
    opacity: opts.opacity ?? 1,
  });
  materialCache.set(key, m);
  return m;
}

const titanMaterialCache = new Map<string, THREE.MeshLambertMaterial>();
const titanTextureCache = new Map<string, THREE.Texture>();
const textureLoader = new THREE.TextureLoader();

function repeatLoadedTexture(path: string, repeat: number, colorSpace?: THREE.ColorSpace): THREE.Texture {
  const cached = titanTextureCache.get(path);
  if (cached) return cached;
  const texture = textureLoader.load(path);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  if (colorSpace) texture.colorSpace = colorSpace;
  titanTextureCache.set(path, texture);
  return texture;
}

function makeTitanPanelTexture(hex: number, variant: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const base = new THREE.Color(hex);
  const c0 = `#${base.getHexString()}`;
  const c1 = `#${base.clone().multiplyScalar(1.34).getHexString()}`;
  const c2 = `#${base.clone().multiplyScalar(0.9).getHexString()}`;
  ctx.fillStyle = c0;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = c1;
  const step = variant === 'trim' ? 28 : variant === 'core' ? 36 : 22;
  for (let x = 0; x < size; x += step) ctx.fillRect(x, 0, 2, size);
  for (let y = 0; y < size; y += step) ctx.fillRect(0, y, size, 2);
  ctx.fillStyle = c2;
  for (let i = 0; i < 26; i++) {
    const x = (i * 37 + variant.length * 11) % size;
    const y = (i * 53 + variant.length * 17) % size;
    ctx.fillRect(x, y, 2 + (i % 5), 1 + (i % 3));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.2, 2.2);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function titanMetal(hex: number, variant = 'panel'): THREE.MeshLambertMaterial {
  const key = `${hex}-${variant}`;
  const cached = titanMaterialCache.get(key);
  if (cached) return cached;
  const m = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    map: makeTitanPanelTexture(hex, variant),
    emissive: hex,
    emissiveMap: repeatLoadedTexture('/assets/textures/ambientcg/Metal060C/Metal060C_1K-JPG_Color.jpg', 2.6, THREE.SRGBColorSpace),
    emissiveIntensity: variant === 'core' ? 0.2 : variant === 'trim' ? 0.16 : 0.14,
    flatShading: true,
  });
  titanMaterialCache.set(key, m);
  return m;
}

function withShadow(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

function addAntenna(g: THREE.Group, x: number, y: number, z: number, height: number, color: number): void {
  const mast = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, height, 8), mat(color)));
  mast.position.set(x, y + height / 2, z);
  const tip = withShadow(new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), mat(color, { emissive: color })));
  tip.position.set(x, y + height, z);
  g.add(mast, tip);
}

function addCable(g: THREE.Group, x: number, y: number, z: number, color: number): void {
  const ring = withShadow(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 18), mat(color, { emissive: color })));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, y, z);
  g.add(ring);
}

// ---------------------- Unit meshes ----------------------
export function makeUnitMesh(kind: UnitKind, primary: number, accent: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `unit:${kind}`;
  switch (kind) {
    // -------- Workers --------
    case 'harvesterHuman': {
      const body = withShadow(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.8, 1.8), mat(primary)));
      body.position.y = 0.55;
      const cab = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.9), mat(accent)));
      cab.position.set(0, 1.05, 0.35);
      const wheelGeom = new THREE.CylinderGeometry(0.28, 0.28, 0.25, 10);
      wheelGeom.rotateZ(Math.PI / 2);
      for (const [x, z] of [[-0.65, 0.6], [0.65, 0.6], [-0.65, -0.6], [0.65, -0.6]] as const) {
        const wh = withShadow(new THREE.Mesh(wheelGeom, mat(0x101820)));
        wh.position.set(x, 0.25, z);
        g.add(wh);
      }
      g.add(body, cab);
      break;
    }
    case 'harvesterSwarm': {
      const body = withShadow(new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 8), mat(primary)));
      body.scale.set(1.1, 0.72, 0.9);
      body.position.y = 0.8;
      const orb = withShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), mat(accent, { emissive: accent })));
      orb.position.set(0, 1.3, 0);
      for (const x of [-0.72, 0.72]) {
        const leg = withShadow(new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.9, 6), mat(0x221315)));
        leg.rotation.z = x < 0 ? -0.75 : 0.75;
        leg.position.set(x, 0.45, 0.2);
        g.add(leg);
      }
      g.add(body, orb);
      break;
    }
    case 'harvesterTitan': {
      const body = withShadow(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 2.1), mat(primary)));
      body.position.y = 0.6;
      const stack = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 0.9, 8), mat(accent)));
      stack.position.set(-0.55, 1.4, -0.6);
      const core = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), mat(accent, { emissive: accent })));
      core.position.set(0.52, 1.2, 0.62);
      g.add(body, stack, core);
      break;
    }

    // -------- Infantry --------
    case 'ranger':
    case 'atTrooper':
    case 'commando': {
      const helm = withShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 0), mat(accent)));
      helm.position.y = 1.55;
      const torso = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.3), mat(primary)));
      torso.position.y = 1.15;
      const legs = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.3), mat(0x2a313c)));
      legs.position.y = 0.5;
      const rifle = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.9), mat(0x1b1f25)));
      rifle.position.set(0.35, 1.2, 0.45);
      g.add(helm, torso, legs, rifle);
      if (kind === 'commando') {
        // Heavy shoulder pads.
        const padL = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.35), mat(accent)));
        padL.position.set(-0.38, 1.35, 0);
        const padR = padL.clone();
        padR.position.x = 0.38;
        g.add(padL, padR);
      }
      if (kind === 'atTrooper') {
        const tube = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.1, 10), mat(0x1b1f25)));
        tube.rotation.x = Math.PI / 2;
        tube.position.set(-0.35, 1.25, 0.45);
        g.add(tube);
      }
      if (kind === 'commando') {
        const cape = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.5, 0.06), mat(accent)));
        cape.position.set(0, 1.15, -0.2);
        g.add(cape);
      }
      break;
    }
    case 'raider': {
      const body = withShadow(new THREE.Mesh(new THREE.ConeGeometry(0.38, 1.05, 7), mat(primary)));
      body.position.y = 0.85;
      body.rotation.x = Math.PI;
      const head = withShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), mat(accent, { emissive: accent })));
      head.position.set(0, 1.35, 0.18);
      const clawGeom = new THREE.ConeGeometry(0.08, 0.55, 6);
      clawGeom.rotateX(Math.PI / 2);
      for (const x of [-0.28, 0.28]) {
        const claw = withShadow(new THREE.Mesh(clawGeom, mat(0x1b1f25)));
        claw.position.set(x, 0.95, 0.42);
        g.add(claw);
      }
      for (const x of [-0.42, 0.42]) {
        const spine = withShadow(new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.45, 5), mat(accent, { emissive: accent })));
        spine.rotation.x = -0.55;
        spine.position.set(x, 1.0, -0.32);
        g.add(spine);
      }
      g.add(body, head);
      break;
    }
    case 'paladin': {
      const legs = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.8, 0.42), mat(0x2a313c)));
      legs.position.y = 0.55;
      const torso = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.78, 0.52), mat(primary)));
      torso.position.y = 1.25;
      const helm = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.4), mat(accent)));
      helm.position.y = 1.82;
      const launcher = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.78, 10), mat(0x1b1f25)));
      launcher.rotation.x = Math.PI / 2;
      launcher.position.set(0.42, 1.28, 0.5);
      for (const x of [-0.55, 0.55]) {
        const pad = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.5), mat(accent)));
        pad.position.set(x, 1.47, 0);
        g.add(pad);
      }
      g.add(legs, torso, helm, launcher);
      break;
    }
    case 'atGrenadier': {
      const legs = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.72, 0.36), mat(0x2a313c)));
      legs.position.y = 0.5;
      const torso = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.7, 0.42), mat(primary)));
      torso.position.y = 1.16;
      const helm = withShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), mat(accent)));
      helm.position.y = 1.62;
      const pack = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.68, 0.22), mat(0x1b2330)));
      pack.position.set(0, 1.1, -0.36);
      const launcher = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.95, 10), mat(0x1b1f25)));
      launcher.rotation.x = Math.PI / 2;
      launcher.position.set(0.36, 1.22, 0.46);
      g.add(legs, torso, helm, pack, launcher);
      break;
    }
    case 'burrower': {
      const body = withShadow(new THREE.Mesh(new THREE.ConeGeometry(0.48, 1.05, 9), mat(primary)));
      body.rotation.x = Math.PI;
      body.position.y = 0.7;
      const eyes = withShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), mat(accent, { emissive: accent })));
      eyes.position.set(0, 0.9, 0.35);
      const drill = withShadow(new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.65, 8), mat(0x1b1f25)));
      drill.rotation.x = Math.PI / 2;
      drill.position.set(0, 0.7, 0.52);
      g.add(body, eyes, drill);
      break;
    }
    case 'railgun': {
      const base = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), mat(0x2a313c)));
      base.position.y = 0.45;
      const torso = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.0, 0.6), mat(primary)));
      torso.position.y = 1.4;
      const coil = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 10), mat(accent, { emissive: accent })));
      coil.rotation.x = Math.PI / 2;
      coil.position.set(0, 1.35, 0.9);
      const halo = withShadow(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 8, 18), mat(accent, { emissive: accent })));
      halo.position.set(0, 1.82, -0.05);
      g.add(base, torso, coil, halo);
      break;
    }
    case 'swarmlet': {
      const body = withShadow(new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), mat(primary)));
      body.scale.set(1.12, 0.78, 0.96);
      body.position.y = 0.4;
      const wing = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.2), mat(accent)));
      wing.position.y = 0.45;
      const fuse = withShadow(new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), mat(accent, { emissive: accent })));
      fuse.position.set(0, 0.52, 0.42);
      for (const x of [-0.38, 0.38]) {
        const barb = withShadow(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.42, 5), mat(0x221315)));
        barb.rotation.x = Math.PI / 2;
        barb.position.set(x, 0.38, -0.35);
        g.add(barb);
      }
      g.add(body, wing, fuse);
      break;
    }

    // -------- Tanks --------
    case 'battleTank':
    case 'scorpionBike':
    case 'siegeWalker': {
      const chassis = withShadow(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.7, 2.6), mat(primary)));
      chassis.position.y = 0.7;
      g.add(chassis);

      if (kind === 'siegeWalker') {
        // Tall bipedal look: raise chassis on 2 legs.
        chassis.position.y = 1.6;
        chassis.scale.set(1.1, 0.8, 1.0);
        const legGeom = new THREE.BoxGeometry(0.35, 1.4, 0.5);
        for (const x of [-0.7, 0.7]) {
          const l = withShadow(new THREE.Mesh(legGeom, mat(0x1b2330)));
          l.position.set(x, 0.7, 0);
          g.add(l);
        }
        const reactor = withShadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), mat(accent, { emissive: accent })));
        reactor.position.set(0, 2.15, -0.75);
        g.add(reactor);
      } else {
        // Tracks.
        const tread = new THREE.BoxGeometry(0.4, 0.35, 2.8);
        for (const x of [-0.95, 0.95]) {
          const t = withShadow(new THREE.Mesh(tread, mat(0x101820)));
          t.position.set(x, 0.32, 0);
          g.add(t);
        }
      }

      // Turret
      const turret = new THREE.Group();
      turret.name = 'turret';
      const dome = withShadow(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.2), mat(accent)));
      dome.position.y = 0.3;
      turret.add(dome);
      let barrelLen = 1.6;
      let barrelRadius = 0.12;
      if (kind === 'siegeWalker') { barrelLen = 2.2; barrelRadius = 0.2; }
      if (kind === 'scorpionBike') { barrelLen = 1.3; barrelRadius = 0.1; }
      const barrel = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(barrelRadius, barrelRadius, barrelLen, 10), mat(0x1b1f25)));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.3, barrelLen / 2);
      turret.add(barrel);
      turret.position.y = kind === 'siegeWalker' ? 2.1 : 1.15;
      g.add(turret);
      if (kind === 'scorpionBike') {
        chassis.scale.set(0.72, 0.75, 1.25);
        const tail = withShadow(new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.9, 6), mat(accent, { emissive: accent })));
        tail.rotation.x = -Math.PI / 2;
        tail.position.set(0, 0.95, -1.65);
        g.add(tail);
      }
      break;
    }
  }
  return g;
}

// ---------------------- Building meshes ----------------------
export function makeBuildingMesh(kind: BuildingKind, faction: FactionId, primary: number, accent: number, tileSize: number): THREE.Group {
  if (faction === 'swarm') return makeSwarmBuildingMesh(kind, primary, accent, tileSize);
  if (faction === 'titan') return makeTitanBuildingMesh(kind, primary, accent, tileSize);
  return makeVanguardBuildingMesh(kind, primary, accent, tileSize);
}

function makeVanguardBuildingMesh(kind: BuildingKind, primary: number, accent: number, tileSize: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `building:vanguard:${kind}`;
  switch (kind) {
    case 'hq': {
      const w = 4 * tileSize, h = 4 * tileSize;
      const plat = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, h), mat(0x2a313c)));
      plat.position.y = 0.5;
      const tower = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w * 0.55, 3.0, h * 0.55), mat(primary)));
      tower.position.y = 2.6;
      const top = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 1.0, 1.6, 8), mat(accent, { emissive: accent })));
      top.position.y = 4.7;
      g.add(plat, tower, top);
      break;
    }
    case 'power': {
      const w = 2 * tileSize, h = 2 * tileSize;
      const base = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 1.5, h * 0.9), mat(primary)));
      base.position.y = 0.75;
      const coil = withShadow(new THREE.Mesh(new THREE.TorusGeometry(w * 0.28, 0.12, 8, 16), mat(accent, { emissive: accent })));
      coil.rotation.x = Math.PI / 2;
      coil.position.y = 1.7;
      g.add(base, coil);
      break;
    }
    case 'refinery': {
      const w = 3 * tileSize, h = 3 * tileSize;
      const base = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w, 1.2, h), mat(primary)));
      base.position.y = 0.6;
      const tank = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(w * 0.22, w * 0.22, 2.2, 12), mat(accent)));
      tank.position.set(-w * 0.15, 1.9, 0);
      const pipe = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.2, 8), mat(0x1b1f25)));
      pipe.position.set(w * 0.22, 1.5, 0);
      g.add(base, tank, pipe);
      break;
    }
    case 'barracks': {
      const w = 2 * tileSize, h = 2 * tileSize;
      const body = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, h), mat(primary)));
      body.position.y = 0.7;
      const roof = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.4, h * 0.9), mat(accent)));
      roof.position.y = 1.6;
      g.add(body, roof);
      break;
    }
    case 'factory': {
      const w = 3 * tileSize, h = 3 * tileSize;
      const body = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w, 2.0, h), mat(primary)));
      body.position.y = 1.0;
      const vent = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.2, 8), mat(0x1b1f25)));
      vent.position.set(w * 0.3, 2.6, -h * 0.3);
      const door = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 1.1, 0.15), mat(accent)));
      door.position.set(0, 0.55, h / 2 + 0.01);
      g.add(body, vent, door);
      break;
    }
    case 'tech': {
      const w = 2 * tileSize, h = 2 * tileSize;
      const base = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, h), mat(primary)));
      base.position.y = 0.5;
      const crystal = withShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(w * 0.38, 0), mat(accent, { emissive: accent })));
      crystal.position.y = 1.7;
      g.add(base, crystal);
      break;
    }
    case 'turret': {
      const w = 1 * tileSize;
      const base = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(w * 0.5, w * 0.55, 1.0, 10), mat(primary)));
      base.position.y = 0.5;
      const head = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.5, w * 0.7), mat(accent)));
      head.position.y = 1.2;
      const barrel = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.4, 10), mat(0x1b1f25)));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 1.2, 0.8);
      head.add(barrel);
      g.add(base, head);
      break;
    }
  }
  return g;
}

function makeSwarmBuildingMesh(kind: BuildingKind, primary: number, accent: number, tileSize: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `building:swarm:${kind}`;
  const flesh = mat(primary);
  const glow = mat(accent, { emissive: accent });
  const dark = mat(0x221315);
  const pod = (x: number, z: number, r: number, y = r): void => {
    const m = withShadow(new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), flesh));
    m.scale.y = 0.72;
    m.position.set(x, y, z);
    g.add(m);
  };
  switch (kind) {
    case 'hq': {
      pod(0, 0, 3.2, 2.2);
      pod(-2.4, 1.8, 1.6, 1.3);
      pod(2.2, -1.6, 1.5, 1.2);
      const spire = withShadow(new THREE.Mesh(new THREE.ConeGeometry(0.9, 4.4, 9), glow));
      spire.position.y = 4.1;
      g.add(spire);
      break;
    }
    case 'power': {
      pod(0, 0, 1.5, 1.0);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        addCable(g, Math.cos(a) * 0.9, 1.75, Math.sin(a) * 0.9, accent);
      }
      break;
    }
    case 'refinery': {
      pod(0, 0, 2.2, 1.35);
      pod(-1.6, 1.1, 1.0, 1.0);
      const maw = withShadow(new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.18, 8, 18), dark));
      maw.rotation.x = Math.PI / 2;
      maw.position.set(1.4, 1.2, 0.6);
      g.add(maw);
      break;
    }
    case 'barracks': {
      pod(0, 0, 1.9, 1.15);
      for (const x of [-1.3, 0, 1.3]) {
        const tooth = withShadow(new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.2, 7), glow));
        tooth.position.set(x, 2.1, 1.3);
        g.add(tooth);
      }
      break;
    }
    case 'factory': {
      pod(0, 0, 2.6, 1.4);
      const ribGeom = new THREE.TorusGeometry(1.25, 0.08, 8, 18);
      for (let i = 0; i < 3; i++) {
        const rib = withShadow(new THREE.Mesh(ribGeom, dark));
        rib.rotation.x = Math.PI / 2;
        rib.scale.x = 1.2 + i * 0.12;
        rib.position.set(0, 1.6 + i * 0.28, -0.4 + i * 0.35);
        g.add(rib);
      }
      break;
    }
    case 'tech': {
      pod(0, 0, 1.7, 1.1);
      const core = withShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(1.0, 1), glow));
      core.position.y = 2.25;
      g.add(core);
      break;
    }
    case 'turret': {
      pod(0, 0, 1.0, 0.8);
      const barb = withShadow(new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.4, 8), glow));
      barb.rotation.x = Math.PI / 2;
      barb.position.set(0, 1.25, 1.0);
      g.add(barb);
      break;
    }
  }
  return g;
}

function makeTitanBuildingMesh(kind: BuildingKind, primary: number, accent: number, tileSize: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `building:titan:${kind}`;
  const coreMat = titanMetal(primary, 'core');
  const neon = mat(accent, { emissive: accent });
  const shadowPurple = titanMetal(0x57347a, 'panel');
  const dark = titanMetal(0x7752a6, 'trim');
  const slab = (w: number, h: number, d: number, x: number, y: number, z: number, material = coreMat): THREE.Mesh => {
    const m = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const panel = (w: number, h: number, x: number, y: number, z: number, rotY = 0, material = dark): void => {
    const m = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.12), material));
    m.rotation.y = rotY;
    m.position.set(x, y, z);
    g.add(m);
  };
  const blade = (r: number, h: number, x: number, y: number, z: number, material = coreMat): void => {
    const m = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r, h, 6), material));
    m.rotation.y = Math.PI / 6;
    m.position.set(x, y, z);
    g.add(m);
  };
  const prism = (w: number, h: number, d: number, x: number, y: number, z: number, rotY = 0, material = coreMat): void => {
    const m = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material));
    m.rotation.y = rotY;
    m.position.set(x, y, z);
    g.add(m);
  };
  const lightBar = (w: number, x: number, y: number, z: number, rotY = 0): void => {
    const bar = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.12), neon));
    bar.rotation.y = rotY;
    bar.position.set(x, y, z);
    g.add(bar);
  };
  const lightRod = (h: number, x: number, y: number, z: number): void => {
    const rod = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.09, h, 0.09), neon));
    rod.position.set(x, y, z);
    g.add(rod);
  };
  switch (kind) {
    case 'hq': {
      slab(5.4, 0.34, 5.4, 0, 0.17, 0, shadowPurple);
      slab(4.15, 0.34, 4.15, 0, 0.52, 0, dark);
      blade(1.2, 3.25, 0, 2.28, 0, coreMat);
      blade(0.55, 4.45, 0, 3.25, 0, shadowPurple);
      const crown = withShadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), neon));
      crown.position.y = 5.65;
      g.add(crown);
      for (const [x, z] of [[-2.05, -2.05], [2.05, -2.05], [-2.05, 2.05], [2.05, 2.05]] as const) {
        blade(0.28, 1.9, x, 1.3, z, coreMat);
        lightRod(0.9, x, 2.75, z);
      }
      lightBar(3.0, 0, 0.96, 2.1);
      lightBar(3.0, 0, 0.96, -2.1);
      panel(1.2, 1.1, -1.55, 1.25, 1.72, 0, shadowPurple);
      panel(1.2, 1.1, 1.55, 1.25, -1.72, 0, shadowPurple);
      addAntenna(g, -2.0, 0.7, -2.0, 2.8, accent);
      break;
    }
    case 'power': {
      slab(2.75, 0.32, 2.75, 0, 0.16, 0, shadowPurple);
      slab(1.85, 0.28, 1.85, 0, 0.46, 0, dark);
      blade(0.5, 2.15, 0, 1.6, 0, coreMat);
      const core = withShadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.62, 0), neon));
      core.position.y = 2.95;
      g.add(core);
      for (const [x, z] of [[-0.95, 0], [0.95, 0], [0, -0.95], [0, 0.95]] as const) {
        blade(0.16, 1.45, x, 1.08, z, shadowPurple);
        lightRod(0.85, x, 1.78, z);
      }
      lightBar(1.3, 0, 0.78, 1.0);
      addAntenna(g, 0.95, 0.42, -0.95, 1.35, accent);
      break;
    }
    case 'refinery': {
      slab(5.0, 0.34, 4.3, 0, 0.17, 0, shadowPurple);
      slab(3.55, 0.36, 2.75, -0.35, 0.52, 0, dark);
      blade(0.58, 2.35, -1.55, 1.75, 0.62, coreMat);
      blade(0.48, 1.9, 1.25, 1.52, -0.55, coreMat);
      prism(1.0, 1.1, 0.8, 1.55, 1.18, 1.1, Math.PI / 4, shadowPurple);
      panel(1.7, 1.2, 1.95, 1.28, 0, Math.PI / 2, coreMat);
      lightBar(2.65, -0.5, 0.92, 1.55);
      lightBar(1.4, 1.95, 1.38, 0, Math.PI / 2);
      break;
    }
    case 'barracks': {
      slab(3.7, 0.32, 3.7, 0, 0.16, 0, shadowPurple);
      slab(2.8, 0.9, 2.55, 0, 0.78, 0, coreMat);
      prism(0.42, 1.55, 2.75, -1.1, 1.28, 0, -0.16, dark);
      prism(0.42, 1.55, 2.75, 1.1, 1.28, 0, 0.16, dark);
      slab(1.25, 0.34, 2.95, 0, 1.42, 0, shadowPurple);
      for (const x of [-0.72, 0, 0.72]) lightRod(0.8, x, 1.85, 1.24);
      lightBar(1.9, 0, 0.86, 1.35);
      addAntenna(g, 1.35, 1.22, -1.2, 1.25, accent);
      break;
    }
    case 'factory': {
      slab(5.6, 0.34, 5.2, 0, 0.17, 0, shadowPurple);
      slab(4.25, 0.82, 3.7, 0, 0.78, 0.15, coreMat);
      slab(1.35, 1.75, 1.45, -1.55, 1.96, -1.1, dark);
      slab(1.65, 1.45, 1.55, 1.35, 1.78, 0.95, dark);
      prism(1.2, 0.92, 3.4, -2.2, 1.12, 0.2, -0.14, shadowPurple);
      prism(1.2, 0.92, 3.4, 2.2, 1.12, 0.2, 0.14, shadowPurple);
      lightBar(3.35, 0, 0.96, 2.05);
      lightBar(2.0, 1.05, 1.82, -1.62);
      for (const x of [-1.95, 1.95]) {
        const vent = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.25, 6), shadowPurple));
        vent.position.set(x, 1.92, -1.78);
        g.add(vent);
        lightRod(0.62, x, 2.55, -1.78);
      }
      break;
    }
    case 'tech': {
      slab(3.55, 0.32, 3.55, 0, 0.16, 0, shadowPurple);
      blade(0.88, 1.55, 0, 1.08, 0, dark);
      const core = withShadow(new THREE.Mesh(new THREE.OctahedronGeometry(1.05, 0), neon));
      core.position.y = 2.25;
      g.add(core);
      for (const [x, z] of [[-1.32, -1.32], [1.32, -1.32], [-1.32, 1.32], [1.32, 1.32]] as const) {
        blade(0.14, 2.25, x, 1.6, z, shadowPurple);
        lightRod(1.12, x, 2.28, z);
      }
      lightBar(1.55, 0, 0.82, 1.45);
      lightBar(1.55, 0, 0.82, -1.45);
      break;
    }
    case 'turret': {
      slab(1.95, 0.3, 1.95, 0, 0.15, 0, shadowPurple);
      blade(0.46, 0.85, 0, 0.72, 0, dark);
      const head = withShadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.72, 0), coreMat));
      head.position.y = 1.38;
      const lens = withShadow(new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), neon));
      lens.position.set(0, 1.38, 0.55);
      const barrel = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 1.65, 10), neon));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 1.38, 1.02);
      g.add(head, lens, barrel);
      break;
    }
  }
  void tileSize;
  return g;
}

// ---------------------- Projectile mesh ----------------------
export function makeProjectileMesh(color: number, behavior: WeaponBehavior = 'projectile'): THREE.Mesh {
  const radius = behavior === 'rocket' ? 0.28 : behavior === 'arc' ? 0.24 : behavior === 'bounce' ? 0.2 : 0.18;
  const geom = behavior === 'rocket'
    ? new THREE.ConeGeometry(radius, 0.75, 8)
    : new THREE.SphereGeometry(radius, 8, 8);
  const projectileColor = behavior === 'arc' ? 0xffa45e : behavior === 'bounce' ? 0xa6ff5e : color;
  const m = new THREE.MeshLambertMaterial({ color: projectileColor, emissive: projectileColor, flatShading: true });
  const mesh = new THREE.Mesh(geom, m);
  mesh.name = 'projectile';
  if (behavior === 'rocket') mesh.rotation.x = Math.PI / 2;
  return mesh;
}

// ---------------------- Resource node ----------------------
export function makeResourceMesh(color: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'resource';
  const core = withShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 0), mat(color, { emissive: color })));
  core.position.y = 0.7;
  g.add(core);
  for (let i = 0; i < 3; i++) {
    const shard = withShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), mat(color)));
    const a = (i / 3) * Math.PI * 2;
    shard.position.set(Math.cos(a) * 0.8, 0.35, Math.sin(a) * 0.8);
    g.add(shard);
  }
  return g;
}
