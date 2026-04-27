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
    const mat = makeGlowMaterial(color, opacity);
    const uniforms = mat.uniforms as GlowUniforms;
    const mesh = new THREE.Mesh(makeGeometry(layer), mat);
    mesh.renderOrder = 8;
    mesh.position.set(params.x, initialY(layer, radius, height), params.y);
    if (layer.shape === 'ring') mesh.rotation.x = Math.PI / 2;
    this.scene.add(mesh);

    return {
      obj: mesh,
      layerKind: 'mesh',
      lifeMs: layer.lifeMs ?? 650,
      update: (obj, t) => {
        const eased = 1 - Math.pow(1 - t, 3);
        const pulse = Math.sin(Math.PI * Math.min(1, t * 1.25));
        updateScale(layer, obj, radius, height, grow, eased);
        uniforms.uTime.value = t;
        uniforms.uOpacity.value = opacity * Math.max(0, (1 - t) * (0.35 + pulse * 0.65));
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
  if (layer.shape === 'column') return new THREE.CylinderGeometry(1, 0.28, 1, 48, 4, true);
  if (layer.shape === 'disc') return new THREE.CylinderGeometry(1, 1, 0.035, 96, 1, false);
  if (layer.shape === 'ring') return new THREE.TorusGeometry(1, 0.045, 10, 112);
  if (layer.shape === 'cap') return new THREE.SphereGeometry(1, 48, 16, 0, Math.PI * 2, 0, Math.PI * 0.62);
  if (layer.shape === 'dome') return new THREE.SphereGeometry(1, 48, 18, 0, Math.PI * 2, 0, Math.PI * 0.5);
  return new THREE.SphereGeometry(1, 32, 16);
}

function initialY(layer: VfxMeshLayer, radius: number, height: number): number {
  if (layer.shape === 'column') return (layer.y ?? 0) + height / 2;
  if (layer.shape === 'disc' || layer.shape === 'ring') return layer.y ?? 0.08;
  if (layer.shape === 'cap') return layer.y ?? radius * 1.25;
  if (layer.shape === 'dome') return layer.y ?? radius * 0.18;
  return layer.y ?? radius * 0.45;
}

function updateScale(layer: VfxMeshLayer, obj: THREE.Object3D, radius: number, height: number, grow: number, eased: number): void {
  if (layer.shape === 'column') {
    const r = radius * (0.16 + eased * grow);
    const h = height * (0.18 + eased * 0.95);
    obj.scale.set(r, h, r);
    obj.position.y = (layer.y ?? 0) + h / 2;
    return;
  }
  if (layer.shape === 'disc') {
    const r = radius * (0.18 + eased * grow);
    obj.scale.set(r, 1, r);
    return;
  }
  if (layer.shape === 'ring') {
    const r = radius * (0.22 + eased * grow);
    obj.scale.set(r, r, r);
    obj.rotation.z += 0.018;
    return;
  }
  if (layer.shape === 'cap') {
    const r = radius * (0.22 + eased * grow);
    obj.scale.set(r, Math.max(0.45, r * 0.28), r);
    obj.position.y = layer.y ?? radius * (0.92 + eased * 0.45);
    return;
  }
  if (layer.shape === 'dome') {
    const r = radius * (0.18 + eased * grow);
    obj.scale.set(r, Math.max(0.3, r * 0.36), r);
    return;
  }
  const r = radius * (0.18 + eased * grow);
  obj.scale.set(r, Math.max(0.7, r * 0.42), r);
}

function makeGlowMaterial(color: number, opacity: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalView;
      void main() {
        vUv = uv;
        vNormalView = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vNormalView;

      float band(float x, float speed, float sharpness) {
        return pow(0.5 + 0.5 * sin(x + uTime * speed), sharpness);
      }

      void main() {
        vec2 centered = vUv - vec2(0.5);
        float radial = smoothstep(0.72, 0.08, length(centered));
        float fresnel = pow(1.0 - abs(vNormalView.z), 1.75);
        float heat = band(vUv.y * 34.0 + centered.x * 8.0, 9.0, 2.6);
        float tornEdge = 0.62 + 0.38 * band(vUv.x * 52.0 + vUv.y * 19.0, 6.0, 3.5);
        float alpha = uOpacity * max(radial, fresnel * 0.85) * (0.58 + heat * 0.42) * tornEdge;
        vec3 hot = mix(uColor * 0.65, vec3(1.0, 0.92, 0.72), heat * 0.55);
        gl_FragColor = vec4(hot, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

type GlowUniforms = {
  uColor: { value: THREE.Color };
  uOpacity: { value: number };
  uTime: { value: number };
};
