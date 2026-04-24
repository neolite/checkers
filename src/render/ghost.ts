import * as THREE from 'three';
import type { BuildingKind } from '@config/buildings';
import { BUILDING_STATS } from '@config/buildings';
import { MAP } from '@config/gameplay';
import { makeBuildingMesh } from '@render/meshes';
import { FACTION_COLORS, type FactionId } from '@config/palette';

// A semi-transparent real-geometry preview of the building to place, plus a
// colored footprint plate so the valid/invalid state is unambiguous on complex
// terrain.
export class BuildingGhost {
  private scene: THREE.Scene;
  private group: THREE.Group | null = null;
  private plate: THREE.Mesh | null = null;
  private currentKind: BuildingKind | null = null;
  private faction: FactionId;

  constructor(scene: THREE.Scene, faction: FactionId) {
    this.scene = scene;
    this.faction = faction;
  }

  show(kind: BuildingKind): void {
    if (this.currentKind === kind && this.group) return;
    this.hide();
    const col = FACTION_COLORS[this.faction];
    const grp = makeBuildingMesh(kind, col.primary, col.accent, MAP.tileSize);
    grp.traverse((child) => {
      const m = child as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = false;
      m.receiveShadow = false;
      const mat = (m.material as THREE.Material).clone();
      mat.transparent = true;
      mat.opacity = 0.45;
      mat.depthWrite = false;
      m.material = mat;
    });
    grp.visible = false;
    this.scene.add(grp);
    this.group = grp;

    const stats = BUILDING_STATS[kind];
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(stats.tileW * MAP.tileSize, stats.tileH * MAP.tileSize),
      new THREE.MeshBasicMaterial({
        color: 0x7ef5b3,
        transparent: true,
        opacity: 0.35,
        depthTest: false,
        side: THREE.DoubleSide,
      }),
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.y = 0.06;
    plate.renderOrder = 5;
    plate.visible = false;
    this.scene.add(plate);
    this.plate = plate;
    this.currentKind = kind;
  }

  // World-space position + validity tint. Snaps to the tile grid so what you
  // see is what you'll get.
  update(wx: number, wz: number, valid: boolean): void {
    if (!this.group || !this.plate || !this.currentKind) return;
    const stats = BUILDING_STATS[this.currentKind];
    const tx = Math.floor(wx / MAP.tileSize) - Math.floor(stats.tileW / 2);
    const ty = Math.floor(wz / MAP.tileSize) - Math.floor(stats.tileH / 2);
    const snapX = (tx + stats.tileW / 2) * MAP.tileSize;
    const snapZ = (ty + stats.tileH / 2) * MAP.tileSize;
    this.group.position.set(snapX, 0, snapZ);
    this.group.visible = true;
    this.plate.position.set(snapX, 0.06, snapZ);
    this.plate.visible = true;
    const color = valid ? 0x7ef5b3 : 0xff6e6e;
    (this.plate.material as THREE.MeshBasicMaterial).color.setHex(color);
    // Also tint the ghost meshes subtly via emissive when invalid.
    this.group.traverse((child) => {
      const m = child as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshLambertMaterial;
      if ('emissive' in mat) {
        mat.emissive.setHex(valid ? 0x000000 : 0x882222);
      }
    });
  }

  hide(): void {
    if (this.group) {
      this.scene.remove(this.group);
      disposeObject(this.group);
      this.group = null;
    }
    if (this.plate) {
      this.scene.remove(this.plate);
      (this.plate.material as THREE.Material).dispose();
      this.plate.geometry.dispose();
      this.plate = null;
    }
    this.currentKind = null;
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
