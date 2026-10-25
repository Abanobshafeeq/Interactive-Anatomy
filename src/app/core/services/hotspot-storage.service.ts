import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Hotspot } from '../models/organ.model';
import { isFiniteVector, isRecord } from '../models/storage-validation';

@Injectable({
  providedIn: 'root'
})
export class HotspotStorageService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly STORAGE_KEY_PREFIX = 'anatomy_custom_hotspots_';

  saveCustomHotspots(organId: string, hotspots: Hotspot[]): boolean {
    if (!isPlatformBrowser(this.platformId) || !organId.trim()) return false;
    
    try {
      const customHotspots = hotspots.filter(h => h.isCustom);
      if (!customHotspots.every(hotspot => this.isHotspot(hotspot))) return false;
      const key = `${this.STORAGE_KEY_PREFIX}${organId}`;
      localStorage.setItem(key, JSON.stringify(customHotspots));
      return true;
    } catch (error) {
      console.error('Failed to save custom hotspots to localStorage', error);
      return false;
    }
  }

  loadCustomHotspots(organId: string): Hotspot[] {
    if (!isPlatformBrowser(this.platformId)) return [];
    
    try {
      const key = `${this.STORAGE_KEY_PREFIX}${organId}`;
      const data = localStorage.getItem(key);
      if (data) {
        const parsed: unknown = JSON.parse(data);
        if (!Array.isArray(parsed)) return [];
        const ids = new Set<string>();
        return parsed.flatMap((item): Hotspot[] => {
          const candidate = isRecord(item) && item['value'] === null ? { ...item, value: undefined } : item;
          if (!this.isHotspot(candidate) || ids.has(candidate.id)) return [];
          ids.add(candidate.id);
          return [candidate];
        });
      }
    } catch (error) {
      console.error('Failed to load custom hotspots from localStorage', error);
    }
    return [];
  }

  private isHotspot(value: unknown): value is Hotspot {
    // The storage key associates each record with its organ; custom positions are world-space.
    return isRecord(value) && value['isCustom'] === true &&
      typeof value['id'] === 'string' && value['id'].trim().length > 0 &&
      typeof value['name'] === 'string' && value['name'].trim().length > 0 &&
      typeof value['description'] === 'string' && isFiniteVector(value['position']) &&
      (value['normal'] === undefined || (isFiniteVector(value['normal']) &&
        Math.hypot(value['normal'].x, value['normal'].y, value['normal'].z) > 0)) &&
      (value['value'] === undefined || (typeof value['value'] === 'number' && Number.isFinite(value['value'])));
  }

  clearCustomHotspots(organId: string): void {
    if (!isPlatformBrowser(this.platformId)) return;
    
    try {
      const key = `${this.STORAGE_KEY_PREFIX}${organId}`;
      localStorage.removeItem(key);
    } catch (error) {
      console.error('Failed to clear custom hotspots from localStorage', error);
    }
  }
}
