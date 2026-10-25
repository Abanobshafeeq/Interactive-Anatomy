import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  TEETH_CATALOG,
  MODEL_TEETH,
  ToothData,
  ToothQuadrant,
  DivisionMode,
  ToothState,
} from '../models/dental.model';
import { isHexColor, isRecord } from '../models/storage-validation';

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
  minU: number;
  maxU: number;
  midU: number;
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
 * Exact UV horizontal distance (`uDist` from arch midline symmetry axis) of the 6 sculpted
 * interproximal grooves per half-arch in `teeth.OBJ` (7 physical teeth per quadrant = 28 teeth total).
 * Each corner tooth (#2, #15, #18, #31) is counted as a single complete molar from crease 6 to the back.
 */
const UPPER_SYMMETRY_U = 0.3784;
const LOWER_SYMMETRY_U = 0.65595;

const UPPER_CREASE_U_DIST: readonly number[] = [
  0.0000, // Midline (#8 | #9)
  0.0550, // Central | Lateral (#8|#7, #9|#10)
  0.1033, // Lateral | Canine (#7|#6, #10|#11)
  0.1497, // Canine | 1st Premolar (#6|#5, #11|#12)
  0.1920, // 1st | 2nd Premolar (#5|#4, #12|#13)
  0.2441, // 2nd Premolar | 1st Molar (#4|#3, #13|#14)
  0.3010, // 1st | Corner 2nd Molar (#3|#2, #14|#15)
  0.3800, // Distal border of Corner 2nd Molar (#2, #15)
];

const LOWER_CREASE_U_DIST: readonly number[] = [
  0.0000, // Midline (#25 | #24)
  0.0469, // Central | Lateral (#25|#26, #24|#23)
  0.0864, // Lateral | Canine (#26|#27, #23|#22)
  0.1235, // Canine | 1st Premolar (#27|#28, #22|#21)
  0.1601, // 1st | 2nd Premolar (#28|#29, #21|#20)
  0.2088, // 2nd Premolar | 1st Molar (#29|#30, #20|#19)
  0.2685, // 1st | Corner 2nd Molar (#30|#31, #19|#18)
  0.3400, // Distal border of Corner 2nd Molar (#31, #18)
];

/**
 * Natural 3D interproximal vertical valleys/creases (from inner lingual/palatal to outer labial/buccal)
 * used to compute local arch tangents and as a 3D fallback when UV coordinates are not provided.
 */
const UPPER_ARCH_CREASES: readonly ArchCreasePlane[] = [
  { x1: 0.00, z1: 31.80, x2: 0.00, z2: 33.50 },                 // Midline (#8 | #9)
  { x1: 7.50, z1: 30.00, x2: 8.30, z2: 31.20 },                 // Central | Lateral (#8|#7, #9|#10)
  { x1: 13.50, z1: 26.50, x2: 15.10, z2: 27.65 },               // Lateral | Canine (#7|#6, #10|#11)
  { x1: 16.85, z1: 21.00, x2: 20.00, z2: 22.85 },               // Canine | 1st Premolar (#6|#5, #11|#12)
  { x1: 19.00, z1: 15.80, x2: 21.95, z2: 17.05 },               // 1st | 2nd Premolar (#5|#4, #12|#13)
  { x1: 21.20, z1: 8.70, x2: 25.60, z2: 10.00 },                // 2nd Premolar | 1st Molar (#4|#3, #13|#14)
  { x1: 22.75, z1: 0.70, x2: 27.00, z2: 1.50, yTilt: 0.16 },    // 1st | Corner 2nd Molar (#3|#2, #14|#15)
  { x1: 24.50, z1: -9.80, x2: 27.50, z2: -9.50 },               // Distal border of Corner 2nd Molar (#2, #15)
];

const LOWER_ARCH_CREASES: readonly ArchCreasePlane[] = [
  { x1: 0.00, z1: 27.00, x2: 0.00, z2: 30.10 },                 // Midline (#25 | #24)
  { x1: 6.45, z1: 25.80, x2: 7.20, z2: 28.35 },                 // Central | Lateral (#25|#26, #24|#23)
  { x1: 10.50, z1: 22.50, x2: 13.10, z2: 25.85 },               // Lateral | Canine (#26|#27, #23|#22)
  { x1: 13.50, z1: 19.00, x2: 17.30, z2: 21.75 },               // Canine | 1st Premolar (#27|#28, #22|#21)
  { x1: 16.20, z1: 14.80, x2: 18.45, z2: 16.20 },               // 1st | 2nd Premolar (#28|#29, #21|#20)
  { x1: 18.10, z1: 7.80, x2: 21.70, z2: 9.10 },                 // 2nd Premolar | 1st Molar (#29|#30, #20|#19)
  { x1: 21.20, z1: -0.10, x2: 25.30, z2: 0.50 },                // 1st | Corner 2nd Molar (#30|#31, #19|#18)
  { x1: 22.90, z1: -9.80, x2: 26.00, z2: -9.60 },               // Distal border of Corner 2nd Molar (#31, #18)
];

@Injectable({
  providedIn: 'root'
})
export class DentalService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly STORAGE_KEY_STATES = 'anatomy_dental_tooth_states';
  private readonly STORAGE_KEY_GRID = 'anatomy_dental_show_grid_lines';
  private readonly teeth: Record<number, ToothData> = Object.fromEntries(MODEL_TEETH.map(tooth => [tooth.number, tooth]));

  /**
   * Gum vs Enamel pixel classification:
   * Never rejects tooth crown vertices/triangles based on brightness thresholds or warm
   * cervical enamel shading near the gum margin.
   * Only classifies a pixel as Gum if it is distinctly deep pink/reddish gingival tissue.
   */
  isGumPixel(r: number, g: number, b: number): boolean {
    const isGum = (r - g) >= 38 && (r - b) >= 48;
    return isGum;
  }

  isEnamelPixel(r: number, g: number, b: number): boolean {
    return !this.isGumPixel(r, g, b);
  }

  /**
   * Identifies the exact tooth given local mesh vertex coordinates (and UV `u` when available).
   * Using `u` (unwrapped along the 6 sculpted interproximal valleys per half-arch) guarantees 0% overlap
   * between adjacent teeth and treats each corner molar as a single complete tooth (28 teeth total).
   */
  identifyTooth(x: number, y: number, z: number, isUpper: boolean, u?: number): ToothData {
    let archIdx = 0;

    if (u !== undefined) {
      const uSym = isUpper ? UPPER_SYMMETRY_U : LOWER_SYMMETRY_U;
      const uDist = x >= 0 ? (uSym - u) : (u - uSym);
      const creasesU = isUpper ? UPPER_CREASE_U_DIST : LOWER_CREASE_U_DIST;

      for (let i = 1; i < creasesU.length - 1; i++) {
        if (uDist >= creasesU[i]) {
          archIdx = i;
        }
      }
    } else {
      const creases = isUpper ? UPPER_ARCH_CREASES : LOWER_ARCH_CREASES;
      const ax = Math.abs(x);

      for (let i = 1; i < creases.length - 1; i++) {
        const c = creases[i];
        const zAdj = c.yTilt ? z - c.yTilt * y : z;
        const cross = (c.x2 - c.x1) * (zAdj - c.z1) - (c.z2 - c.z1) * (ax - c.x1);
        if (cross < 0) {
          archIdx = i;
        }
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
    const clampedIdx = Math.max(0, Math.min(creases.length - 2, idx));
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
   * Uses UV `u` when available so the vertical split is 100% parallel to the sculpted
   * mesial and distal interproximal grooves from gum line to incisal edge.
   * Q1: Top-Left, Q2: Top-Right, Q3: Bottom-Left, Q4: Bottom-Right
   */
  getQuadrant(
    x: number,
    y: number,
    tooth: ToothData,
    bounds?: ToothEnamelBounds,
    z = tooth.center.z,
    u?: number
  ): ToothQuadrant {
    const midY = bounds ? bounds.midY : tooth.center.y;
    const isTop = y >= midY;

    let isLeft: boolean;
    if (u !== undefined && bounds) {
      // Across both arches, `u` decreases monotonically from Left to Right along the arch
      isLeft = u > bounds.midU;
    } else {
      const h = this.projectHorizontal(x, z, tooth, bounds);
      const midH = bounds
        ? bounds.midH
        : this.projectHorizontal(tooth.center.x, tooth.center.z, tooth);
      isLeft = h < midH;
    }

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
   * for crisp, high-contrast CAD grid line visualization across front and back teeth (#1-#32).
   */
  isNearBoundary(
    x: number,
    y: number,
    tooth: ToothData,
    mode: DivisionMode,
    bounds?: ToothEnamelBounds,
    z = tooth.center.z,
    epsilon = 0.14,
    u?: number
  ): boolean {
    if (mode === 1) return false;
    const midY = bounds ? bounds.midY : tooth.center.y;
    const dy = y - midY;

    let nearVertical = false;
    if (u !== undefined && bounds) {
      const uSpan = Math.max(0.015, bounds.maxU - bounds.minU);
      nearVertical = Math.abs(u - bounds.midU) < uSpan * 0.032;
    } else {
      const h = this.projectHorizontal(x, z, tooth, bounds);
      const midH = bounds
        ? bounds.midH
        : this.projectHorizontal(tooth.center.x, tooth.center.z, tooth);
      nearVertical = Math.abs(h - midH) < epsilon;
    }

    if (mode === 2) {
      return nearVertical;
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
      return nearVertical || Math.abs(dy) < epsilon;
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
    if (!isHexColor(hex)) return [1, 1, 1];
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

  /**
   * Saves all tooth segmentation modes and zone colorings to localStorage.
   */
  saveToothStates(states: Map<number, ToothState>): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    try {
      const serialized: Record<number, ToothState> = {};
      for (const [toothNumber, state] of states.entries()) {
        const valid = this.validateToothState(toothNumber, state);
        if (valid) serialized[toothNumber] = valid;
      }
      localStorage.setItem(this.STORAGE_KEY_STATES, JSON.stringify(serialized));
      return true;
    } catch (error) {
      console.error('Failed to save dental tooth states to localStorage', error);
      return false;
    }
  }

  /**
   * Loads saved tooth segmentation modes and zone colorings from localStorage.
   */
  loadToothStates(): Map<number, ToothState> {
    const map = new Map<number, ToothState>();
    if (!isPlatformBrowser(this.platformId)) return map;
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY_STATES);
      if (!raw) return map;
      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) return map;
      for (const [key, state] of Object.entries(parsed)) {
        const num = Number(key);
        const valid = this.validateToothState(num, state);
        if (valid && String(num) === key) map.set(num, valid);
      }
    } catch (error) {
      console.error('Failed to load dental tooth states from localStorage', error);
    }
    return map;
  }

  private validateToothState(toothNumber: number, state: unknown): ToothState | null {
    if (!Number.isInteger(toothNumber) || !Object.hasOwn(TEETH_CATALOG, toothNumber) || !isRecord(state)) return null;
    const mode = state['divisionMode'] ?? 4;
    if (mode !== 1 && mode !== 2 && mode !== 3 && mode !== 4) return null;
    const zones: Record<string, string> = {};
    if (isRecord(state['zones'])) {
      // Both families can coexist when users switch division modes.
      for (const [key, color] of Object.entries(state['zones'])) {
        if (['q1', 'q2', 'q3', 'q4', 'top', 'middle', 'bottom'].includes(key) && isHexColor(color)) {
          zones[key] = color;
        }
      }
    }
    return { divisionMode: mode, zones };
  }

  saveGridLinesPreference(show: boolean): boolean {
    if (!isPlatformBrowser(this.platformId)) return false;
    try {
      localStorage.setItem(this.STORAGE_KEY_GRID, JSON.stringify(show));
      return true;
    } catch (error) {
      console.error('Failed to save dental grid lines preference to localStorage', error);
      return false;
    }
  }

  loadGridLinesPreference(): boolean {
    if (!isPlatformBrowser(this.platformId)) return true;
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY_GRID);
      if (raw !== null) {
        const parsed: unknown = JSON.parse(raw);
        return typeof parsed === 'boolean' ? parsed : true;
      }
    } catch (error) {
      console.error('Failed to load dental grid lines preference from localStorage', error);
    }
    return true;
  }
}
