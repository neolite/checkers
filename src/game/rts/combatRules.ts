import type { CombatRules } from '@systems/combat';
import { damageMultiplier } from '@game/rts/content/matrix';

export const RTS_COMBAT_RULES: CombatRules = {
  damageMultiplier,
  burrowedDamageMultiplier: 0.4,
};
