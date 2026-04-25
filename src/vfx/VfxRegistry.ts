import type { VfxPreset } from '@vfx/types';

export class VfxRegistry {
  private presets = new Map<string, VfxPreset>();

  constructor(presets: readonly VfxPreset[] = []) {
    for (const preset of presets) this.register(preset);
  }

  register(preset: VfxPreset): void {
    this.presets.set(preset.id, preset);
  }

  get(id: string): VfxPreset | null {
    return this.presets.get(id) ?? null;
  }
}
