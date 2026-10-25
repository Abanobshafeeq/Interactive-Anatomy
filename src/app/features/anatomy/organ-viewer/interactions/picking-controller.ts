import * as THREE from 'three';

export function createFirstHitRaycaster(): THREE.Raycaster {
  const raycaster = new THREE.Raycaster();
  (raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
  return raycaster;
}

export class PickingController {
  private readonly raycaster = createFirstHitRaycaster();
  private readonly mouse = new THREE.Vector2();
  private readonly normalMatrix = new THREE.Matrix3();

  constructor(private readonly isGum: (hit: THREE.Intersection) => boolean) {}

  pick(
    event: Pick<PointerEvent, 'clientX' | 'clientY'>,
    rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
    camera: THREE.Camera,
    model: THREE.Object3D,
    allowed: ReadonlySet<string> | null,
  ): THREE.Intersection | undefined {
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, camera);
    const intersects = this.raycaster.intersectObject(model, true);
    if (!allowed) return intersects[0];
    return intersects.find(hit => allowed.has(hit.object.name) && !this.isGum(hit));
  }

  surfaceNormal(normal: THREE.Vector3, matrixWorld: THREE.Matrix4): THREE.Vector3 {
    this.normalMatrix.getNormalMatrix(matrixWorld);
    return normal.clone().applyMatrix3(this.normalMatrix).normalize();
  }
}
