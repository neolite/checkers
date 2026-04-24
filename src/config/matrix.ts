import type { WeaponClass, ArmorClass } from '@config/gameplay';

// Single source of balance truth. Every combat calc runs through this.
// Rows: attacker weapon class. Cols: defender armor class.
// Sharpened rock-paper-scissors: each weapon class has exactly one "hard counter"
// target and one "useless against" target, with a >4× spread inside every row.
//   aInfantry  (bullets)  → shreds light infantry, bounces off armor/structures
//   aArmor     (cannons)  → poor vs fast infantry, devastates medium/heavy armor
//   aStructure (siege/AT) → cannot track light infantry, wrecks heavy and structures
export const DAMAGE_MATRIX: Record<WeaponClass, Record<ArmorClass, number>> = {
  aInfantry: {
    light: 1.6,
    medium: 0.45,
    heavy: 0.15,
    structure: 0.1,
  },
  aArmor: {
    light: 0.35,
    medium: 1.2,
    heavy: 1.5,
    structure: 0.85,
  },
  aStructure: {
    light: 0.2,
    medium: 0.7,
    heavy: 1.4,
    structure: 2.3,
  },
};

export function damageMultiplier(w: WeaponClass, a: ArmorClass): number {
  return DAMAGE_MATRIX[w][a];
}
