export interface VfxBoundary {
  tick(dtMs: number): void;
  destroy(): void;
}

export const EMPTY_VFX_BOUNDARY: VfxBoundary = {
  tick(): void {},
  destroy(): void {},
};

export function composeVfxBoundaries(boundaries: readonly VfxBoundary[]): VfxBoundary {
  return {
    tick(dtMs: number): void {
      for (const boundary of boundaries) boundary.tick(dtMs);
    },
    destroy(): void {
      for (const boundary of boundaries) boundary.destroy();
    },
  };
}
