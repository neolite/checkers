import * as THREE from 'three';
import type { UnitKind } from '@config/units';
import type { WeaponBehavior } from '@config/gameplay';
import type { BuildingKind } from '@config/buildings';
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
  const coreMat = mat(primary);
  const neon = mat(accent, { emissive: accent });
  const black = mat(0x0b0f18);
  const dark = mat(0x151b29);
  const slab = (w: number, h: number, d: number, x: number, y: number, z: number, material = coreMat): THREE.Mesh => {
    const m = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material));
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const blade = (r: number, h: number, x: number, y: number, z: number, material = coreMat): void => {
    const m = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.72, r, h, 6), material));
    m.rotation.y = Math.PI / 6;
    m.position.set(x, y, z);
    g.add(m);
  };
  const lightBar = (w: number, x: number, y: number, z: number, rotY = 0): void => {
    const bar = withShadow(new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.12), neon));
    bar.rotation.y = rotY;
    bar.position.set(x, y, z);
    g.add(bar);
  };
  switch (kind) {
    case 'hq': {
      slab(5.8, 0.45, 5.8, 0, 0.23, 0, black);
      slab(4.5, 0.45, 4.5, 0, 0.7, 0, dark);
      blade(1.45, 4.8, 0, 3.05, 0, coreMat);
      blade(0.85, 6.2, 0, 4.2, 0, neon);
      for (const [x, z] of [[-2.4, -2.4], [2.4, -2.4], [-2.4, 2.4], [2.4, 2.4]] as const) {
        blade(0.34, 2.2, x, 1.55, z, dark);
      }
      lightBar(3.6, 0, 1.05, 2.35);
      lightBar(3.6, 0, 1.05, -2.35);
      addAntenna(g, -2.15, 0.95, -2.15, 3.4, accent);
      break;
    }
    case 'power': {
      slab(2.6, 0.4, 2.6, 0, 0.2, 0, black);
      blade(0.62, 1.7, 0, 1.1, 0, dark);
      for (let i = 0; i < 3; i++) {
        const ring = withShadow(new THREE.Mesh(new THREE.TorusGeometry(0.72 + i * 0.22, 0.045, 8, 28), neon));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 1.75 + i * 0.22;
        g.add(ring);
      }
      addAntenna(g, 0.95, 0.42, -0.95, 1.6, accent);
      break;
    }
    case 'refinery': {
      slab(5.2, 0.45, 4.8, 0, 0.23, 0, black);
      slab(4.1, 0.5, 3.4, 0, 0.72, 0, dark);
      blade(0.7, 2.6, -1.35, 2.05, 0.65, coreMat);
      blade(0.58, 2.1, 1.25, 1.78, -0.65, coreMat);
      const intake = withShadow(new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.11, 8, 22), neon));
      intake.rotation.x = Math.PI / 2;
      intake.position.set(1.75, 1.28, 1.25);
      g.add(intake);
      lightBar(2.8, -0.55, 1.1, 1.82);
      break;
    }
    case 'barracks': {
      slab(3.8, 0.45, 3.8, 0, 0.23, 0, black);
      slab(3.0, 1.15, 2.8, 0, 0.98, 0, coreMat);
      slab(2.15, 0.42, 3.45, 0, 1.78, 0, dark);
      for (const x of [-1.15, 0, 1.15]) {
        slab(0.32, 1.05, 0.22, x, 2.25, 1.4, neon);
      }
      addAntenna(g, 1.35, 1.62, -1.2, 1.45, accent);
      break;
    }
    case 'factory': {
      slab(5.8, 0.45, 5.8, 0, 0.23, 0, black);
      slab(4.7, 1.2, 4.5, 0, 1.05, 0, coreMat);
      slab(2.2, 2.2, 2.2, -1.45, 2.45, -1.25, dark);
      slab(1.65, 1.8, 1.65, 1.55, 2.2, 1.05, dark);
      lightBar(3.6, 0, 1.16, 2.35);
      lightBar(2.4, 1.15, 2.05, -1.95);
      for (const x of [-2.1, 2.1]) {
        const vent = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 1.5, 6), black));
        vent.position.set(x, 2.2, -2.1);
        g.add(vent);
      }
      break;
    }
    case 'tech': {
      slab(3.6, 0.45, 3.6, 0, 0.23, 0, black);
      blade(1.15, 1.7, 0, 1.15, 0, dark);
      const core = withShadow(new THREE.Mesh(new THREE.OctahedronGeometry(1.25, 0), neon));
      core.position.y = 2.35;
      g.add(core);
      for (let i = 0; i < 3; i++) {
        const ring = withShadow(new THREE.Mesh(new THREE.TorusGeometry(1.15 + i * 0.18, 0.035, 8, 28), neon));
        ring.rotation.x = Math.PI / 2;
        ring.rotation.z = i * 0.45;
        ring.position.y = 2.35;
        g.add(ring);
      }
      break;
    }
    case 'turret': {
      slab(1.9, 0.38, 1.9, 0, 0.19, 0, black);
      blade(0.55, 0.95, 0, 0.82, 0, dark);
      const head = withShadow(new THREE.Mesh(new THREE.OctahedronGeometry(0.85, 0), neon));
      head.position.y = 1.55;
      const barrel = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 10), neon));
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 1.55, 1.05);
      g.add(head, barrel);
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
