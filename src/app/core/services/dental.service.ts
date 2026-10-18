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
  minZ: number;
  maxZ: number;
  midX: number;
  midY: number;
  midZ: number;
  minH: number;
  maxH: number;
  midH: number;
  archTangent: { x: number; z: number };
  anchor: { x: number; y: number; z: number };
}

interface ArchCreasePlane {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  yTilt?: number;
}

/**
 * Natural interproximal vertical valleys/creases (from inner lingual/palatal to outer labial/buccal)
 * separating the 8 teeth along each half-arch from midline (index 0) to 3rd molar (index 8).
 */
const UPPER_ARCH_CREASES: readonly ArchCreasePlane[] = [
  { x1: 0.00, z1: 31.80, x2: 0.00, z2: 33.50 },                 // Midline (#8 | #9)
  { x1: 7.50, z1: 30.00, x2: 8.30, z2: 31.20 },                 // Central | Lateral (#8|#7, #9|#10)
  { x1: 13.50, z1: 26.50, x2: 15.10, z2: 27.65 },               // Lateral | Canine (#7|#6, #10|#11)
  { x1: 16.85, z1: 21.00, x2: 20.00, z2: 22.85 },               // Canine | 1st Premolar (#6|#5, #11|#12)
  { x1: 19.00, z1: 15.80, x2: 21.95, z2: 17.05 },               // 1st | 2nd Premolar (#5|#4, #12|#13)
  { x1: 21.20, z1: 8.70, x2: 25.60, z2: 10.00 },                // 2nd Premolar | 1st Molar (#4|#3, #13|#14)
  { x1: 22.75, z1: 0.70, x2: 27.00, z2: 1.50, yTilt: 0.16 },    // 1st | 2nd Molar (#3|#2, #14|#15)
  { x1: 23.20, z1: -3.80, x2: 28.20, z2: -3.20, yTilt: 0.16 },  // 2nd | 3rd Molar (#2|#1, #15|#16)
  { x1: 24.50, z1: -9.80, x2: 27.50, z2: -9.50 },               // Distal border of 3rd Molar (#1, #16)
];

const LOWER_ARCH_CREASES: readonly ArchCreasePlane[] = [
  { x1: 0.00, z1: 27.00, x2: 0.00, z2: 30.10 },                 // Midline (#25 | #24)
  { x1: 6.45, z1: 25.80, x2: 7.20, z2: 28.35 },                 // Central | Lateral (#25|#26, #24|#23)
  { x1: 10.50, z1: 22.50, x2: 13.10, z2: 25.85 },               // Lateral | Canine (#26|#27, #23|#22)
  { x1: 13.50, z1: 19.00, x2: 17.30, z2: 21.75 },               // Canine | 1st Premolar (#27|#28, #22|#21)
  { x1: 16.20, z1: 14.80, x2: 18.45, z2: 16.20 },               // 1st | 2nd Premolar (#28|#29, #21|#20)
  { x1: 18.10, z1: 7.80, x2: 21.70, z2: 9.10 },                 // 2nd Premolar | 1st Molar (#29|#30, #20|#19)
  { x1: 21.20, z1: -0.10, x2: 25.10, z2: 0.90 },                // 1st | 2nd Molar (#30|#31, #19|#18)
  { x1: 21.70, z1: -4.30, x2: 26.60, z2: -3.20 },               // 2nd | 3rd Molar (#31|#32, #18|#17)
  { x1: 22.90, z1: -9.80, x2: 26.00, z2: -9.60 },               // Distal border of 3rd Molar (#32, #17)
];

@Injectable({
  providedIn: 'root'
})
export class DentalService {
  private readonly teeth = TEETH_CATALOG;

  /**
   * Gum vs Enamel pixel classification:
   * Never rejects tooth crown vertices/triangles based on brightness thresholds (so shaded
   * occlusal pits and enamel grooves never leave uncolored holes).
   * Only classifies a pixel as Gum if it is distinctly pink/reddish.
   */
  isGumPixel(r: number, g: number, b: number): boolean {
    const isGum = (r - g) >= 22 && (r - b) >= 28;
    return isGum;
  }

  isEnamelPixel(r: number, g: number, b: number): boolean {
    return !this.isGumPixel(r, g, b);
  }

  /**
   * Identifies the exact tooth (#1-#32) given local mesh vertex coordinates.
   * Uses the natural interproximal vertical valleys/creases along the U-shaped arch so
   * every tooth covers 100% of its crown width edge-to-edge without bleeding into neighbors.
   */
  identifyTooth(x: number, y: number, z: number, isUpper: boolean): ToothData {
    const creases = isUpper ? UPPER_ARCH_CREASES : LOWER_ARCH_CREASES;
    const ax = Math.abs(x);
    let archIdx = 0;

    for (let i = 1; i < creases.length - 1; i++) {
      const c = creases[i];
      const zAdj = c.yTilt ? z - c.yTilt * y : z;
      const cross = (c.x2 - c.x1) * (zAdj - c.z1) - (c.z2 - c.z1) * (ax - c.x1);
      if (cross < 0) {
        archIdx = i;
      }
    }

    let toothNumber: number;
    if (isUpper) {
      toothNumber = x < 0 ? (8 - archIdx) : (9 + archIdx);
    } else {
      toothNumber = x < 0 ? (25 + archIdx) : (24 - archIdx);
    }

    return this.teeth[toothNumber] ?? this.teeth[isUpper ? 8 : 25];
  }

