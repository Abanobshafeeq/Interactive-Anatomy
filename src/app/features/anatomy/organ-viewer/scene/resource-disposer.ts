import * as THREE from 'three';

export function disposeModel(model: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) {
      return;
    }

    if (mesh.geometry) geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (material) materials.add(material);
    }
  });
  for (const geometry of geometries) {
    geometry.disposeBoundsTree?.();
    geometry.dispose();
  }
  disposeMaterials(materials);
}

export function disposeMaterials(materials: Iterable<THREE.Material>): void {
  const textures = new Set<THREE.Texture>();
  const images = new Set<ImageBitmap>();
  for (const material of new Set(materials)) {
    for (const value of Object.values(material)) {
      if (value instanceof THREE.Texture) textures.add(value);
    }
    material.dispose();
  }
  for (const texture of textures) {
    texture.dispose();
    if (typeof ImageBitmap !== 'undefined' && texture.image instanceof ImageBitmap) images.add(texture.image);
  }
  for (const image of images) image.close();
}
