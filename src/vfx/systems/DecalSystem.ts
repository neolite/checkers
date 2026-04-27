import * as THREE from 'three';
import type { VfxAssets } from '@vfx/VfxAssets';
import type { RuntimeVfxItem, VfxDecalLayer, VfxParams } from '@vfx/types';

export class DecalSystem {
  constructor(private scene: THREE.Scene, private assets: VfxAssets) {}

  decal(layer: VfxDecalLayer, params: VfxParams, lodScale: number): RuntimeVfxItem {
    const radius = (params.radius ?? layer.radius ?? 1.2) * lodScale;
    const mat = new THREE.MeshBasicMaterial({
      map: this.assets.texture(layer.texture),
      color: layer.color ?? params.color ?? 0xffffff,
      transparent: true,
      opacity: layer.opacity ?? 0.46,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 36), mat);
    mesh.position.set(params.x, layer.y ?? 0.075, params.y);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = layer.randomRotation ? Math.random() * Math.PI * 2 : 0;
    mesh.scale.set(radius, radius, 1);
    mesh.renderOrder = 2;
    this.scene.add(mesh);
    return {
      obj: mesh,
      delayMs: layer.delayMs ?? 0,
      layerKind: 'decal',
      lifeMs: layer.lifeMs ?? 30000,
      update: (obj, t) => {
        const m = (obj as THREE.Mesh).material as THREE.MeshBasicMaterial;
        m.opacity = (layer.opacity ?? 0.46) * Math.min(1, (1 - t) * 4);
      },
    };
  }
}
