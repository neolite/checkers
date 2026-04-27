import type { FactionId } from '@config/palette';
import type { AbilityName, Role, WeaponBehavior, WeaponClass } from '@config/gameplay';

export type EntityKind = string;

// Engine-level event contracts. Game modules may narrow kind strings inside
// their own systems, but the shared bus should not import module content.
export interface GameEvents {
  // Input intents
  'input:commandMove':   { x: number; y: number; additive: boolean; attackMove: boolean };
  'input:commandAttack': { targetId: number; targetIsBuilding: boolean; additive: boolean };
  'input:commandStop':   Record<string, never>;
  'input:commandHold':   Record<string, never>;
  'input:ability':       { ability: AbilityName };
  'input:commandHarvest':{ resourceId: number };
  'input:setRally':      { x: number; y: number };
  'input:select':        { ids: readonly number[]; additive: boolean };
  'input:selectSingle':  { id: number | null; isBuilding: boolean; additive: boolean };
  'input:selectBox':     { minX: number; minY: number; maxX: number; maxY: number; additive: boolean };
  'input:placeBuilding': { x: number; y: number; kind: EntityKind };
  'input:trainUnit':     { buildingId: number; role: Role; kindKey: EntityKind | null };
  'input:startPlacement':{ kind: EntityKind };
  'input:cancelPlacement': Record<string, never>;
  'ui:notice':           { text: string; tone: 'info' | 'warn' | 'error' };

  // Facts
  'unit:spawned':        { id: number; kind: EntityKind; faction: FactionId; x: number; y: number };
  'unit:died':           { id: number; x: number; y: number; faction: FactionId };
  'unit:damaged':        { id: number; amount: number; x: number; y: number };
  'building:placed':     { id: number; kind: EntityKind; faction: FactionId };
  'building:completed':  { id: number; kind: EntityKind; faction: FactionId };
  'building:damaged':    { id: number; amount: number; x: number; y: number };
  'building:destroyed':  { id: number; kind: EntityKind; faction: FactionId; x: number; y: number };
  'weapon:fired':        { attackerId: number; attackerIsBuilding: boolean; targetId: number; behavior: WeaponBehavior };
  'weapon:effect':       {
    behavior: WeaponBehavior | 'ambush';
    faction: FactionId;
    x: number;
    y: number;
    tx: number;
    ty: number;
    radius?: number;
    width?: number;
    angleDeg?: number;
    points?: Array<{ x: number; y: number }>;
  };
  'projectile:impact':   { x: number; y: number; targetId: number; damage: number; klass: WeaponClass; behavior: WeaponBehavior };
  'superweapon:nukeTargeted':  { faction: FactionId; x: number; y: number; radius: number; delayMs: number };
  'superweapon:nukeDetonated': { faction: FactionId; x: number; y: number; radius: number; damage: number };
  'credits:deposited':   { faction: FactionId; amount: number; x: number; y: number };
  'cargo:gathered':      { unitId: number; amount: number };
  'production:started':  { buildingId: number; role: Role };
  'production:completed':{ buildingId: number };
  'hq:destroyed':        { faction: FactionId };
  'game:victory':        { winner: FactionId };
  'game:defeat':         { loser: FactionId };
  'fog:revealed':        Record<string, never>;
}
