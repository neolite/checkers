import type * as THREE from 'three';

export type VfxBudgetClass = 'cheap' | 'normal' | 'expensive';
export type VfxLod = 'high' | 'medium' | 'low' | 'culled';
export type VfxLayerKind = 'beam' | 'cone' | 'decal' | 'light' | 'mesh' | 'shockwave' | 'sprite';
export type VfxTextureId = 'spark' | 'flame' | 'magic' | 'smoke' | 'trace' | 'scorch' | 'crater';

export interface VfxParams {
  x: number;
  y: number;
  tx?: number;
  ty?: number;
  color?: number;
  width?: number;
  radius?: number;
  angleDeg?: number;
}

export interface VfxAttachmentTarget {
  id: number;
  isBuilding: boolean;
}

export interface VfxAttachmentInfo {
  x: number;
  y: number;
  z: number;
  visible: boolean;
}

export interface VfxLayerBase {
  type: VfxLayerKind;
  budgetClass?: VfxBudgetClass;
  color?: number;
  lifeMs?: number;
  y?: number;
}

export interface VfxBeamLayer extends VfxLayerBase {
  type: 'beam';
  width?: number;
  electric?: boolean;
}

export interface VfxConeLayer extends VfxLayerBase {
  type: 'cone';
  radius?: number;
  angleDeg?: number;
  opacity?: number;
}

export interface VfxDecalLayer extends VfxLayerBase {
  type: 'decal';
  texture: Extract<VfxTextureId, 'scorch' | 'crater'>;
  radius?: number;
  opacity?: number;
  randomRotation?: boolean;
}

export interface VfxShockwaveLayer extends VfxLayerBase {
  type: 'shockwave';
  radius?: number;
}

export interface VfxLightLayer extends VfxLayerBase {
  type: 'light';
  intensity?: number;
  distance?: number;
}

export interface VfxMeshLayer extends VfxLayerBase {
  type: 'mesh';
  shape: 'sphere' | 'column';
  radius?: number;
  height?: number;
  opacity?: number;
  grow?: number;
}

export interface VfxSpriteLayer extends VfxLayerBase {
  type: 'sprite';
  texture: Exclude<VfxTextureId, 'scorch' | 'crater'>;
  size?: number;
  opacity?: number;
  grow?: number;
  randomRotation?: boolean;
}

export type VfxLayer =
  | VfxBeamLayer
  | VfxConeLayer
  | VfxDecalLayer
  | VfxLightLayer
  | VfxMeshLayer
  | VfxShockwaveLayer
  | VfxSpriteLayer;

export interface VfxPreset {
  id: string;
  durationMs: number;
  budgetClass: VfxBudgetClass;
  loop?: boolean;
  layers: VfxLayer[];
}

export interface RuntimeVfxItem {
  obj: THREE.Object3D;
  layerKind: VfxLayerKind;
  lifeMs: number;
  update?: (obj: THREE.Object3D, t: number, ageMs: number) => void;
}
