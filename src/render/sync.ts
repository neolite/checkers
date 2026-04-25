import * as THREE from 'three';
import type { Unit, Building, Projectile, ResourceNode } from '@entities/types';
import type { FactionId } from '@config/palette';
import { FACTION_COLORS, NEUTRAL_COLORS } from '@config/palette';
import { makeUnitMesh, makeBuildingMesh, makeProjectileMesh, makeResourceMesh } from '@render/meshes';
import { makeSelectionRing } from '@render/selection';
import { sampleFog } from '@render/fogOverlay';
import { makeRallyMarker } from '@render/rallyMarker';
import { MAP } from '@config/gameplay';

interface UnitView {
  group: THREE.Group;
  ring: THREE.Mesh;
  hpBarBg: THREE.Mesh;
  hpBarFg: THREE.Mesh;
  hpBarMaxWidth: number;
  turret: THREE.Object3D | null;
}

interface BuildingView {
  group: THREE.Group;
  ring: THREE.Mesh;
  hpBarBg: THREE.Mesh;
  hpBarFg: THREE.Mesh;
  hpBarMaxWidth: number;
}

interface ProjectileView {
  mesh: THREE.Mesh;
  behavior: Projectile['behavior'];
}

interface ResourceView {
  group: THREE.Group;
}

export class RenderBridge {
  private scene: THREE.Scene;
  private unitViews = new Map<number, UnitView>();
  private buildingViews = new Map<number, BuildingView>();
  private projectileViews = new Map<number, ProjectileView>();
  private resourceViews = new Map<number, ResourceView>();
  private rallyMarkers = new Map<number, THREE.Group>();
  private selected: Set<number> = new Set();
  private selectedBuildings: Set<number> = new Set();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  setSelection(unitIds: readonly number[], buildingIds: readonly number[]): void {
    this.selected = new Set(unitIds);
    this.selectedBuildings = new Set(buildingIds);
  }

  removeUnit(id: number): void {
    const v = this.unitViews.get(id);
    if (!v) return;
    this.scene.remove(v.group);
    disposeObject(v.group);
    this.unitViews.delete(id);
  }

  removeBuilding(id: number): void {
    const v = this.buildingViews.get(id);
    if (!v) return;
    this.scene.remove(v.group);
    disposeObject(v.group);
    this.buildingViews.delete(id);
    this.removeRally(id);
  }

  syncRally(b: Building, playerFaction: FactionId): void {
    if (b.faction !== playerFaction) { this.removeRally(b.id); return; }
    if (!this.selectedBuildings.has(b.id) && b.rallyX === null) { this.removeRally(b.id); return; }
    if (b.rallyX === null || b.rallyY === null) { this.removeRally(b.id); return; }
    let mk = this.rallyMarkers.get(b.id);
    if (!mk) {
      mk = makeRallyMarker(FACTION_COLORS[b.faction].accent);
      this.scene.add(mk);
      this.rallyMarkers.set(b.id, mk);
    }
    mk.position.set(b.rallyX, 0, b.rallyY);
    // Show marker permanently; add subtle animation when selected.
    mk.visible = this.selectedBuildings.has(b.id);
  }

  removeRally(buildingId: number): void {
    const mk = this.rallyMarkers.get(buildingId);
    if (!mk) return;
    this.scene.remove(mk);
    disposeObject(mk);
    this.rallyMarkers.delete(buildingId);
  }

  removeProjectile(id: number): void {
    const v = this.projectileViews.get(id);
    if (!v) return;
    this.scene.remove(v.mesh);
    disposeObject(v.mesh);
    this.projectileViews.delete(id);
  }

  removeResource(id: number): void {
    const v = this.resourceViews.get(id);
    if (!v) return;
    this.scene.remove(v.group);
    disposeObject(v.group);
    this.resourceViews.delete(id);
  }

