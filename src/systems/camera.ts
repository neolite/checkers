import * as THREE from 'three';
import type { ISystem } from '@systems/iface';
import type { World } from '@engine/world';
import { CAMERA, WORLD } from '@config/gameplay';
import { clamp } from '@utils/math';
import { InputScope } from '@engine/input/inputScope';

// Pan-only orthographic-style top-down camera. Pitch is fixed.
export class CameraSystem implements ISystem {
  readonly name = 'camera';
  private target = new THREE.Vector3(WORLD.width / 2, 0, WORLD.depth / 2);
  private distance: number = CAMERA.distance;
  private keys = new Set<string>();
  private mouseX = window.innerWidth / 2;
  private mouseY = window.innerHeight / 2;
  private insideWindow = true;
  private input = new InputScope();

  init(_w: World): void {
    // Using e.code (physical key) so keyboard layouts other than US still pan.
    this.input.on(window, 'keydown', (e) => {
      this.keys.add(e.code);
    });
    this.input.on(window, 'keyup', (e) => {
      this.keys.delete(e.code);
    });
    this.input.on(window, 'mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
    });
    this.input.on(window, 'mouseleave', () => { this.insideWindow = false; });
    this.input.on(window, 'mouseenter', () => { this.insideWindow = true; });
    this.input.on(window, 'wheel', (e) => {
      const step = e.deltaY > 0 ? CAMERA.zoomStep : -CAMERA.zoomStep;
      this.distance = clamp(this.distance + step, CAMERA.zoomMin, CAMERA.zoomMax);
      e.preventDefault();
    }, { passive: false });
  }

  update(w: World, dtMs: number): void {
    const camera = w.three.camera;
    if (!camera) return;
    const dt = dtMs / 1000;

    // Keyboard pan.
    let dx = 0, dz = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) dz -= 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) dz += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) dx -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) dx += 1;

    // Edge pan.
    if (this.insideWindow) {
      if (this.mouseX < CAMERA.edgePad) dx -= 1;
      else if (this.mouseX > window.innerWidth - CAMERA.edgePad) dx += 1;
      if (this.mouseY < CAMERA.edgePad) dz -= 1;
      else if (this.mouseY > window.innerHeight - CAMERA.edgePad) dz += 1;
    }
    if (dx !== 0 || dz !== 0) {
      const len = Math.hypot(dx, dz);
      dx /= len; dz /= len;
      this.target.x = clamp(this.target.x + dx * CAMERA.panSpeed * dt, 0, WORLD.width);
      this.target.z = clamp(this.target.z + dz * CAMERA.panSpeed * dt, 0, WORLD.depth);
    }

    // Position camera at an angle behind+above target.
    const pitch = (CAMERA.angleDeg * Math.PI) / 180;
    const offX = 0;
    const offZ = Math.cos(pitch) * this.distance;
    const offY = Math.sin(pitch) * this.distance;
    camera.position.set(this.target.x + offX, offY, this.target.z + offZ);
    camera.lookAt(this.target);
  }

  centerOn(x: number, z: number): void {
    this.target.x = clamp(x, 0, WORLD.width);
    this.target.z = clamp(z, 0, WORLD.depth);
  }

  getTarget(): { x: number; z: number } {
    return { x: this.target.x, z: this.target.z };
  }

  destroy(): void {
    this.input.destroy();
    this.keys.clear();
  }
}
