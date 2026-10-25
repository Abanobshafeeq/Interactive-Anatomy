import * as THREE from 'three';
import { disposeMaterials } from './resource-disposer';

describe('Resource disposal', () => {
  it('closes a bitmap shared by multiple textures exactly once', async () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 2;
    const bitmap = await createImageBitmap(canvas);
    const close = spyOn(bitmap, 'close').and.callThrough();
    const first = new THREE.Texture(bitmap);
    const second = new THREE.Texture(bitmap);
    const disposeFirst = spyOn(first, 'dispose').and.callThrough();
    const disposeSecond = spyOn(second, 'dispose').and.callThrough();
    const material = new THREE.MeshPhongMaterial({ map: first, normalMap: second });
    const disposeMaterial = spyOn(material, 'dispose').and.callThrough();
    disposeMaterials([material, material]);
    expect(disposeMaterial).toHaveBeenCalledTimes(1);
    expect(disposeFirst).toHaveBeenCalledTimes(1);
    expect(disposeSecond).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
