import { TestBed } from '@angular/core/testing';
import * as THREE from 'three';
import { DentalService, ToothEnamelBounds } from '../../../../core/services/dental.service';
import { ToothState } from '../../../../core/models/dental.model';
import { computeToothBounds } from './dental-geometry';
import { renderDentalColors } from './dental-color-renderer';
import { DENTAL_GOLDEN } from '../testing/dental-golden';
import { dentalMeshes, disposeDentalFixture, hashDentalData, loadDentalFixture } from '../testing/dental-fixture';

describe('Dental color equivalence', () => {
  let model: THREE.Group;
  let boundsMap: Map<number, ToothEnamelBounds>;
  beforeAll(async () => { model = await loadDentalFixture(); });
  afterAll(() => { if (model) disposeDentalFixture(model); });
  beforeEach(() => { boundsMap = computeToothBounds(model, null, TestBed.inject(DentalService)); });

  for (const mode of [1, 2, 3, 4] as const) for (const showGrid of [false, true]) {
    it(`preserves byte-for-byte colors in mode ${mode} with grid ${showGrid}`, async () => {
      const dental = TestBed.inject(DentalService);
      const statesMap = new Map<number, ToothState>(dental.getAllTeeth().map(tooth => [tooth.number, {
        divisionMode: mode, zones: { q1: '#4A9CFF', q2: '#abc', q3: '#ff0000', q4: '#00ff00',
          top: '#FFFFFF', middle: '#E8B85C', bottom: '#FAF9F5' },
      }]));
      const selectedTooth = dental.getTooth(8) ?? null;
      renderDentalColors(model, dental, { sample: null, statesMap, selectedTooth, showGrid, activeMode: mode, boundsMap });
      const expected: Record<string, Record<string, string>> = DENTAL_GOLDEN.colors;
      for (const mesh of dentalMeshes(model)) {
        expect(await hashDentalData(mesh.geometry.attributes['color'].array))
          .withContext(mesh.name).toBe(expected[`${mode}-${showGrid}`][mesh.name]);
        const buffer = mesh.geometry.attributes['color'];
        renderDentalColors(model, dental, { sample: null, statesMap, selectedTooth, showGrid, activeMode: mode, boundsMap });
        expect(mesh.geometry.attributes['color']).toBe(buffer);
      }
    });
  }

  it('preserves the pink-gum mask and restores uncolored buffers', () => {
    const dental = TestBed.inject(DentalService);
    const sample = { data: new Uint8ClampedArray([220, 80, 80, 255]), width: 1, height: 1 };
    renderDentalColors(model, dental, { sample, statesMap: new Map(), selectedTooth: null,
      showGrid: true, activeMode: 4, boundsMap });
    for (const mesh of dentalMeshes(model)) {
      expect(Array.from(mesh.geometry.attributes['color'].array).every(value => value === 1)).toBeTrue();
    }
  });
});
