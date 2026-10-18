import { Injectable } from '@angular/core';
import {
  TEETH_CATALOG,
  ToothData,
  ToothQuadrant,
  DivisionMode,
} from '../models/dental.model';

export interface ToothEnamelBounds {
  toothNumber: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  midX: number;
  midY: number;
  anchor: { x: number; y: number; z: number };
}

@Injectable({
  providedIn: 'root'
})
export class DentalService {
  private readonly teeth = TEETH_CATALOG;

  /**
   * Enamel vs Gum pixel detection:
   * Recognizes clean and naturally shaded tooth enamel (r > 115 && g > 105 && b > 85 with low redness difference (r - g) < 25).
   * Actual pink/red gum has high redness ((r - g) >= 24 or (r - b) >= 48) or dark mucosa (g < 95).
   */
  isEnamelPixel(r: number, g: number, b: number): boolean {
    if (r <= 115 || g <= 105 || b <= 85) return false;
    if ((r - g) >= 25 || (r - b) >= 48) return false;
    if (g < 95) return false;
    return true;
  }

  isGumPixel(r: number, g: number, b: number): boolean {
    return !this.isEnamelPixel(r, g, b);
  }

  /**
   * Identifies the closest tooth given raw mesh vertex coordinates.
   * Untouched original algorithm.
   */
  identifyTooth(x: number, y: number, z: number, isUpper: boolean): ToothData {
    let bestDistSq = Infinity;
    let closestTooth = this.teeth[isUpper ? 8 : 25];

    // Evaluate teeth in the corresponding arch
    for (const idStr of Object.keys(this.teeth)) {
      const id = Number(idStr);
      const tooth = this.teeth[id];
      if (tooth.isUpper !== isUpper) continue;

      const dx = x - tooth.center.x;
      const dy = y - tooth.center.y;
      const dz = z - tooth.center.z;
      // In the dental arch, teeth are arranged horizontally along the XZ horseshoe curve.
      // Small Y weighting (0.04) prevents slight vertical crown height differences from stealing neighbor teeth!
      const distSq = dx * dx + dz * dz + 0.04 * dy * dy;

      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        closestTooth = tooth;
      }
    }

    return closestTooth;
  }

  /**
   * Determines which quadrant (q1..q4) a vertex belongs to.
   * Uses dynamic enamel bounds (midX, midY) when provided, or fallback to tooth center.
   * Q1: Top-Left, Q2: Top-Right, Q3: Bottom-Left, Q4: Bottom-Right
   */
  getQuadrant(x: number, y: number, tooth: ToothData, bounds?: ToothEnamelBounds): ToothQuadrant {
    const midX = bounds ? bounds.midX : tooth.center.x;
    const midY = bounds ? bounds.midY : tooth.center.y;
    const isTop = y >= midY;
    const isLeft = x < midX;

    if (isTop && isLeft) return 'q1';
    if (isTop && !isLeft) return 'q2';
    if (!isTop && isLeft) return 'q3';
    return 'q4';
  }

  /**
   * Mode 3 helper: classifies into 3 vertical bands using dynamic enamel bounds or center offset.
   * Guaranteed zero gaps between the 3 thirds.
   */
  getThird(y: number, tooth: ToothData, bounds?: ToothEnamelBounds): 'top' | 'middle' | 'bottom' {
    if (bounds) {
      const height = bounds.maxY - bounds.minY;
      const t1 = bounds.minY + (height / 3);
      const t2 = bounds.minY + (2 * height / 3);
      if (y >= t2) return 'top';
      if (y >= t1) return 'middle';
      return 'bottom';
    }
    const dy = y - tooth.center.y;
    if (dy > 0.15) return 'top';
    if (dy < -0.15) return 'bottom';
    return 'middle';
  }

  /**
   * Checks if a vertex is near a division boundary for crisp grid line visualization.
   * Uses dynamic bounds when provided so lines sit squarely inside the enamel crown.
   */
  isNearBoundary(x: number, y: number, tooth: ToothData, mode: DivisionMode, bounds?: ToothEnamelBounds, epsilon = 0.12): boolean {
    if (mode === 1) return false;
    const midX = bounds ? bounds.midX : tooth.center.x;
    const midY = bounds ? bounds.midY : tooth.center.y;
    const dx = x - midX;
    const dy = y - midY;

    if (mode === 2) {
      return Math.abs(dx) < epsilon;
    }
    if (mode === 3) {
      if (bounds) {
        const height = bounds.maxY - bounds.minY;
        const line1 = bounds.minY + (height / 3);
        const line2 = bounds.minY + (2 * height / 3);
        return Math.abs(y - line1) < epsilon || Math.abs(y - line2) < epsilon;
      }
      return Math.abs(dy - 0.15) < epsilon || Math.abs(dy + 0.15) < epsilon;
    }
    if (mode === 4) {
      return Math.abs(dx) < epsilon || Math.abs(dy) < epsilon;
    }
    return false;
  }

  getTooth(toothNumber: number): ToothData | undefined {
    return this.teeth[toothNumber];
  }

  getAllTeeth(): ToothData[] {
    return Object.values(this.teeth);
  }

  hexToRgb(hex: string): [number, number, number] {
    let clean = hex.replace('#', '');
    if (clean.length === 3) {
      clean = clean.split('').map(c => c + c).join('');
    }
    const num = parseInt(clean, 16);
    return [
      ((num >> 16) & 255) / 255,
      ((num >> 8) & 255) / 255,
      (num & 255) / 255
    ];
  }
}
