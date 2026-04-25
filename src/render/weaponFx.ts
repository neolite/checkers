import * as THREE from 'three';
import type { World } from '@engine/world';
import { FACTION_COLORS } from '@config/palette';

interface FxItem {
  obj: THREE.Object3D;
  ageMs: number;
  lifeMs: number;
  update?: (obj: THREE.Object3D, t: number) => void;
}

export interface WeaponFxHandle {
  tick(dtMs: number): void;
  destroy(): void;
}

export function mountWeaponFx(world: World, scene: THREE.Scene): WeaponFxHandle {
  const items: FxItem[] = [];
  const loader = new THREE.TextureLoader();
  const textures = {
    spark: loader.load('/assets/kenney/particle-pack/spark_02.png'),
    flame: loader.load('/assets/kenney/particle-pack/flame_02.png'),
    magic: loader.load('/assets/kenney/particle-pack/magic_02.png'),
    smoke: loader.load('/assets/kenney/particle-pack/smoke_03.png'),
  };
  const offs = [
    world.bus.on('weapon:effect', (ev) => {
      const color = FACTION_COLORS[ev.faction].accent;
      if (ev.behavior === 'line') {
        addBeam(items, scene, ev.x, ev.y, ev.tx, ev.ty, color, ev.width ?? 0.45, 150);
      } else if (ev.behavior === 'cone') {
        addCone(items, scene, ev.x, ev.y, ev.tx, ev.ty, color, ev.radius ?? 5, ev.angleDeg ?? 50, 180);
      } else if (ev.behavior === 'chain') {
        const pts = ev.points ?? [{ x: ev.x, y: ev.y }, { x: ev.tx, y: ev.ty }];
        for (let i = 0; i < pts.length - 1; i++) {
          addBeam(items, scene, pts[i]!.x, pts[i]!.y, pts[i + 1]!.x, pts[i + 1]!.y, 0x7cefff, 0.25, 180, true);
        }
      } else if (ev.behavior === 'bounce') {
        addBeam(items, scene, ev.x, ev.y, ev.tx, ev.ty, color, 0.18, 110, true);
      } else if (ev.behavior === 'ambush') {
        addRing(items, scene, ev.tx, ev.ty, 0xffb15e, ev.radius ?? 4.5, 320);
      }
    }),
    world.bus.on('projectile:impact', (ev) => {
      const radius = ev.behavior === 'arc' ? 2.6 : ev.behavior === 'rocket' ? 1.8 : ev.behavior === 'bounce' ? 1.0 : 0.7;
      const color = ev.behavior === 'chain' ? 0x7cefff : ev.klass === 'aStructure' ? 0xffa45e : ev.klass === 'aArmor' ? 0x8ec8ff : 0xfff0a0;
      const tex = ev.behavior === 'arc' || ev.behavior === 'rocket' ? textures.flame : ev.behavior === 'bounce' ? textures.magic : textures.spark;
      addBillboard(items, scene, ev.x, ev.y, tex, color, radius * 1.6, 260);
      addRing(items, scene, ev.x, ev.y, color, radius, 240);
    }),
  ];

  return {
    tick(dtMs: number): void {
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i]!;
        item.ageMs += dtMs;
        const t = Math.max(0, Math.min(1, item.ageMs / item.lifeMs));
        item.update?.(item.obj, t);
        if (t >= 1) {
          scene.remove(item.obj);
          disposeObject(item.obj);
          items.splice(i, 1);
        }
      }
    },
    destroy(): void {
      for (const off of offs) off();
      for (const item of items) {
        scene.remove(item.obj);
        disposeObject(item.obj);
      }
      items.length = 0;
      for (const tex of Object.values(textures)) tex.dispose();
    },
  };
}

function addBeam(
  items: FxItem[],
  scene: THREE.Scene,
  x: number,
  y: number,
  tx: number,
  ty: number,
  color: number,
  width: number,
  lifeMs: number,
  jitter = false,
): void {
  const len = Math.hypot(tx - x, ty - y);
  if (len <= 0.001) return;
  const midX = (x + tx) / 2;
  const midY = (y + ty) / 2;
  const jx = jitter ? (Math.random() - 0.5) * width * 2 : 0;
  const jy = jitter ? (Math.random() - 0.5) * width * 2 : 0;
  const geom = makeBeamGeometry(len, Math.max(0.12, width));
  const mat = makeBeamMaterial(color, jitter);
  const line = new THREE.Mesh(geom, mat);
  line.position.set(midX + jx, jitter ? 1.55 : 1.35, midY + jy);
  line.rotation.y = -Math.atan2(ty - y, tx - x);
  scene.add(line);
  items.push({
    obj: line,
    ageMs: 0,
    lifeMs,
    update: (obj, t) => {
      const m = (obj as THREE.Mesh).material as THREE.ShaderMaterial;
      m.uniforms['uTime']!.value = t * 2.2;
      m.uniforms['uFade']!.value = 1 - t;
    },
  });
}

