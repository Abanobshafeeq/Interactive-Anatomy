import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OrganScreenshotService } from './organ-screenshot.service';
import { OrganScreenshot } from '../models/organ.model';

describe('OrganScreenshotService', () => {
  let storage: Map<string, string>;
  const entry: Omit<OrganScreenshot, 'id' | 'capturedAt'> = {
    organId: 'brain', organName: 'Brain', imageDataUrl: 'data:image/webp;base64,AAAA',
    camera: { position: { x: 0, y: 0, z: 4 }, target: { x: 0, y: 0, z: 0 } },
  };
  const create = () => TestBed.runInInjectionContext(() => new OrganScreenshotService());

  beforeEach(() => {
    TestBed.configureTestingModule({});
    storage = new Map();
    spyOn(Storage.prototype, 'getItem').and.callFake(key => storage.get(key) ?? null);
    spyOn(Storage.prototype, 'setItem').and.callFake((key, value) => { storage.set(key, value); });
    spyOn(Storage.prototype, 'removeItem').and.callFake(key => { storage.delete(key); });
    spyOn(console, 'error');
  });

  it('persists before publishing a saved record and reloads it', () => {
    const service = create();
    const saved = service.saveScreenshot(entry);
    expect(saved).not.toBeNull();
    expect(JSON.parse(storage.get(OrganScreenshotService.STORAGE_KEY)!)).toEqual([saved]);
    expect(service.screenshots()).toEqual([saved!]);
    expect(create().getScreenshotsByOrgan('brain')).toEqual([saved!]);
  });

  it('preserves existing data and returns failure on quota errors', () => {
    const service = create();
    const first = service.saveScreenshot(entry)!;
    const before = storage.get(OrganScreenshotService.STORAGE_KEY);
    (Storage.prototype.setItem as jasmine.Spy).and.throwError('Quota exceeded');
    expect(service.saveScreenshot(entry)).toBeNull();
    expect(service.screenshots()).toEqual([first]);
    expect(storage.get(OrganScreenshotService.STORAGE_KEY)).toBe(before);
  });

  it('handles serialization errors without publishing a save', () => {
    const service = create();
    spyOn(JSON, 'stringify').and.throwError('Serialization failed');
    expect(service.saveScreenshot(entry)).toBeNull();
    expect(service.screenshots()).toEqual([]);
  });

  it('deletes and clears persisted records', () => {
    const service = create();
    service.saveScreenshot(entry);
    service.saveScreenshot({ ...entry, organId: 'heart' });
    expect(service.clearScreenshots('brain')).toBeTrue();
    expect(service.getScreenshotsByOrgan('brain')).toEqual([]);
    expect(service.screenshots().length).toBe(1);
    expect(service.deleteScreenshot(service.screenshots()[0].id)).toBeTrue();
    expect(storage.has(OrganScreenshotService.STORAGE_KEY)).toBeFalse();
  });

  it('preserves memory if a deletion or clear fails', () => {
    const service = create();
    const saved = service.saveScreenshot(entry)!;
    (Storage.prototype.removeItem as jasmine.Spy).and.throwError('Storage denied');
    expect(service.deleteScreenshot(saved.id)).toBeFalse();
    expect(service.clearScreenshots()).toBeFalse();
    expect(service.screenshots()).toEqual([saved]);
  });

  it('retains the existing twelve-capture limit', () => {
    const service = create();
    for (let i = 0; i < 13; i++) service.saveScreenshot(entry);
    expect(service.screenshots().length).toBe(12);
    expect(create().screenshots()).toEqual(service.screenshots());
  });

  it('accepts valid legacy single records and filters malformed entries', () => {
    const saved = create().saveScreenshot(entry)!;
    storage.set(OrganScreenshotService.STORAGE_KEY, JSON.stringify(saved));
    expect(create().screenshots()).toEqual([saved]);
    storage.set(OrganScreenshotService.STORAGE_KEY, JSON.stringify([null, {}, saved, { ...saved, capturedAt: 'bad' }]));
    expect(create().screenshots()).toEqual([saved]);
  });

  it('handles malformed JSON and unavailable storage', () => {
    storage.set(OrganScreenshotService.STORAGE_KEY, '{');
    expect(create().screenshots()).toEqual([]);
    (Storage.prototype.getItem as jasmine.Spy).and.throwError('Storage denied');
    expect(create().screenshots()).toEqual([]);
  });

  it('does not claim persistence outside the browser', () => {
    TestBed.overrideProvider(PLATFORM_ID, { useValue: 'server' });
    const service = create();
    expect(service.saveScreenshot(entry)).toBeNull();
    expect(service.screenshots()).toEqual([]);
  });
});
