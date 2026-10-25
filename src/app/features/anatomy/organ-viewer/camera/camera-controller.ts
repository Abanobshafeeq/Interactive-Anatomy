import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CameraControlAction = 'up' | 'down' | 'left' | 'right' | 'zoomIn' | 'zoomOut';
type CameraControls = Pick<OrbitControls, 'target' | 'update' | 'minDistance' | 'maxDistance'>;

export class CameraController {
  private readonly tmpViewDir = new THREE.Vector3();
  private readonly tmpPanRight = new THREE.Vector3();
  private readonly tmpPanUp = new THREE.Vector3();
  private readonly tmpPanDelta = new THREE.Vector3();

  reset(camera: THREE.PerspectiveCamera, controls: CameraControls): void {
    camera.position.set(0, 0, 4);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  recenter(camera: THREE.PerspectiveCamera, controls: CameraControls): void {
    camera.position.sub(controls.target);
    controls.target.set(0, 0, 0);
    controls.update();
  }

  step(camera: THREE.PerspectiveCamera, controls: CameraControls, action: CameraControlAction, stepMultiplier: number): boolean {
    switch (action) {
      case 'up': return this.pan(camera, controls, 0, 1 * stepMultiplier);
      case 'down': return this.pan(camera, controls, 0, -1 * stepMultiplier);
      case 'left': return this.pan(camera, controls, -1 * stepMultiplier, 0);
      case 'right': return this.pan(camera, controls, 1 * stepMultiplier, 0);
      case 'zoomIn': return this.zoom(camera, controls, 1 - 0.07 * stepMultiplier);
      case 'zoomOut': return this.zoom(camera, controls, 1 + 0.08 * stepMultiplier);
    }
  }

  private pan(camera: THREE.PerspectiveCamera, controls: CameraControls, dx: number, dy: number): boolean {
    camera.updateMatrixWorld();
    const dist = Math.max(0.4, camera.position.distanceTo(controls.target));
    const panStep = dist * 0.025;

    this.tmpPanRight.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(dx * panStep);
    this.tmpPanUp.setFromMatrixColumn(camera.matrixWorld, 1).multiplyScalar(dy * panStep);
    this.tmpPanDelta.copy(this.tmpPanRight).add(this.tmpPanUp);

    // Clamp target within a generous radius so the organ remains reachable
    const nextTarget = this.tmpViewDir.copy(controls.target).add(this.tmpPanDelta);
    if (nextTarget.length() <= 3.2) {
      controls.target.add(this.tmpPanDelta);
      camera.position.add(this.tmpPanDelta);
      controls.update();
      return true;
    }
    return false;
  }

  private zoom(camera: THREE.PerspectiveCamera, controls: CameraControls, factor: number): boolean {
    const offset = this.tmpViewDir.subVectors(camera.position, controls.target);
    const currentDist = offset.length();
    if (currentDist <= 0) {
      return false;
    }

    const nextDist = THREE.MathUtils.clamp(
      currentDist * factor,
      controls.minDistance,
      controls.maxDistance
    );

    offset.normalize().multiplyScalar(nextDist);
    camera.position.copy(controls.target).add(offset);
    controls.update();
    return true;
  }
}
