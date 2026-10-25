import { TestBed } from '@angular/core/testing';
import * as THREE from 'three';
import { DentalService } from '../../../../core/services/dental.service';
import { DentalTextureSampler } from './dental-texture';

describe('DentalTextureSampler', () => {
  it('reuses CPU samples and retains the size limit', () => {
    const sampler = new DentalTextureSampler(TestBed.inject(DentalService));
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const sample = sampler.getSample(canvas);
    expect(sample?.width).toBe(1024);
    expect(sample?.height).toBe(512);
    expect(sampler.getSample(canvas)).toBe(sample);
  });

  it('treats missing UVs and root geometry as gum', () => {
    const sampler = new DentalTextureSampler(TestBed.inject(DentalService));
    const mesh = new THREE.Mesh();
    mesh.name = 'Group1059';
    const hit: THREE.Intersection = { object: mesh, distance: 0, point: new THREE.Vector3(0, 10, 0) };
    expect(sampler.isGum(hit)).toBeTrue();
    hit.uv = new THREE.Vector2(.4, .9);
    expect(sampler.isGum(hit)).toBeTrue();
    hit.point.y = 0;
    expect(sampler.isGum(hit)).toBeFalse();
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    materials.forEach(material => material.dispose());
  });
});
