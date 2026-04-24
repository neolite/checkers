import type { FactionId } from '@config/palette';
import type { UnitKind } from '@config/units';
import type { BuildingKind } from '@config/buildings';
import type { Role } from '@config/gameplay';

// All events — past-tense facts (no verbs like "set"). input:* = present-tense commands.
export interface GameEvents {
  // Input intents
  'input:commandMove':   { x: number; y: number; additive: boolean; attackMove: boolean };
  'input:commandAttack': { targetId: number; additive: boolean };
  'input:commandStop':   Record<string, never>;
  'input:commandHold':   Record<string, never>;
  'input:commandHarvest':{ resourceId: number };
  'input:setRally':      { x: number; y: number };
  'input:select':        { ids: readonly number[]; additive: boolean };
  'input:selectSingle':  { id: number | null; additive: boolean };
  'input:selectBox':     { minX: number; minY: number; maxX: number; maxY: number; additive: boolean };
  'input:placeBuilding': { x: number; y: number; kind: BuildingKind };
  'input:trainUnit':     { buildingId: number; role: Role; kindKey: UnitKind | null };
  'input:startPlacement':{ kind: BuildingKind };
  'input:cancelPlacement': Record<string, never>;

  // Facts
  'unit:spawned':        { id: number; kind: UnitKind; faction: FactionId; x: number; y: number };
  'unit:died':           { id: number; x: number; y: number; faction: FactionId };
  'unit:damaged':        { id: number; amount: number; x: number; y: number };
  'building:placed':     { id: number; kind: BuildingKind; faction: FactionId };
  'building:completed':  { id: number; kind: BuildingKind; faction: FactionId };
  'building:damaged':    { id: number; amount: number; x: number; y: number };
  'building:destroyed':  { id: number; kind: BuildingKind; faction: FactionId };
  'weapon:fired':        { attackerId: number; targetId: number };
  'projectile:impact':   { x: number; y: number; targetId: number; damage: number };
  'credits:deposited':   { faction: FactionId; amount: number; x: number; y: number };
  'cargo:gathered':      { unitId: number; amount: number };
  'production:started':  { buildingId: number; role: Role };
  'production:completed':{ buildingId: number };
  'hq:destroyed':        { faction: FactionId };
  'game:victory':        { winner: FactionId };
  'game:defeat':         { loser: FactionId };
  'fog:revealed':        Record<string, never>; // painter invalidation
}

type EventName = keyof GameEvents;
type Handler<K extends EventName> = (ev: GameEvents[K]) => void;

export class EventBus {
  private listeners = new Map<EventName, Array<(ev: unknown) => void>>();

  on<K extends EventName>(name: K, h: Handler<K>): () => void {
    let arr = this.listeners.get(name);
    if (!arr) {
      arr = [];
      this.listeners.set(name, arr);
    }
    arr.push(h as (ev: unknown) => void);
    return () => {
      const a = this.listeners.get(name);
      if (!a) return;
      const i = a.indexOf(h as (ev: unknown) => void);
      if (i >= 0) a.splice(i, 1);
    };
  }

  emit<K extends EventName>(name: K, ev: GameEvents[K]): void {
    const arr = this.listeners.get(name);
    if (!arr) return;
    // Copy to tolerate handlers that unsubscribe.
    const snap = arr.slice();
    for (const h of snap) {
      h(ev);
    }
  }
}
