import * as THREE from 'three';

export function makeSelectionRing(radius: number, color: number): THREE.Mesh {
  const geom = new THREE.RingGeometry(radius * 0.85, radius * 1.0, 24);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.85,
    depthTest: false,       // mandatory — dune crests would otherwise occlude.
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 5;
  mesh.visible = false;
  return mesh;
}

// Rectangular ghost outline for building placement.
export function makeGhostPlate(w: number, d: number, color: number): THREE.Mesh {
  const geom = new THREE.PlaneGeometry(w, d);
  const mat = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.28,
    depthTest: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geom, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.renderOrder = 4;
  mesh.visible = false;
  return mesh;
}