  /**
   * Computes the tooth's unit local horizontal axis (`archTangent` in the XZ plane,
   * perpendicular to the tooth's outward facial normal) along the U-shaped dental arch.
   */
  getArchTangent(tooth: ToothData): { x: number; z: number } {
    const num = tooth.number;
    const isUpper = tooth.isUpper;
    const isRightSide = isUpper ? num <= 8 : num >= 25;
    const idx = isUpper
      ? (isRightSide ? 8 - num : num - 9)
      : (isRightSide ? num - 25 : 24 - num);

    const creases = isUpper ? UPPER_ARCH_CREASES : LOWER_ARCH_CREASES;
    const clampedIdx = Math.max(0, Math.min(7, idx));
    const cMesial = creases[clampedIdx];
    const cDistal = creases[clampedIdx + 1];
    const signX = isRightSide ? -1 : 1;

    // Outward facial normal in XZ (from lingual x1,z1 to buccal/labial x2,z2)
    const nx1 = signX * (cMesial.x2 - cMesial.x1);
    const nz1 = cMesial.z2 - cMesial.z1;
    const len1 = Math.hypot(nx1, nz1) || 1;

    const nx2 = signX * (cDistal.x2 - cDistal.x1);
    const nz2 = cDistal.z2 - cDistal.z1;
    const len2 = Math.hypot(nx2, nz2) || 1;

    const nx = (nx1 / len1 + nx2 / len2) * 0.5;
    const nz = (nz1 / len1 + nz2 / len2) * 0.5;
    const normLen = Math.hypot(nx, nz) || 1;

    // Arch tangent in XZ perpendicular to outward normal, oriented Left-to-Right
    return {
      x: nz / normLen,
      z: -nx / normLen,
    };
  }

  /**
   * Projects a 3D point (x, z) onto the tooth's local horizontal arch tangent axis.
   */
  projectHorizontal(x: number, z: number, tooth: ToothData, bounds?: ToothEnamelBounds): number {
    const tangent = bounds?.archTangent ?? this.getArchTangent(tooth);
    return x * tangent.x + z * tangent.z;
  }

  /**
   * Anchors/snaps the catalog tooth center to the true center of its white enamel crown.
   */
  calibrateToothCenter(
    toothNumber: number,
    anchor: { x: number; y: number; z: number },
    extents?: { width: number; height: number }
  ): void {
    const tooth = this.teeth[toothNumber];
    if (!tooth) return;
    tooth.center = { x: anchor.x, y: anchor.y, z: anchor.z };
    if (extents) {
      tooth.extents = { width: extents.width, height: extents.height };
    }
  }

  /**
   * Determines which quadrant (q1..q4) a vertex belongs to in the arch-aware local frame.
   * Q1: Top-Left, Q2: Top-Right, Q3: Bottom-Left, Q4: Bottom-Right
   */
  getQuadrant(
    x: number,
    y: number,
    tooth: ToothData,
    bounds?: ToothEnamelBounds,
    z = tooth.center.z
  ): ToothQuadrant {
    const h = this.projectHorizontal(x, z, tooth, bounds);
    const midH = bounds
      ? bounds.midH
      : this.projectHorizontal(tooth.center.x, tooth.center.z, tooth);
    const midY = bounds ? bounds.midY : tooth.center.y;
    const isTop = y >= midY;
    const isLeft = h < midH;

    if (isTop && isLeft) return 'q1';
    if (isTop && !isLeft) return 'q2';
    if (!isTop && isLeft) return 'q3';
    return 'q4';
  }

  /**
   * Mode 3 helper: classifies into 3 vertical bands using dynamic enamel bounds [minY, maxY].
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
    const halfH = (tooth.extents?.height ?? 8.0) / 2;
    const minY = tooth.center.y - halfH;
    const height = halfH * 2;
    const t1 = minY + (height / 3);
    const t2 = minY + (2 * height / 3);
    if (y >= t2) return 'top';
    if (y >= t1) return 'middle';
    return 'bottom';
  }

  /**
   * Checks if a vertex is near a division boundary in the tooth's arch-aware local frame
   * for crisp CAD grid line visualization across front and back teeth (#1-#32).
   */
  isNearBoundary(
    x: number,
    y: number,
    tooth: ToothData,
    mode: DivisionMode,
    bounds?: ToothEnamelBounds,
    z = tooth.center.z,
    epsilon = 0.11
  ): boolean {
    if (mode === 1) return false;
    const h = this.projectHorizontal(x, z, tooth, bounds);
    const midH = bounds
      ? bounds.midH
      : this.projectHorizontal(tooth.center.x, tooth.center.z, tooth);
    const midY = bounds ? bounds.midY : tooth.center.y;
    const dh = h - midH;
    const dy = y - midY;

    if (mode === 2) {
      return Math.abs(dh) < epsilon;
    }
    if (mode === 3) {
      if (bounds) {
        const height = bounds.maxY - bounds.minY;
        const line1 = bounds.minY + (height / 3);
        const line2 = bounds.minY + (2 * height / 3);
        return Math.abs(y - line1) < epsilon || Math.abs(y - line2) < epsilon;
      }
      return Math.abs(dy - 1.3) < epsilon || Math.abs(dy + 1.3) < epsilon;
    }
    if (mode === 4) {
      return Math.abs(dh) < epsilon || Math.abs(dy) < epsilon;
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
