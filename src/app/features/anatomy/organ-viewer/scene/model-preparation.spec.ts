import * as THREE from 'three';
import { prepareModel, freezeModel } from './model-preparation';
import { disposeModel } from './resource-disposer';

describe('Model preparation', () => {
  it('preserves normalization, vertex colors, BVH setup, and frozen matrices', () => {
    const model = new THREE.Group();
    const material = new THREE.MeshBasicMaterial();
    const geometry = new THREE.BoxGeometry(8, 4, 2).translate(10, 2, -4);
    model.add(new THREE.Mesh(geometry, material));
    prepareModel(model);
    freezeModel(model);
    const box = new THREE.Box3().setFromObject(model);
    expect(box.getSize(new THREE.Vector3()).x).toBeCloseTo(2, 8);
    expect(box.getCenter(new THREE.Vector3()).length()).toBeCloseTo(0, 8);
    expect(geometry.boundsTree).toBeDefined();
    expect(material.vertexColors).toBeTrue();
    expect(Array.from(geometry.attributes['color'].array).every(value => value === 1)).toBeTrue();
    expect(model.matrixAutoUpdate).toBeFalse();
    expect(model.children[0].matrixAutoUpdate).toBeFalse();
    disposeModel(model);
    expect(geometry.boundsTree).toBeNull();
  });
});