  syncUnit(u: Unit, fogGrid: Uint8Array, playerFaction: FactionId): void {
    let v = this.unitViews.get(u.id);
    if (!v) {
      const faction = FACTION_COLORS[u.faction];
      const group = makeUnitMesh(u.kind, faction.primary, faction.accent);
      const ring = makeSelectionRing(u.stats.radius + 0.45, NEUTRAL_COLORS.ally);
      ring.position.y = 0.05;
      group.add(ring);
      // HP bar
      const barBgGeom = new THREE.PlaneGeometry(1.2, 0.14);
      const barBg = new THREE.Mesh(barBgGeom, new THREE.MeshBasicMaterial({ color: 0x1a1f26, transparent: true, depthTest: false }));
      const barFgGeom = new THREE.PlaneGeometry(1.2, 0.1);
      const barFg = new THREE.Mesh(barFgGeom, new THREE.MeshBasicMaterial({ color: 0x7ef5b3, transparent: true, depthTest: false }));
      barBg.renderOrder = 8; barFg.renderOrder = 9;
      barBg.visible = false; barFg.visible = false;
      group.add(barBg, barFg);
      this.scene.add(group);
      // Find turret child, if any.
      const turret = group.getObjectByName('turret') ?? null;
      v = { group, ring, hpBarBg: barBg, hpBarFg: barFg, hpBarMaxWidth: 1.2, turret };
      this.unitViews.set(u.id, v);
    }

    // Position: entity (x, y) → three (x, altitude, y).
    v.group.position.set(u.x, u.burrowed ? 0.02 : u.stats.altitude, u.y);
    v.group.rotation.y = Math.PI / 2 - u.rotation;
    v.group.scale.set(1, u.burrowed ? 0.22 : 1, 1);

    // Selection ring visibility.
    v.ring.visible = this.selected.has(u.id);
    const faction = FACTION_COLORS[u.faction];
    (v.ring.material as THREE.MeshBasicMaterial).color.setHex(faction.accent);

    // Fog: player's own units always visible; enemies visible only when fog == VISIBLE (2).
    if (u.faction === playerFaction) {
      v.group.visible = true;
    } else if (u.burrowed) {
      v.group.visible = false;
    } else {
      v.group.visible = sampleFog(fogGrid, u.x, u.y) === 2;
    }

    // HP bar — only when damaged.
    const hpPct = Math.max(0, u.hp / u.stats.maxHp);
    const show = hpPct < 1 && v.group.visible;
    v.hpBarBg.visible = show;
    v.hpBarFg.visible = show;
    if (show) {
      const topY = (u.stats.altitude > 0 ? u.stats.altitude : 0) + 2.5;
      v.hpBarBg.position.set(0, topY, 0);
      v.hpBarFg.position.set(-(v.hpBarMaxWidth * (1 - hpPct)) / 2, topY, 0.001);
      v.hpBarFg.scale.set(hpPct, 1, 1);
      (v.hpBarFg.material as THREE.MeshBasicMaterial).color.setHex(
        hpPct > 0.5 ? 0x7ef5b3 : hpPct > 0.25 ? 0xffd863 : 0xff6e6e,
      );
      // Billboard bar to camera — handled by orienting at render time if needed.
      // Simpler: rotate the bar group's parent (unit) is already rotated; we apply a correction.
      v.hpBarBg.rotation.y = -v.group.rotation.y;
      v.hpBarFg.rotation.y = -v.group.rotation.y;
    }

    // Aim turret at target if we have one.
    if (v.turret) {
      const attackish = u.state === 'attack' && u.targetId !== null;
      if (attackish) {
        // We won't resolve target world here; instead, we use velocity direction as fallback.
        // Command + combat systems keep rotation aligned with target when attacking.
        v.turret.rotation.y = 0; // relative to chassis — chassis already rotated.
      }
    }
  }

