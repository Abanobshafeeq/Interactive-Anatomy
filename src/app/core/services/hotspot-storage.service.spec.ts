import { TestBed } from '@angular/core/testing';
import { HotspotStorageService } from './hotspot-storage.service';
import { Hotspot } from '../models/organ.model';

describe('HotspotStorageService', () => {
  let service: HotspotStorageService;
  let storage: Map<string, string>;
  const key = 'anatomy_custom_hotspots_brain';
  const point: Hotspot = { id: 'custom-1', name: 'Point', description: '', isCustom: true,
    position: { x: 0, y: 0.5, z: 1 }, normal: { x: 0, y: 0, z: 1 }, value: 0 };

  beforeEach(() => {
    TestBed.configureTestingModule({});
    storage = new Map();
    spyOn(Storage.prototype, 'getItem').and.callFake(key => storage.get(key) ?? null);
    spyOn(Storage.prototype, 'setItem').and.callFake((key, value) => { storage.set(key, value); });
    spyOn(console, 'error');
    service = TestBed.inject(HotspotStorageService);
  });

  it('round-trips custom records under their organ key', () => {
    expect(service.saveCustomHotspots('brain', [point, { ...point, id: 'built-in', isCustom: false }])).toBeTrue();
    expect(service.loadCustomHotspots('brain')).toEqual([point]);
    expect(service.loadCustomHotspots('heart')).toEqual([]);
  });

  it('ignores malformed entries and duplicate IDs while retaining valid records', () => {
    storage.set(key, JSON.stringify([null, {}, { ...point, id: '' }, { ...point, name: '' },
      { ...point, position: { x: '0', y: 1, z: 2 } }, { ...point, normal: { x: 0, y: 0, z: 0 } },
      { ...point, description: null }, { ...point, value: 'bad' }, point, point]));
    expect(service.loadCustomHotspots('brain')).toEqual([point]);
  });

  it('rejects non-finite coordinates', () => {
    (Storage.prototype.getItem as jasmine.Spy).and.returnValue('[{"id":"x","name":"X","description":"","isCustom":true,"position":{"x":1e400,"y":0,"z":0}}]');
    expect(service.loadCustomHotspots('brain')).toEqual([]);
  });

  it('accepts records without optional normal or value', () => {
    const { normal, value, ...minimal } = point;
    storage.set(key, JSON.stringify([minimal]));
    expect(service.loadCustomHotspots('brain')).toEqual([minimal]);
    storage.set(key, JSON.stringify([{ ...point, value: null }]));
    expect(service.loadCustomHotspots('brain')).toEqual([{ ...point, value: undefined }]);
  });

  it('handles malformed JSON, wrong top-level shapes, and storage denial', () => {
    for (const raw of ['{', 'null', '{}', '1']) {
      storage.set(key, raw);
      expect(service.loadCustomHotspots('brain')).toEqual([]);
    }
    (Storage.prototype.getItem as jasmine.Spy).and.throwError('Storage denied');
    expect(service.loadCustomHotspots('brain')).toEqual([]);
    (Storage.prototype.setItem as jasmine.Spy).and.throwError('Quota exceeded');
    expect(service.saveCustomHotspots('brain', [point])).toBeFalse();
  });
});
