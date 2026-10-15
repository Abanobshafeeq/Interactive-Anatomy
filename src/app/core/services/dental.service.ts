import { Injectable } from '@angular/core';
import { TEETH_CATALOG, ToothData, ToothQuadrant, ToothQuadrantColors } from '../models/dental.model';

@Injectable({
  providedIn: 'root'
})
export class DentalService {
  private readonly teeth = TEETH_CATALOG;

  /**
   * Identifies the closest tooth given raw mesh vertex coordinates.
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
      const distSq = dx * dx + dy * dy + dz * dz;

      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        closestTooth = tooth;
      }
    }

    return closestTooth;
  }

  /**
   * Determines which quadrant (q1..q4) a vertex belongs to relative to the tooth's center.
   * Q1: Top-Left, Q2: Top-Right, Q3: Bottom-Left, Q4: Bottom-Right
   */
  getQuadrant(x: number, y: number, tooth: ToothData): ToothQuadrant {
    const isTop = y >= tooth.center.y;
    const isLeft = x < tooth.center.x;

    if (isTop && isLeft) return 'q1';
    if (isTop && !isLeft) return 'q2';
    if (!isTop && isLeft) return 'q3';
    return 'q4';
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
