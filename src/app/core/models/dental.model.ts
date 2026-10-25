export type DivisionMode = 1 | 2 | 3 | 4;

export type ToothQuadrant = 'q1' | 'q2' | 'q3' | 'q4';

export interface ToothExtents {
  width: number;
  height: number;
  depth?: number;
}

export interface ToothState {
  divisionMode: DivisionMode;
  zones: Record<string, string>; // Maps 'q1'..'q4' or 'top'..'bottom' to hex color
}

export interface ToothCatalogEntry {
  number: number;
  name: string;
  isUpper: boolean;
  type: 'Incisor' | 'Canine' | 'Premolar' | 'Molar';
  center?: { x: number; y: number; z: number };
  extents?: ToothExtents;
}

export interface ToothData extends ToothCatalogEntry {
  center: { x: number; y: number; z: number };
}

// Universal numbering: wisdom teeth remain catalog entries but have no geometry in teeth.OBJ.
export const TEETH_CATALOG: Record<number, ToothCatalogEntry> = {
  1: { number: 1, name: 'Upper Right 3rd Molar', isUpper: true, type: 'Molar' },
  2: { number: 2, name: 'Upper Right 2nd Molar', isUpper: true, type: 'Molar', center: { x: -25.95, y: 1.69, z: -4.80 }, extents: { width: 9.8, height: 8.3 } },
  3: { number: 3, name: 'Upper Right 1st Molar', isUpper: true, type: 'Molar', center: { x: -24.31, y: 0.66, z: 4.73 }, extents: { width: 9.2, height: 9.4 } },
  4: { number: 4, name: 'Upper Right 2nd Premolar', isUpper: true, type: 'Premolar', center: { x: -22.65, y: -0.42, z: 12.97 }, extents: { width: 7.8, height: 8.8 } },
  5: { number: 5, name: 'Upper Right 1st Premolar', isUpper: true, type: 'Premolar', center: { x: -19.54, y: -1.00, z: 19.41 }, extents: { width: 6.1, height: 9.0 } },
  6: { number: 6, name: 'Upper Right Canine', isUpper: true, type: 'Canine', center: { x: -16.91, y: -1.69, z: 24.29 }, extents: { width: 6.6, height: 9.2 } },
  7: { number: 7, name: 'Upper Right Lateral Incisor', isUpper: true, type: 'Incisor', center: { x: -11.76, y: -1.73, z: 28.86 }, extents: { width: 7.7, height: 9.3 } },
  8: { number: 8, name: 'Upper Right Central Incisor', isUpper: true, type: 'Incisor', center: { x: -4.33, y: -1.98, z: 31.65 }, extents: { width: 7.9, height: 9.4 } },
  9: { number: 9, name: 'Upper Left Central Incisor', isUpper: true, type: 'Incisor', center: { x: 4.33, y: -1.97, z: 31.65 }, extents: { width: 7.9, height: 9.4 } },
  10: { number: 10, name: 'Upper Left Lateral Incisor', isUpper: true, type: 'Incisor', center: { x: 11.78, y: -1.72, z: 28.87 }, extents: { width: 7.7, height: 9.3 } },
  11: { number: 11, name: 'Upper Left Canine', isUpper: true, type: 'Canine', center: { x: 16.98, y: -1.69, z: 24.36 }, extents: { width: 6.7, height: 9.2 } },
  12: { number: 12, name: 'Upper Left 1st Premolar', isUpper: true, type: 'Premolar', center: { x: 19.60, y: -0.98, z: 19.63 }, extents: { width: 6.1, height: 8.9 } },
  13: { number: 13, name: 'Upper Left 2nd Premolar', isUpper: true, type: 'Premolar', center: { x: 22.60, y: -0.44, z: 13.13 }, extents: { width: 7.8, height: 8.7 } },
  14: { number: 14, name: 'Upper Left 1st Molar', isUpper: true, type: 'Molar', center: { x: 24.27, y: 0.60, z: 4.74 }, extents: { width: 9.2, height: 9.5 } },
  15: { number: 15, name: 'Upper Left 2nd Molar', isUpper: true, type: 'Molar', center: { x: 25.94, y: 1.64, z: -4.80 }, extents: { width: 9.8, height: 8.4 } },
  16: { number: 16, name: 'Upper Left 3rd Molar', isUpper: true, type: 'Molar' },
  17: { number: 17, name: 'Lower Left 3rd Molar', isUpper: false, type: 'Molar' },
  18: { number: 18, name: 'Lower Left 2nd Molar', isUpper: false, type: 'Molar', center: { x: 24.39, y: -7.82, z: -5.43 }, extents: { width: 9.5, height: 8.5 } },
  19: { number: 19, name: 'Lower Left 1st Molar', isUpper: false, type: 'Molar', center: { x: 21.88, y: -9.05, z: 3.05 }, extents: { width: 9.1, height: 8.7 } },
  20: { number: 20, name: 'Lower Left 2nd Premolar', isUpper: false, type: 'Premolar', center: { x: 19.14, y: -9.53, z: 11.76 }, extents: { width: 7.5, height: 8.1 } },
  21: { number: 21, name: 'Lower Left 1st Premolar', isUpper: false, type: 'Premolar', center: { x: 16.30, y: -10.27, z: 17.92 }, extents: { width: 5.6, height: 8.3 } },
  22: { number: 22, name: 'Lower Left Canine', isUpper: false, type: 'Canine', center: { x: 14.21, y: -10.49, z: 21.97 }, extents: { width: 5.7, height: 8.3 } },
  23: { number: 23, name: 'Lower Left Lateral Incisor', isUpper: false, type: 'Incisor', center: { x: 10.11, y: -10.97, z: 25.32 }, extents: { width: 6.0, height: 8.4 } },
  24: { number: 24, name: 'Lower Left Central Incisor', isUpper: false, type: 'Incisor', center: { x: 3.82, y: -11.30, z: 27.85 }, extents: { width: 6.8, height: 8.5 } },
  25: { number: 25, name: 'Lower Right Central Incisor', isUpper: false, type: 'Incisor', center: { x: -3.82, y: -11.30, z: 27.86 }, extents: { width: 6.8, height: 8.5 } },
  26: { number: 26, name: 'Lower Right Lateral Incisor', isUpper: false, type: 'Incisor', center: { x: -10.12, y: -10.96, z: 25.32 }, extents: { width: 6.0, height: 8.4 } },
  27: { number: 27, name: 'Lower Right Canine', isUpper: false, type: 'Canine', center: { x: -14.23, y: -10.49, z: 21.97 }, extents: { width: 5.7, height: 8.3 } },
  28: { number: 28, name: 'Lower Right 1st Premolar', isUpper: false, type: 'Premolar', center: { x: -16.30, y: -10.25, z: 17.92 }, extents: { width: 6.0, height: 8.4 } },
  29: { number: 29, name: 'Lower Right 2nd Premolar', isUpper: false, type: 'Premolar', center: { x: -19.15, y: -9.55, z: 11.76 }, extents: { width: 7.5, height: 8.1 } },
  30: { number: 30, name: 'Lower Right 1st Molar', isUpper: false, type: 'Molar', center: { x: -21.89, y: -9.06, z: 3.06 }, extents: { width: 9.1, height: 8.7 } },
  31: { number: 31, name: 'Lower Right 2nd Molar', isUpper: false, type: 'Molar', center: { x: -24.41, y: -7.83, z: -5.43 }, extents: { width: 9.5, height: 8.5 } },
  32: { number: 32, name: 'Lower Right 3rd Molar', isUpper: false, type: 'Molar' }
};

