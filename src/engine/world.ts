import * as THREE from 'three';
import type { Unit, Building, Projectile, ResourceNode } from '@entities/types';
import { ObjectPool } from '@utils/objectPool';
import { EventBus } from '@utils/eventBus';
import { NavGrid, FlowField } from '@utils/flowField';
import type { FactionId } from '@config/palette';
import { FACTION_IDS } from '@config/palette';
import { FOG } from '@config/gameplay';
import type { TerrainFeature } from '@config/terrain';
import { makeUnitSeed, resetUnit, makeBuildingSeed, resetBuilding, makeProjectileSeed, resetProjectile, makeResourceNodeSeed, resetResourceNode } from '@entities/create';

const POOL = {
  units: 600,
  buildings: 200,
  projectiles: 800,
  resources: 80,
} as const;

export interface FactionState {
  id: FactionId;
  credits: number;
  powerProduced: number;
  powerConsumed: number;
  alive: boolean;
  isHuman: boolean;
  // Team id — factions on the same team are allied (never attack each other,
  // share victory). In FFA each faction has its own team number.
  team: number;
  // Basic AI bookkeeping.
  aiLastThinkMs: number;
  aiStage: number;
  // Player's fog grids — each faction has its own.
  fog: Uint8Array;
}

export class World {
  bus = new EventBus();
  units: ObjectPool<Unit>;
  buildings: ObjectPool<Building>;
  projectiles: ObjectPool<Projectile>;
  resources: ObjectPool<ResourceNode>;
  navGrid: NavGrid;
  terrainFeatures: TerrainFeature[] = [];
  terrainTiles: Uint8Array;
  // Flow-field cache keyed by goal tile.
  flowFields = new Map<string, { field: FlowField; lastUsedMs: number; createdMs: number }>();
  tNow = 0; // sim time in ms
  factions: Record<FactionId, FactionState>;
  playerFaction: FactionId = 'vanguard';
  // Selection (player-controlled).
  selectedUnits: Set<number> = new Set();
  selectedBuildings: Set<number> = new Set();
  // UI state: placement mode.
  placementKind: string | null = null;
  // Cameras and renderer injected from scene init.
  three: {
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    renderer: THREE.WebGLRenderer | null;
  } = { scene: null, camera: null, renderer: null };
  victoryDetermined = false;

  constructor() {
    this.units = new ObjectPool<Unit>(POOL.units, makeUnitSeed, resetUnit);
    this.buildings = new ObjectPool<Building>(POOL.buildings, makeBuildingSeed, resetBuilding);
    this.projectiles = new ObjectPool<Projectile>(POOL.projectiles, makeProjectileSeed, resetProjectile);
    this.resources = new ObjectPool<ResourceNode>(POOL.resources, makeResourceNodeSeed, resetResourceNode);
    this.navGrid = new NavGrid();
    this.terrainTiles = new Uint8Array(this.navGrid.w * this.navGrid.h);
    const factions = {} as Record<FactionId, FactionState>;
    let t = 1;
    for (const id of FACTION_IDS) {
      factions[id] = {
        id,
        credits: 0,
        powerProduced: 0,
        powerConsumed: 0,
        alive: true,
        isHuman: false,
        team: t++,          // FFA default; scene can rewrite to set up alliances
        aiLastThinkMs: 0,
        aiStage: 0,
        fog: new Uint8Array(FOG.gridW * FOG.gridH),
      };
    }
    this.factions = factions;
  }

  // Are these two factions hostile to each other? Shared team = no.
  areHostile(a: FactionId, b: FactionId): boolean {
    if (a === b) return false;
    return this.factions[a].team !== this.factions[b].team;
  }

  // Get or build a flow field for the given goal tile. Reuses fields for 3 seconds.
  getFlowField(goalTx: number, goalTy: number, tNow: number): FlowField {
    const key = `${goalTx},${goalTy}`;
    const cached = this.flowFields.get(key);
    if (cached && tNow - cached.createdMs < 3000) {
      cached.lastUsedMs = tNow;
      return cached.field;
    }
    const field = cached?.field ?? new FlowField(this.navGrid.w, this.navGrid.h);
    field.rebuild(this.navGrid, goalTx, goalTy);
    this.flowFields.set(key, { field, lastUsedMs: tNow, createdMs: tNow });
    return field;
  }

  // Drop flow fields unused for > 8 seconds.
  gcFlowFields(tNow: number): void {
    for (const [k, v] of this.flowFields) {
      if (tNow - v.lastUsedMs > 8000) this.flowFields.delete(k);
    }
  }
}
