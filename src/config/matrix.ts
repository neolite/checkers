import type { WeaponClass, ArmorClass } from '@config/gameplay';

// Single source of balance truth. Every combat calc runs through this.
// Rows: attacker weapon class. Cols: defender armor class.
// Sharpened rock-paper-scissors: weapon class is independent from armor class.
//   aInfantry  (AP)    → shreds light infantry, weak but not useless vs structures
//   aArmor     (AT)    → specializes into medium armor and remains useful vs heavy
//   aStructure (siege) → bad into light targets, best into heavy armor + buildings
export const DAMAGE_MATRIX: Record<WeaponClass, Record<ArmorClass, number>> = {
  aInfantry: {
    light: 1.7,
    medium: 0.5,
    heavy: 0.1,
    structure: 0.4,
  },
  aArmor: {
    light: 0.3,
    medium: 1.3,
    heavy: 1.2,
    structure: 0.7,
  },
  aStructure: {
    light: 0.15,
    medium: 0.6,
    heavy: 1.6,
    structure: 2.5,
  },
};

export function damageMultiplier(w: WeaponClass, a: ArmorClass): number {
  return DAMAGE_MATRIX[w][a];
}
