import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { subdivideGeometry } from '../dental/dental-geometry';

export async function loadDentalFixture(): Promise<THREE.Group> {
  const response = await fetch('/models/teeth.OBJ');
  if (!response.ok) throw new Error(`Dental fixture request failed: ${response.status}`);
  const model = new OBJLoader().parse(await response.text());
  for (const mesh of dentalMeshes(model)) {
    const original = mesh.geometry;
    mesh.geometry = subdivideGeometry(original, 3);
    original.dispose();
  }
  return model;
}

export function dentalMeshes(model: THREE.Object3D): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  model.traverse(child => {
    if (child instanceof THREE.Mesh && ['Group1014', 'Group1059'].includes(child.name)) meshes.push(child);
  });
  return meshes;
}

export async function hashDentalData(value: ArrayBufferView | string): Promise<string> {
  const bytes = typeof value === 'string' ? new TextEncoder().encode(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export function disposeDentalFixture(model: THREE.Object3D): void {
  model.traverse(child => {
    if (!(child instanceof THREE.Mesh)) return;
    child.geometry.dispose();
    for (const material of Array.isArray(child.material) ? child.material : [child.material]) material.dispose();
  });
}
