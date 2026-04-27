import * as THREE from 'three';
import type { VfxAssets } from '@vfx/VfxAssets';
import type { RuntimeVfxItem, VfxParams, VfxSpriteLayer } from '@vfx/types';

export class SpriteBurstSystem {
  constructor(private scene: THREE.Scene, private assets: VfxAssets) {}

  sprite(layer: VfxSpriteLayer, params: VfxParams, lodScale: number): RuntimeVfxItem {
    const size = (layer.size ?? params.radius ?? 1) * lodScale;
    const mat = new THREE.SpriteMaterial({
      map: this.assets.texture(layer.texture),
      color: layer.color ?? params.color ?? 0xffffff,
      transparent: true,
      opacity: layer.opacity ?? 0.9,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(mat);
    const baseX = params.x + (layer.offsetX ?? 0);
    const baseY = layer.y ?? 1.35;
    const baseZ = params.y + (layer.offsetZ ?? 0);
    sprite.position.set(baseX, baseY, baseZ);
    sprite.scale.set(size, size, size);
    if (layer.randomRotation) sprite.material.rotation = Math.random() * Math.PI * 2;
    this.scene.add(sprite);
    return {
      obj: sprite,
      delayMs: layer.delayMs ?? 0,
      layerKind: 'sprite',
      lifeMs: layer.lifeMs ?? 260,
      update: (obj, t) => {
        const spr = obj as THREE.Sprite;
        const grow = layer.grow ?? 0.7;
        spr.position.set(baseX, baseY + (layer.rise ?? 0) * t, baseZ);
        spr.scale.setScalar(size * (1 + t * grow));
        (spr.material as THREE.SpriteMaterial).opacity = (layer.opacity ?? 0.9) * (1 - t);
      },
    };
  }
}
