import { TestBed } from '@angular/core/testing';
import { DentalService } from './dental.service';
import { MODEL_TEETH, TEETH_CATALOG } from '../models/dental.model';

describe('DentalService', () => {
  let service: DentalService;
  let raw: string | null;
  beforeEach(() => {
    TestBed.configureTestingModule({});
    raw = null;
    spyOn(Storage.prototype, 'getItem').and.callFake(() => raw);
    spyOn(Storage.prototype, 'setItem').and.callFake((_key, value) => { raw = value; });
    spyOn(console, 'error');
    service = TestBed.inject(DentalService);
  });

  it('retains valid existing state across all modes and catalog teeth', () => {
    raw = JSON.stringify({ 1: { divisionMode: 1, zones: { q1: '#abc' } },
      8: { divisionMode: 2, zones: { q1: '#4A9CFF' } },
      24: { divisionMode: 3, zones: { top: '#ff0000', q4: '#fff' } },
      32: { divisionMode: 4, zones: { q4: '#000' } } });
    const states = service.loadToothStates();
    expect(states.size).toBe(4);
    expect(service.saveToothStates(states)).toBeTrue();
    expect(service.loadToothStates()).toEqual(states);
  });

  it('filters invalid IDs, modes, zone keys, and colors independently', () => {
    raw = JSON.stringify({ 0: {}, 33: {}, '-1': {}, '2.5': {}, '08': {},
      2: { divisionMode: 9, zones: {} }, 3: { divisionMode: '4' },
      4: { divisionMode: 4, zones: { q1: '#abc', q2: '#gggggg', q3: 'red', q4: 123, unknown: '#fff' } }, 5: null });
    expect([...service.loadToothStates()]).toEqual([[4, { divisionMode: 4, zones: { q1: '#abc' } }]]);
  });

  it('normalizes missing fields safely', () => {
    raw = JSON.stringify({ 8: {}, 9: { zones: [] }, 10: { divisionMode: 3 } });
    expect(service.loadToothStates().get(8)).toEqual({ divisionMode: 4, zones: {} });
    expect(service.loadToothStates().get(9)?.zones).toEqual({});
    expect(service.loadToothStates().get(10)?.divisionMode).toBe(3);
  });

  it('handles malformed JSON, top-level shapes, and storage errors', () => {
    for (const invalid of ['{', 'null', '[]', 'false']) {
      raw = invalid;
      expect(service.loadToothStates().size).toBe(0);
    }
    (Storage.prototype.getItem as jasmine.Spy).and.throwError('Storage denied');
    expect(service.loadToothStates().size).toBe(0);
    (Storage.prototype.setItem as jasmine.Spy).and.throwError('Quota exceeded');
    expect(service.saveToothStates(new Map())).toBeFalse();
    expect(service.saveGridLinesPreference(false)).toBeFalse();
  });

  it('converts valid short and long hex colors and safely rejects malformed colors', () => {
    expect(service.hexToRgb('#f00')).toEqual([1, 0, 0]);
    expect(service.hexToRgb('#00FF00')).toEqual([0, 1, 0]);
    for (const color of ['#zzzzzz', '#12345g', '', '#12', 'red', 'ff0000']) {
      expect(service.hexToRgb(color)).toEqual([1, 1, 1]);
    }
  });

  it('only accepts boolean grid preferences', () => {
    raw = 'false';
    expect(service.loadGridLinesPreference()).toBeFalse();
    for (const invalid of ['"false"', '0', 'null', '{}']) {
      raw = invalid;
      expect(service.loadGridLinesPreference()).toBeTrue();
    }
    service.saveGridLinesPreference(false);
    expect(raw).toBe('false');
  });

  it('distinguishes the Universal 32-tooth catalog from the 28 physical teeth', () => {
    expect(Object.keys(TEETH_CATALOG).length).toBe(32);
    expect(service.getAllTeeth().length).toBe(28);
    for (const number of [1, 16, 17, 32]) {
      expect(TEETH_CATALOG[number].center).toBeUndefined();
      expect(service.getTooth(number)).toBeUndefined();
    }
    for (const tooth of MODEL_TEETH) {
      expect(service.identifyTooth(tooth.center.x, tooth.center.y, tooth.center.z, tooth.isUpper).number).toBe(tooth.number);
    }
  });

  it('maps UV band centers to every physical tooth in the correct arch', () => {
    const upper = [0, .055, .1033, .1497, .192, .2441, .301, .38];
    const lower = [0, .0469, .0864, .1235, .1601, .2088, .2685, .34];
    for (let i = 0; i < 7; i++) {
      const u = (upper[i] + upper[i + 1]) / 2;
      const l = (lower[i] + lower[i + 1]) / 2;
      expect(service.identifyTooth(-1, 0, 0, true, .3784 + u).number).toBe(8 - i);
      expect(service.identifyTooth(1, 0, 0, true, .3784 - u).number).toBe(9 + i);
      expect(service.identifyTooth(-1, 0, 0, false, .65595 + l).number).toBe(25 + i);
      expect(service.identifyTooth(1, 0, 0, false, .65595 - l).number).toBe(24 - i);
    }
  });

  it('assigns quadrants and thirds without gaps and suppresses whole-tooth grid lines', () => {
    const tooth = service.getTooth(8)!;
    const tangent = service.getArchTangent(tooth);
    const offset = (direction: number) => ({ x: tooth.center.x + tangent.x * direction, z: tooth.center.z + tangent.z * direction });
    const left = offset(-1), right = offset(1);
    expect(service.getQuadrant(left.x, tooth.center.y + 1, tooth, undefined, left.z)).toBe('q1');
    expect(service.getQuadrant(right.x, tooth.center.y + 1, tooth, undefined, right.z)).toBe('q2');
    expect(service.getQuadrant(left.x, tooth.center.y - 1, tooth, undefined, left.z)).toBe('q3');
    expect(service.getQuadrant(right.x, tooth.center.y - 1, tooth, undefined, right.z)).toBe('q4');
    expect(service.getThird(tooth.center.y + 4, tooth)).toBe('top');
    expect(service.getThird(tooth.center.y, tooth)).toBe('middle');
    expect(service.getThird(tooth.center.y - 4, tooth)).toBe('bottom');
    expect(service.isNearBoundary(tooth.center.x, tooth.center.y, tooth, 1)).toBeFalse();
    expect(service.isNearBoundary(tooth.center.x, tooth.center.y, tooth, 4)).toBeTrue();
  });
});
