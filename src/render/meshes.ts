import * as THREE from 'three';
import type { UnitKind } from '@config/units';
import type { WeaponBehavior } from '@config/gameplay';
import type { BuildingKind } from '@config/buildings';

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
      const body = withShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.8, 0), mat(primary)));
      body.position.y = 0.8;
      const orb = withShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), mat(accent, { emissive: accent })));
      orb.position.set(0, 1.3, 0);
      g.add(body, orb);
      break;
    }
    case 'harvesterTitan': {
      const body = withShadow(new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 2.1), mat(primary)));
      body.position.y = 0.6;
      const stack = withShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 0.9, 8), mat(accent)));
      stack.position.set(-0.55, 1.4, -0.6);
      g.add(body, stack);
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
      const body = withShadow(new THREE.Mesh(new THREE.ConeGeometry(0.34, 1.0, 6), mat(primary)));
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
      const body = withShadow(new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 8), mat(primary)));
      body.rotation.x = Math.PI;
      body.position.y = 0.7;
      const eyes = withShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), mat(accent, { emissive: accent })));
      eyes.position.set(0, 0.9, 0.35);
      g.add(body, eyes);
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
      g.add(base, torso, coil);
      break;
    }
    case 'swarmlet': {
      const body = withShadow(new THREE.Mesh(new THREE.IcosahedronGeometry(0.4, 0), mat(primary)));
      body.position.y = 0.4;
      const wing = withShadow(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.2), mat(accent)));
      wing.position.y = 0.45;
      const fuse = withShadow(new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 6), mat(accent, { emissive: accent })));
      fuse.position.set(0, 0.52, 0.42);
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
      break;
    }
  }
  return g;
}

// ---------------------- Building meshes ----------------------
export function makeBuildingMesh(kind: BuildingKind, primary: number, accent: number, tileSize: number): THREE.Group {
  const g = new THREE.Group();
  g.name = `building:${kind}`;
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
