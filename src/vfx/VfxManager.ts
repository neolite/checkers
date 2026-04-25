import * as THREE from 'three';
import { VfxAssets } from '@vfx/VfxAssets';
import { VfxBudget } from '@vfx/VfxBudget';
import { VfxRegistry } from '@vfx/VfxRegistry';
import { VFX_PRESETS } from '@vfx/presets/weapons';
import { AttachedLoopSystem, type ResolveVfxAttachment } from '@vfx/systems/AttachedLoopSystem';
import { BeamSystem } from '@vfx/systems/BeamSystem';
import { DecalSystem } from '@vfx/systems/DecalSystem';
import { SpriteBurstSystem } from '@vfx/systems/SpriteBurstSystem';
import type { RuntimeVfxItem, VfxAttachmentTarget, VfxLayer, VfxLayerKind, VfxLod, VfxParams, VfxPreset } from '@vfx/types';

interface VfxInstance {
  id: number;
  preset: VfxPreset;
  params: VfxParams;
  ageMs: number;
  items: RuntimeVfxItem[];
  attachTarget: VfxAttachmentTarget | null;
  detachRequested: boolean;
}

let nextInstanceId = 1;

export class VfxManager {
  private instances = new Set<VfxInstance>();
  private attachedByKey = new Map<string, VfxInstance>();
  private assets = new VfxAssets();
  private registry = new VfxRegistry(VFX_PRESETS);
  private budget: VfxBudget;
  private attached: AttachedLoopSystem;
  private beams: BeamSystem;
  private sprites: SpriteBurstSystem;
  private decals: DecalSystem;

  constructor(
    private scene: THREE.Scene,
    camera: THREE.PerspectiveCamera | null,
    resolveAttachment: ResolveVfxAttachment,
  ) {
    this.budget = new VfxBudget(camera);
    this.attached = new AttachedLoopSystem(resolveAttachment);
    this.beams = new BeamSystem(scene);
    this.sprites = new SpriteBurstSystem(scene, this.assets);
    this.decals = new DecalSystem(scene, this.assets);
  }

  play(name: string, params: VfxParams): void {
    const preset = this.registry.get(name);
    if (!preset) return;
    const lod = this.budget.chooseLod(params, preset.budgetClass);
    if (lod === 'culled') return;
    const instance = this.createInstance(preset, params, lod, null);
    if (!instance) return;
    this.instances.add(instance);
  }

  ensureAttached(target: VfxAttachmentTarget, name: string, params: VfxParams): void {
    const key = attachKey(target, name);
    if (this.attachedByKey.has(key)) return;
    const preset = this.registry.get(name);
    if (!preset) return;
    const info = this.attached.position(target);
    if (!info || !info.visible) return;
    const merged: VfxParams = { ...params, x: info.x, y: info.y };
    const lod = this.budget.chooseLod(merged, preset.budgetClass);
    if (lod === 'culled') return;
    const instance = this.createInstance(preset, merged, lod, target);
    if (!instance) return;
    this.instances.add(instance);
    this.attachedByKey.set(key, instance);
  }

  detach(target: VfxAttachmentTarget, name?: string): void {
    const prefix = `${target.isBuilding ? 'b' : 'u'}:${target.id}:`;
    for (const [key, instance] of this.attachedByKey) {
      if (!key.startsWith(prefix)) continue;
      if (name && key !== attachKey(target, name)) continue;
      instance.detachRequested = true;
      this.attachedByKey.delete(key);
    }
  }

  tick(dtMs: number): void {
    this.budget.beginFrame();
    for (const instance of [...this.instances]) {
      this.updateAttachment(instance);
      instance.ageMs += dtMs;
      const done = !instance.preset.loop && instance.ageMs >= instance.preset.durationMs;
      for (const item of instance.items) {
        const localAge = instance.preset.loop ? instance.ageMs % item.lifeMs : Math.min(instance.ageMs, item.lifeMs);
        const t = Math.max(0, Math.min(1, localAge / item.lifeMs));
        item.update?.(item.obj, t, localAge);
      }
      if (done || instance.detachRequested) this.release(instance);
    }
  }

  destroy(): void {
    for (const instance of [...this.instances]) this.release(instance);
    this.attachedByKey.clear();
    this.assets.destroy();
  }

  private createInstance(preset: VfxPreset, params: VfxParams, lod: VfxLod, attachTarget: VfxAttachmentTarget | null): VfxInstance | null {
    const items: RuntimeVfxItem[] = [];
    const lodScale = lod === 'low' ? 0.72 : lod === 'medium' ? 0.88 : 1;
    for (const layer of preset.layers) {
      const item = this.createLayer(layer, params, lod, lodScale);
      if (item) items.push(item);
    }
    if (items.length === 0) return null;
    return {
      id: nextInstanceId++,
      preset,
      params,
      ageMs: 0,
      items,
      attachTarget,
      detachRequested: false,
    };
  }

  private createLayer(layer: VfxLayer, params: VfxParams, lod: VfxLod, lodScale: number): RuntimeVfxItem | null {
    const budgetClass = layer.budgetClass ?? 'cheap';
    if (!this.budget.canSpawn(layer.type, budgetClass, lod)) return null;
    const item = this.spawnLayer(layer, params, lodScale);
    if (!item) {
      this.budget.release(layer.type);
      return null;
    }
    return item;
  }

  private spawnLayer(layer: VfxLayer, params: VfxParams, lodScale: number): RuntimeVfxItem | null {
    switch (layer.type) {
      case 'beam':
        return this.beams.beam(layer, params, lodScale);
      case 'cone':
        return this.beams.cone(layer, params, lodScale);
      case 'decal':
        return this.decals.decal(layer, params, lodScale);
      case 'shockwave':
        return this.beams.shockwave(layer, params, lodScale);
      case 'sprite':
        return this.sprites.sprite(layer, params, lodScale);
    }
  }

  private updateAttachment(instance: VfxInstance): void {
    if (!instance.attachTarget) return;
    const info = this.attached.position(instance.attachTarget);
    if (!info) {
      instance.detachRequested = true;
      return;
    }
    for (const item of instance.items) {
      item.obj.visible = info.visible;
      if (item.layerKind === 'sprite') {
        const yOffset = item.obj.position.y - instance.params.y;
        item.obj.position.set(info.x, info.z + yOffset, info.y);
      }
    }
    instance.params.x = info.x;
    instance.params.y = info.y;
  }

  private release(instance: VfxInstance): void {
    this.instances.delete(instance);
    if (instance.attachTarget) this.attachedByKey.delete(attachKey(instance.attachTarget, instance.preset.id));
    for (const item of instance.items) {
      this.scene.remove(item.obj);
      disposeObject(item.obj);
      this.budget.release(item.layerKind);
    }
    instance.items.length = 0;
  }
}

function attachKey(target: VfxAttachmentTarget, name: string): string {
  return `${target.isBuilding ? 'b' : 'u'}:${target.id}:${name}`;
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
