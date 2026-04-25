import * as THREE from 'three';
import { makeBeamGeometry, makeBeamMaterial, makeShockwaveMaterial } from '@render/shaders/weaponShaders';
import type { RuntimeVfxItem, VfxBeamLayer, VfxConeLayer, VfxParams, VfxShockwaveLayer } from '@vfx/types';

export class BeamSystem {
  constructor(private scene: THREE.Scene) {}

  beam(layer: VfxBeamLayer, params: VfxParams, lodScale: number): RuntimeVfxItem | null {
    if (params.tx === undefined || params.ty === undefined) return null;
    const len = Math.hypot(params.tx - params.x, params.ty - params.y);
    if (len <= 0.001) return null;
    const width = (params.width ?? layer.width ?? 0.35) * lodScale;
    const geom = makeBeamGeometry(len, Math.max(0.08, width));
    const mat = makeBeamMaterial(layer.color ?? params.color ?? 0xffffff, layer.electric ?? false);
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set((params.x + params.tx) / 2, layer.y ?? 1.35, (params.y + params.ty) / 2);
    mesh.rotation.y = -Math.atan2(params.ty - params.y, params.tx - params.x);
    this.scene.add(mesh);
    return {
      obj: mesh,
      layerKind: 'beam',
      lifeMs: layer.lifeMs ?? 150,
      update: (obj, t) => {
        const m = (obj as THREE.Mesh).material as THREE.ShaderMaterial;
        m.uniforms['uTime']!.value = t * 2.2;
        m.uniforms['uFade']!.value = 1 - t;
      },
    };
  }

  cone(layer: VfxConeLayer, params: VfxParams, lodScale: number): RuntimeVfxItem | null {
    if (params.tx === undefined || params.ty === undefined) return null;
    const range = (params.radius ?? layer.radius ?? 5) * lodScale;
    const angle = Math.atan2(params.ty - params.y, params.tx - params.x);
    const half = (((params.angleDeg ?? layer.angleDeg ?? 50) * Math.PI) / 180) / 2;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    for (let i = 0; i <= 10; i++) {
      const a = -half + (i / 10) * half * 2;
      shape.lineTo(Math.cos(a) * range, Math.sin(a) * range);
    }
    shape.lineTo(0, 0);
    const mesh = new THREE.Mesh(
      new THREE.ShapeGeometry(shape),
      new THREE.MeshBasicMaterial({
        color: layer.color ?? params.color ?? 0xffffff,
        transparent: true,
        opacity: layer.opacity ?? 0.24,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = angle;
    mesh.position.set(params.x, layer.y ?? 0.08, params.y);
    this.scene.add(mesh);
    return {
      obj: mesh,
      layerKind: 'cone',
      lifeMs: layer.lifeMs ?? 180,
      update: (obj, t) => {
        const m = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = (layer.opacity ?? 0.24) * (1 - t);
      },
    };
  }

  shockwave(layer: VfxShockwaveLayer, params: VfxParams, lodScale: number): RuntimeVfxItem {
    const radius = (params.radius ?? layer.radius ?? 1.5) * lodScale;
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 1, 32),
      makeShockwaveMaterial(layer.color ?? params.color ?? 0xffffff),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(params.x, layer.y ?? 0.1, params.y);
    this.scene.add(mesh);
    return {
      obj: mesh,
      layerKind: 'shockwave',
      lifeMs: layer.lifeMs ?? 240,
      update: (obj, t) => {
        obj.scale.setScalar(radius * (0.2 + t * 0.8));
        const m = (obj as THREE.Mesh).material as THREE.ShaderMaterial;
        m.uniforms['uFade']!.value = 1 - t;
        m.uniforms['uTime']!.value = t;
      },
    };
  }
}