export const MODEL_TEETH: ToothData[] = Object.values(TEETH_CATALOG)
  .filter((tooth): tooth is ToothData => tooth.center !== undefined);

export interface DentalShadePreset {
  name: string;
  code: string;
  hex: string;
}

export const DENTAL_SHADE_PRESETS: DentalShadePreset[] = [
  { name: 'Treatment Area Highlight (Blue)', code: 'Highlight', hex: '#4A9CFF' },
  { name: 'Composite Filling', code: 'Composite', hex: '#EFEAD8' },
  { name: 'Porcelain Veneer', code: 'Veneer', hex: '#F7F6F2' },
  { name: 'Dental Crown', code: 'Crown', hex: '#ff0000' },
  { name: 'Natural Enamel', code: 'Natural', hex: '#FAF9F5' },
  { name: 'Bleach White', code: 'BL1', hex: '#FFFFFF' },
  { name: 'VITA Shade A1', code: 'A1', hex: '#31fe08' },
  { name: 'VITA Shade A2', code: 'A2', hex: '#E6DCBF' },
  { name: 'VITA Shade A3', code: 'A3', hex: '#D8CCA8' },
  { name: 'VITA Shade B1', code: 'B1', hex: '#EAE7CE' },
  { name: 'VITA Shade C1', code: 'C1', hex: '#DDD8C7' },
  { name: 'Restoration Gold', code: 'Gold', hex: '#E8B85C' },
  { name: 'Amber Glow', code: 'Amber', hex: '#F59E0B' }
];
