import * as THREE from 'three';

// Cast a ray from screen coords into the scene and intersect the ground plane (y=0).
// Returns world (x, z).
export function screenToGround(
  camera: THREE.PerspectiveCamera,
  clientX: number,
  clientY: number,
  width: number,
  height: number,
): { x: number; z: number } | null {
  const ndc = new THREE.Vector2(
    (clientX / width) * 2 - 1,
    -((clientY / height) * 2 - 1),
  );
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camera);
  // Intersect with plane y=0.
  const planeN = new THREE.Vector3(0, 1, 0);
  const out = new THREE.Vector3();
  const result = ray.ray.intersectPlane(new THREE.Plane(planeN, 0), out);
  if (!result) return null;
  return { x: out.x, z: out.z };
}

// World point → screen px.
export function worldToScreen(
  camera: THREE.PerspectiveCamera,
  wx: number,
  wy: number,
  wz: number,
  width: number,
  height: number,
): { x: number; y: number; behind: boolean } {
  const v = new THREE.Vector3(wx, wy, wz).project(camera);
  const behind = v.z > 1 || v.z < -1;
  return {
    x: (v.x * 0.5 + 0.5) * width,
    y: (-v.y * 0.5 + 0.5) * height,
    behind,
  };
}