function addCone(items: FxItem[], scene: THREE.Scene, x: number, y: number, tx: number, ty: number, color: number, range: number, angleDeg: number, lifeMs: number): void {
  const angle = Math.atan2(ty - y, tx - x);
  const half = (angleDeg * Math.PI / 180) / 2;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const a = -half + (i / steps) * half * 2;
    shape.lineTo(Math.cos(a) * range, Math.sin(a) * range);
  }
  shape.lineTo(0, 0);
  const geom = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = angle;
  mesh.position.set(x, 0.08, y);
  scene.add(mesh);
  items.push({
    obj: mesh,
    ageMs: 0,
    lifeMs,
    update: (obj, t) => {
      const m = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
      m.opacity = 0.28 * (1 - t);
    },
  });
}

function addRing(items: FxItem[], scene: THREE.Scene, x: number, y: number, color: number, radius: number, lifeMs: number): void {
  const geom = new THREE.RingGeometry(0.2, 1, 32);
  const mat = makeShockwaveMaterial(color);
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(x, 0.1, y);
  scene.add(mesh);
  items.push({
    obj: mesh,
    ageMs: 0,
    lifeMs,
    update: (obj, t) => {
      obj.scale.setScalar(radius * (0.2 + t * 0.8));
      const m = (obj as THREE.Mesh).material as THREE.ShaderMaterial;
      m.uniforms['uFade']!.value = 1 - t;
      m.uniforms['uTime']!.value = t;
    },
  });
}

function addBillboard(
  items: FxItem[],
  scene: THREE.Scene,
  x: number,
  y: number,
  texture: THREE.Texture,
  color: number,
  size: number,
  lifeMs: number,
): void {
  const mat = new THREE.SpriteMaterial({ map: texture, color, transparent: true, opacity: 0.9, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.position.set(x, 1.4, y);
  sprite.scale.set(size, size, size);
  scene.add(sprite);
  items.push({
    obj: sprite,
    ageMs: 0,
    lifeMs,
    update: (obj, t) => {
      obj.scale.setScalar(size * (1 + t * 0.8));
      const m = (obj as THREE.Sprite).material as THREE.SpriteMaterial;
      m.opacity = 0.9 * (1 - t);
    },
  });
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const m = child as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = (m as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else if (mat) mat.dispose();
  });
}

function makeBeamGeometry(length: number, width: number): THREE.BufferGeometry {
  const hx = length / 2;
  const hz = width / 2;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute([-hx, 0, -hz, hx, 0, -hz, hx, 0, hz, -hx, 0, hz], 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geom.setIndex([0, 1, 2, 0, 2, 3]);
  geom.computeVertexNormals();
  return geom;
}

function makeBeamMaterial(color: number, electric: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uFade: { value: 1 },
      uElectric: { value: electric ? 1 : 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uFade;
      uniform int uElectric;
      varying vec2 vUv;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        float y = abs(vUv.y - 0.5) * 2.0;
        float core = 1.0 - smoothstep(0.0, 0.36, y);
        float halo = 1.0 - smoothstep(0.08, 1.0, y);
        float endFade = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
        float scan = 0.75 + 0.25 * sin((vUv.x * 11.0 - uTime * 7.0) * 6.28318);
        float jitter = uElectric == 1 ? hash(floor(vec2(vUv.x * 18.0 + uTime * 6.0, vUv.y * 5.0))) * 0.28 : 0.0;
        float alpha = (core * 0.95 + halo * 0.35 + jitter) * scan * endFade * uFade;
        vec3 hot = mix(uColor, vec3(1.0), core * 0.78);
        gl_FragColor = vec4(hot, alpha);
      }
    `,
  });
}

function makeShockwaveMaterial(color: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uTime: { value: 0 },
      uFade: { value: 1 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uFade;
      varying vec2 vUv;

      void main() {
        float d = abs(distance(vUv, vec2(0.5)) - 0.36);
        float ring = 1.0 - smoothstep(0.0, 0.12, d);
        float crackle = 0.8 + 0.2 * sin((vUv.x + vUv.y + uTime * 1.7) * 38.0);
        gl_FragColor = vec4(mix(uColor, vec3(1.0), 0.35), ring * crackle * uFade * 0.75);
      }
    `,
  });
}
