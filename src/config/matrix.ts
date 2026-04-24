import type { WeaponClass, ArmorClass } from '@config/gameplay';

// Single source of balance truth. Every combat calc runs through this.
// Rows: attacker weapon class. Cols: defender armor class.
// Multipliers chosen so each weapon class has a clear hard-counter and soft target.
export const DAMAGE_MATRIX: Record<WeaponClass, Record<ArmorClass, number>> = {
  aInfantry: {
    light: 1.4,
    medium: 0.55,
    heavy: 0.3,
    structure: 0.25,
  },
  aArmor: {
    light: 0.6,
    medium: 1.0,
    heavy: 1.3,
    structure: 0.8,
  },
  aStructure: {
    light: 0.5,
    medium: 0.75,
    heavy: 0.85,
    structure: 2.0,
  },
};

export function damageMultiplier(w: WeaponClass, a: ArmorClass): number {
  return DAMAGE_MATRIX[w][a];
}
