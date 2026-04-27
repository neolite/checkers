import * as THREE from 'three';
import type { RuntimeVfxItem, VfxLightLayer, VfxMeshLayer, VfxParams } from '@vfx/types';

export class MeshEffectSystem {
  constructor(private scene: THREE.Scene) {}

  glowMesh(layer: VfxMeshLayer, params: VfxParams, lodScale: number): RuntimeVfxItem {
    const color = layer.color ?? params.color ?? 0xffffff;
    const radius = (layer.radius ?? params.radius ?? 1.5) * lodScale;
    const height = (layer.height ?? radius * 2) * lodScale;
    const opacity = layer.opacity ?? 0.32;
    const grow = layer.grow ?? 1.0;
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(makeGeometry(layer), mat);
    mesh.renderOrder = 8;
    mesh.position.set(params.x, layer.shape === 'column' ? (layer.y ?? 0) + height / 2 : (layer.y ?? radius * 0.45), params.y);
    this.scene.add(mesh);

    return {
      obj: mesh,
      layerKind: 'mesh',
      lifeMs: layer.lifeMs ?? 650,
      update: (obj, t) => {
        const eased = 1 - Math.pow(1 - t, 3);
        const pulse = Math.sin(Math.PI * Math.min(1, t * 1.25));
        if (layer.shape === 'column') {
          const r = radius * (0.22 + eased * grow);
          const h = height * (0.25 + eased * 0.9);
          obj.scale.set(r, h, r);
          obj.position.y = (layer.y ?? 0) + h / 2;
        } else {
          const r = radius * (0.18 + eased * grow);
          obj.scale.set(r, Math.max(0.7, r * 0.42), r);
        }
        mat.opacity = opacity * Math.max(0, (1 - t) * (0.35 + pulse * 0.65));
      },
    };
  }

  light(layer: VfxLightLayer, params: VfxParams, lodScale: number): RuntimeVfxItem {
    const intensity = (layer.intensity ?? 4.5) * lodScale;
    const distance = (layer.distance ?? (params.radius ?? 8) * 4) * lodScale;
    const light = new THREE.PointLight(layer.color ?? params.color ?? 0xffc07a, intensity, distance, 2);
    light.position.set(params.x, layer.y ?? 5.5, params.y);
    this.scene.add(light);
    return {
      obj: light,
      layerKind: 'light',
      lifeMs: layer.lifeMs ?? 300,
      update: (obj, t) => {
        (obj as THREE.PointLight).intensity = intensity * Math.pow(1 - t, 2);
      },
    };
  }
}

function makeGeometry(layer: VfxMeshLayer): THREE.BufferGeometry {
  if (layer.shape === 'column') return new THREE.CylinderGeometry(1, 0.42, 1, 32, 1, true);
  return new THREE.SphereGeometry(1, 32, 16);
}
