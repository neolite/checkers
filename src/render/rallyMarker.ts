import * as THREE from 'three';

// Small flag/beacon mesh used as a rally-point marker on the ground.
export function makeRallyMarker(color: number): THREE.Group {
  const g = new THREE.Group();
  g.name = 'rally-marker';

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6),
    new THREE.MeshLambertMaterial({ color: 0xd8e2ee, flatShading: true }),
  );
  pole.position.y = 1.1;
  g.add(pole);

  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.9, 0.5),
    new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide, emissive: color, emissiveIntensity: 0.25 }),
  );
  flag.position.set(0.45, 1.9, 0);
  g.add(flag);

  const pad = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.75, 20),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, depthTest: false, side: THREE.DoubleSide }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.06;
  pad.renderOrder = 5;
  g.add(pad);

  return g;
}
