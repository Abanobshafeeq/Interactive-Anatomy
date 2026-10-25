import { TestBed } from '@angular/core/testing';
import * as THREE from 'three';
import { DentalService } from '../../../../core/services/dental.service';
import { computeToothBounds } from './dental-geometry';
import { DENTAL_GOLDEN } from '../testing/dental-golden';
import { dentalMeshes, disposeDentalFixture, hashDentalData, loadDentalFixture } from '../testing/dental-fixture';

describe('Dental geometry equivalence', () => {
  let model: THREE.Group;
  beforeAll(async () => { model = await loadDentalFixture(); });
  afterAll(() => { if (model) disposeDentalFixture(model); });

  it('preserves every subdivided position, normal, and UV from the original actual asset', async () => {
    const expected: Record<string, Record<string, string>> = DENTAL_GOLDEN.geometry;
    for (const mesh of dentalMeshes(model)) {
      for (const name of ['position', 'normal', 'uv']) {
        const attribute = mesh.geometry.attributes[name];
        expect(await hashDentalData(attribute.array)).withContext(`${mesh.name}/${name}`).toBe(expected[mesh.name][name]);
      }
    }
  });

  it('preserves all measured bounds while leaving catalog calibration to the caller', async () => {
    const dental = TestBed.inject(DentalService);
    const calibrate = spyOn(dental, 'calibrateToothCenter');
    const bounds = computeToothBounds(model, null, dental);
    expect(bounds.size).toBe(28);
    expect(await hashDentalData(JSON.stringify([...bounds]))).toBe(DENTAL_GOLDEN.bounds);
    expect(calibrate).not.toHaveBeenCalled();
  });
});
