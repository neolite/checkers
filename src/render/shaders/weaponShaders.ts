import * as THREE from 'three';

const commonVertex = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export function makeBeamGeometry(length: number, width: number): THREE.BufferGeometry {
  const hx = length / 2;
  const hz = width / 2;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute([-hx, 0, -hz, hx, 0, -hz, hx, 0, hz, -hx, 0, hz], 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geom.setIndex([0, 1, 2, 0, 2, 3]);
  geom.computeVertexNormals();
  return geom;
}

export function makeProjectileTrailGeometry(length: number, width: number): THREE.BufferGeometry {
  const hw = width / 2;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute([-hw, 0, -length, hw, 0, -length, hw, 0, 0, -hw, 0, 0], 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 1, 1, 1, 1, 0], 2));
  geom.setIndex([0, 1, 2, 0, 2, 3]);
  geom.computeVertexNormals();
  return geom;
}

export function makeBeamMaterial(color: number, electric: boolean): THREE.ShaderMaterial {
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
    vertexShader: commonVertex,
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

export function makeShockwaveMaterial(color: number): THREE.ShaderMaterial {
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
    vertexShader: commonVertex,
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

export function makeProjectileTrailMaterial(color: number, hotColor = 0xffffff): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uHot: { value: new THREE.Color(hotColor) },
      uTime: { value: 0 },
      uFade: { value: 1 },
    },
    vertexShader: commonVertex,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uHot;
      uniform float uTime;
      uniform float uFade;
      varying vec2 vUv;

      float hash(float p) {
        return fract(sin(p * 91.345) * 47453.5453);
      }

      void main() {
        float side = abs(vUv.y - 0.5) * 2.0;
        float core = 1.0 - smoothstep(0.0, 0.42, side);
        float halo = 1.0 - smoothstep(0.05, 1.0, side);
        float tail = smoothstep(0.0, 0.22, vUv.x);
        float noise = hash(floor((vUv.x + uTime * 1.35) * 16.0)) * 0.32;
        float wave = 0.72 + 0.28 * sin((vUv.x * 8.0 - uTime * 9.0 + noise) * 6.28318);
        float alpha = (pow(core, 1.45) * 0.82 + halo * 0.28) * tail * wave * uFade;
        vec3 color = mix(uColor, uHot, pow(core, 2.5) * 0.75);
        gl_FragColor = vec4(color, alpha);
      }
    `,
  });
}
