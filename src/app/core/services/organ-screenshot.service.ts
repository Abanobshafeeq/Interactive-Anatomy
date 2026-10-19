import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { OrganScreenshot } from '../models/organ.model';

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
  saveScreenshot(entry: Omit<OrganScreenshot, 'id' | 'capturedAt'>): OrganScreenshot {
    const record: OrganScreenshot = {
      ...entry,
      id: `capture-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      capturedAt: new Date().toISOString(),
    };

    const updated = [record, ...this._screenshots()].slice(
      0,
      OrganScreenshotService.MAX_STORED_SCREENSHOTS
    );

    const persisted = this.persistToStorage(updated);
    this._screenshots.set(persisted);
    return record;
  }

  /** Returns screenshots filtered by a specific organ ID. */
  getScreenshotsByOrgan(organId: string): OrganScreenshot[] {
    return this._screenshots().filter((item) => item.organId === organId);
  }

  /** Deletes a specific screenshot by ID and updates "ORIGAN-INFO" in localStorage. */
  deleteScreenshot(id: string): void {
    const updated = this._screenshots().filter((item) => item.id !== id);
    const persisted = this.persistToStorage(updated);
    this._screenshots.set(persisted);
  }

  /** Clears all saved screenshots for a specific organ (or all organs if omitted). */
  clearScreenshots(organId?: string): void {
    const updated = organId
      ? this._screenshots().filter((item) => item.organId !== organId)
      : [];
    const persisted = this.persistToStorage(updated);
    this._screenshots.set(persisted);
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
        return parsed as OrganScreenshot[];
      }
      if (parsed && typeof parsed === 'object' && 'imageDataUrl' in parsed) {
        return [parsed as OrganScreenshot];
      }
    } catch (error) {
      console.error('Failed to read ORIGAN-INFO from localStorage:', error);
    }

    return [];
  }

  private persistToStorage(items: OrganScreenshot[]): OrganScreenshot[] {
    if (!isPlatformBrowser(this.platformId)) {
      return items;
    }

    const list = [...items];
    while (list.length > 0) {
      try {
        localStorage.setItem(OrganScreenshotService.STORAGE_KEY, JSON.stringify(list));
        return list;
      } catch (error) {
        // If localStorage quota is exceeded, drop the oldest capture and retry
        if (list.length > 1) {
          list.pop();
        } else {
          console.error('Failed to save screenshot to localStorage (ORIGAN-INFO):', error);
          break;
        }
      }
    }

    if (list.length === 0) {
      try {
        localStorage.removeItem(OrganScreenshotService.STORAGE_KEY);
      } catch {
        // Ignore storage removal errors
      }
    }

    return list;
  }
}

