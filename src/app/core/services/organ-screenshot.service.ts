import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { OrganScreenshot } from '../models/organ.model';
import { isFiniteVector, isRecord } from '../models/storage-validation';

@Injectable({
  providedIn: 'root',
})
export class OrganScreenshotService {
  private readonly platformId = inject(PLATFORM_ID);

  /** LocalStorage key specified for persisting captured organ screenshots and metadata. */
  public static readonly STORAGE_KEY = 'ORIGAN-INFO';

  /** Maximum number of screenshots retained in localStorage to stay well within browser quota. */
  private static readonly MAX_STORED_SCREENSHOTS = 12;

  private readonly _screenshots = signal<OrganScreenshot[]>(this.loadScreenshots());

  /** Reactive read-only signal of all stored screenshots under ORIGAN-INFO. */
  readonly screenshots = this._screenshots.asReadonly();

  /** Saves a new screenshot entry to the front of the list and persists it under "ORIGAN-INFO". */
  saveScreenshot(entry: Omit<OrganScreenshot, 'id' | 'capturedAt'>): OrganScreenshot | null {
    const record: OrganScreenshot = {
      ...entry,
      id: `capture-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      capturedAt: new Date().toISOString(),
    };

    const updated = [record, ...this._screenshots()].slice(
      0,
      OrganScreenshotService.MAX_STORED_SCREENSHOTS
    );

    if (!this.persistToStorage(updated)) return null;
    this._screenshots.set(updated);
    return record;
  }

  /** Returns screenshots filtered by a specific organ ID. */
  getScreenshotsByOrgan(organId: string): OrganScreenshot[] {
    return this._screenshots().filter((item) => item.organId === organId);
  }

  /** Deletes a specific screenshot by ID and updates "ORIGAN-INFO" in localStorage. */
  deleteScreenshot(id: string): boolean {
    const updated = this._screenshots().filter((item) => item.id !== id);
    if (!this.persistToStorage(updated)) return false;
    this._screenshots.set(updated);
    return true;
  }

  /** Clears all saved screenshots for a specific organ (or all organs if omitted). */
  clearScreenshots(organId?: string): boolean {
    const updated = organId
      ? this._screenshots().filter((item) => item.organId !== organId)
      : [];
    if (!this.persistToStorage(updated)) return false;
    this._screenshots.set(updated);
    return true;
  }

  private loadScreenshots(): OrganScreenshot[] {
    if (!isPlatformBrowser(this.platformId)) {
      return [];
    }

    try {
      const raw = localStorage.getItem(OrganScreenshotService.STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const ids = new Set<string>();
        return parsed.filter((item): item is OrganScreenshot => {
          if (!this.isScreenshot(item) || ids.has(item.id)) return false;
          ids.add(item.id);
          return true;
        });
      }
      if (this.isScreenshot(parsed)) {
        return [parsed];
      }
    } catch (error) {
      console.error('Failed to read ORIGAN-INFO from localStorage:', error);
    }

    return [];
  }

  private isScreenshot(value: unknown): value is OrganScreenshot {
    return isRecord(value) &&
      ['id', 'organId', 'organName'].every(key => typeof value[key] === 'string' && value[key].trim().length > 0) &&
      typeof value['imageDataUrl'] === 'string' && /^data:image\/(png|webp);base64,/.test(value['imageDataUrl']) &&
      typeof value['capturedAt'] === 'string' && Number.isFinite(Date.parse(value['capturedAt'])) &&
      (value['focusedPart'] === undefined || typeof value['focusedPart'] === 'string') &&
      isRecord(value['camera']) && isFiniteVector(value['camera']['position']) && isFiniteVector(value['camera']['target']);
  }

  private persistToStorage(items: OrganScreenshot[]): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }

    try {
      if (items.length === 0) {
        localStorage.removeItem(OrganScreenshotService.STORAGE_KEY);
      } else {
        localStorage.setItem(OrganScreenshotService.STORAGE_KEY, JSON.stringify(items));
      }
      return true;
    } catch (error) {
      console.error('Failed to save screenshot to localStorage (ORIGAN-INFO):', error);
      return false;
    }
  }
}

