import type { VfxAttachmentInfo, VfxAttachmentTarget } from '@vfx/types';

export type ResolveVfxAttachment = (target: VfxAttachmentTarget) => VfxAttachmentInfo | null;

export class AttachedLoopSystem {
  constructor(private resolve: ResolveVfxAttachment) {}

  position(target: VfxAttachmentTarget): VfxAttachmentInfo | null {
    return this.resolve(target);
  }
}