  syncBuilding(b: Building, fogGrid: Uint8Array, playerFaction: FactionId): void {
    let v = this.buildingViews.get(b.id);
    if (!v) {
      const faction = FACTION_COLORS[b.faction];
      const group = makeBuildingMesh(b.kind, faction.primary, faction.accent, MAP.tileSize);
      const rad = b.stats.radius + 0.3;
      const ring = makeSelectionRing(rad, NEUTRAL_COLORS.ally);
      ring.position.y = 0.05;
      group.add(ring);
      const barBg = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.2), new THREE.MeshBasicMaterial({ color: 0x1a1f26, transparent: true, depthTest: false }));
      const barFg = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.15), new THREE.MeshBasicMaterial({ color: 0x7ef5b3, transparent: true, depthTest: false }));
      barBg.renderOrder = 8; barFg.renderOrder = 9;
      barBg.visible = false; barFg.visible = false;
      group.add(barBg, barFg);
      this.scene.add(group);
      v = { group, ring, hpBarBg: barBg, hpBarFg: barFg, hpBarMaxWidth: 2.2 };
      this.buildingViews.set(b.id, v);
    }
    v.group.position.set(b.x, 0, b.y);

    v.ring.visible = this.selectedBuildings.has(b.id);
    const faction = FACTION_COLORS[b.faction];
    (v.ring.material as THREE.MeshBasicMaterial).color.setHex(faction.accent);

    // Under-construction tinting: scale Y down.
    const buildPct = b.completed ? 1 : Math.max(0.15, 1 - b.buildMsLeft / b.stats.buildMs);
    v.group.scale.set(1, buildPct, 1);

    // Fog — buildings of enemy faction hidden if not visible.
    const fogV = sampleFog(fogGrid, b.x, b.y);
    v.group.visible = b.faction === playerFaction || fogV === 2 || fogV === 1;
    // Explored but not visible = dimmed; we leave opacity handling to the fog plane.

    const hpPct = b.completed ? b.hp / b.stats.maxHp : 1;
    const showBar = b.completed && hpPct < 1 && v.group.visible;
    v.hpBarBg.visible = showBar;
    v.hpBarFg.visible = showBar;
    if (showBar) {
      const topY = 5.5;
      v.hpBarBg.position.set(0, topY, 0);
      v.hpBarFg.position.set(-(v.hpBarMaxWidth * (1 - hpPct)) / 2, topY, 0.001);
      v.hpBarFg.scale.set(hpPct, 1, 1);
      (v.hpBarFg.material as THREE.MeshBasicMaterial).color.setHex(
        hpPct > 0.5 ? 0x7ef5b3 : hpPct > 0.25 ? 0xffd863 : 0xff6e6e,
      );
    }
  }

  syncProjectile(p: Projectile, color: number): void {
    let v = this.projectileViews.get(p.id);
    if (!v || v.behavior !== p.behavior) {
      if (v) {
        this.scene.remove(v.mesh);
        disposeObject(v.mesh);
      }
      const mesh = makeProjectileMesh(color, p.behavior);
      this.scene.add(mesh);
      v = { mesh, behavior: p.behavior };
      this.projectileViews.set(p.id, v);
    }
    v.mesh.position.set(p.x, p.z, p.y);
    if (p.vx !== 0 || p.vy !== 0) v.mesh.rotation.y = Math.atan2(p.vx, p.vy);
  }

  syncResource(r: ResourceNode, fogGrid: Uint8Array): void {
    let v = this.resourceViews.get(r.id);
    if (!v) {
      const group = makeResourceMesh(NEUTRAL_COLORS.resource);
      this.scene.add(group);
      v = { group };
      this.resourceViews.set(r.id, v);
    }
    v.group.position.set(r.x, 0, r.y);
    const fogV = sampleFog(fogGrid, r.x, r.y);
    v.group.visible = fogV !== 0;
  }
}

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    const m = child as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = (m as { material?: THREE.Material | THREE.Material[] }).material;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else if (mat) mat.dispose();
  });
}
