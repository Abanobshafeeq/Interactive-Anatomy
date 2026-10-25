import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { subdivideGeometry } from '../dental/dental-geometry';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

export function prepareModel(model: THREE.Object3D): void {
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      if (mesh.name === 'Group1014' || mesh.name === 'Group1059') {
        if (mesh.geometry.index !== null) {
          const original = mesh.geometry;
          mesh.geometry = mesh.geometry.toNonIndexed();
          original.disposeBoundsTree?.();
          original.dispose();
        }
        const original = mesh.geometry;
        mesh.geometry = subdivideGeometry(original, 3);
        if (mesh.geometry !== original) {
          original.disposeBoundsTree?.();
          original.dispose();
        }
      }
      if (!mesh.geometry.attributes['color']) {
        const count = mesh.geometry.attributes['position'].count;
        const colors = new Float32Array(count * 3).fill(1.0);
        mesh.geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      }
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => {
          m.vertexColors = true;
          m.needsUpdate = true;
        });
      } else if (mesh.material) {
        mesh.material.vertexColors = true;
        mesh.material.needsUpdate = true;
      }
      if (!mesh.geometry.boundsTree) {
        mesh.geometry.computeBoundsTree();
      }
    }
  });

  model.position.set(0, 0, 0);
  model.rotation.set(0, 0, 0);
  model.scale.set(1, 1, 1);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  const maxSize = Math.max(size.x, size.y, size.z);
  if (maxSize > 0) {
    const scale = 2 / maxSize;
    model.scale.setScalar(scale);
    model.position.copy(center).multiplyScalar(-scale);
  } else {
    model.position.copy(center).multiplyScalar(-1);
  }
}

export function freezeModel(model: THREE.Object3D): void {
  model.updateMatrixWorld(true);
  model.traverse((child) => {
    child.matrixAutoUpdate = false;
  });
}
