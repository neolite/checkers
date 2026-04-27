import * as THREE from 'three';
import type { VfxBudgetClass, VfxLayerKind, VfxLod, VfxParams } from '@vfx/types';

const DEFAULT_LIMITS: Record<VfxLayerKind, number> = {
  beam: 180,
  cone: 60,
  decal: 240,
  light: 18,
  mesh: 80,
  shockwave: 100,
  sprite: 360,
};

export class VfxBudget {
  private active: Record<VfxLayerKind, number> = {
    beam: 0,
    cone: 0,
    decal: 0,
    light: 0,
    mesh: 0,
    shockwave: 0,
    sprite: 0,
  };
  private expensiveThisFrame = 0;

  constructor(
    private camera: THREE.PerspectiveCamera | null,
    private limits: Record<VfxLayerKind, number> = DEFAULT_LIMITS,
    private maxExpensivePerFrame = 5,
  ) {}

  beginFrame(): void {
    this.expensiveThisFrame = 0;
  }

  chooseLod(params: VfxParams, budgetClass: VfxBudgetClass): VfxLod {
    if (!this.camera) return 'high';
    const dx = this.camera.position.x - params.x;
    const dz = this.camera.position.z - params.y;
    const d = Math.hypot(dx, dz);
    if (d < 44) return 'high';
    if (d < 92) return budgetClass === 'cheap' ? 'high' : 'medium';
    if (d < 150) return 'low';
    return budgetClass === 'expensive' ? 'culled' : 'low';
  }

  canSpawn(kind: VfxLayerKind, budgetClass: VfxBudgetClass, lod: VfxLod): boolean {
    if (lod === 'culled') return false;
    if (lod === 'low' && kind === 'sprite' && budgetClass !== 'expensive') return false;
    if (this.active[kind] >= this.limits[kind]) return false;
    if (budgetClass === 'expensive') {
      if (this.expensiveThisFrame >= this.maxExpensivePerFrame) return false;
      this.expensiveThisFrame += 1;
    }
    this.active[kind] += 1;
    return true;
  }

  release(kind: VfxLayerKind): void {
    this.active[kind] = Math.max(0, this.active[kind] - 1);
  }
}
