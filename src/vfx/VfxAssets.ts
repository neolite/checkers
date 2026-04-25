import * as THREE from 'three';
import type { VfxTextureId } from '@vfx/types';

export class VfxAssets {
  private loader = new THREE.TextureLoader();
  private textures = new Map<VfxTextureId, THREE.Texture>();

  texture(id: VfxTextureId): THREE.Texture {
    const found = this.textures.get(id);
    if (found) return found;
    const tex = id === 'scorch' || id === 'crater'
      ? makeDecalTexture(id)
      : this.loader.load(assetPath(id));
    tex.needsUpdate = true;
    this.textures.set(id, tex);
    return tex;
  }

  destroy(): void {
    for (const tex of this.textures.values()) tex.dispose();
    this.textures.clear();
  }
}

function assetPath(id: VfxTextureId): string {
  switch (id) {
    case 'spark': return '/assets/kenney/particle-pack/spark_02.png';
    case 'flame': return '/assets/kenney/particle-pack/flame_02.png';
    case 'magic': return '/assets/kenney/particle-pack/magic_02.png';
    case 'smoke': return '/assets/kenney/particle-pack/smoke_03.png';
    case 'trace': return '/assets/kenney/particle-pack/trace_04.png';
    case 'scorch':
    case 'crater':
      return '';
  }
}

function makeDecalTexture(id: Extract<VfxTextureId, 'scorch' | 'crater'>): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;
  const gradient = ctx.createRadialGradient(cx, cy, size * 0.08, cx, cy, size * 0.48);
  if (id === 'crater') {
    gradient.addColorStop(0, 'rgba(20,16,13,0.90)');
    gradient.addColorStop(0.42, 'rgba(45,34,26,0.58)');
    gradient.addColorStop(0.72, 'rgba(28,22,18,0.22)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    gradient.addColorStop(0, 'rgba(10,7,5,0.76)');
    gradient.addColorStop(0.48, 'rgba(45,24,12,0.42)');
    gradient.addColorStop(0.82, 'rgba(255,104,31,0.10)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  ctx.globalCompositeOperation = 'screen';
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = size * (0.08 + Math.random() * 0.28);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    ctx.fillStyle = id === 'crater' ? 'rgba(115,90,66,0.18)' : 'rgba(255,139,55,0.14)';
    ctx.beginPath();
    ctx.arc(x, y, 2 + Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
