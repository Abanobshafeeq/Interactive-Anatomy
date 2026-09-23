import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Hotspot } from '../models/organ.model';

@Injectable({
  providedIn: 'root'
})
export class HotspotStorageService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly STORAGE_KEY_PREFIX = 'anatomy_custom_hotspots_';

  saveCustomHotspots(organId: string, hotspots: Hotspot[]): void {
    if (!isPlatformBrowser(this.platformId)) return;
    
    try {
      const customHotspots = hotspots.filter(h => h.isCustom);
      const key = `${this.STORAGE_KEY_PREFIX}${organId}`;
      localStorage.setItem(key, JSON.stringify(customHotspots));
    } catch (error) {
      console.error('Failed to save custom hotspots to localStorage', error);
    }
  }

  loadCustomHotspots(organId: string): Hotspot[] {
    if (!isPlatformBrowser(this.platformId)) return [];
    
    try {
      const key = `${this.STORAGE_KEY_PREFIX}${organId}`;
      const data = localStorage.getItem(key);
      if (data) {
        return JSON.parse(data) as Hotspot[];
      }
    } catch (error) {
      console.error('Failed to load custom hotspots from localStorage', error);
    }
    return [];
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
