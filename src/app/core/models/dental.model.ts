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

export interface ToothData {
  number: number;
  name: string;
  isUpper: boolean;
  type: 'Incisor' | 'Canine' | 'Premolar' | 'Molar';
  center: { x: number; y: number; z: number };
  extents?: ToothExtents;
}

export const TEETH_CATALOG: Record<number, ToothData> = {
  1: { number: 1, name: 'Upper Right 3rd Molar', isUpper: true, type: 'Molar', center: { x: -26.01, y: 1.99, z: -7.01 }, extents: { width: 4.2, height: 8.3 } },
  2: { number: 2, name: 'Upper Right 2nd Molar', isUpper: true, type: 'Molar', center: { x: -25.87, y: 1.95, z: -0.82 }, extents: { width: 5.2, height: 8.3 } },
  3: { number: 3, name: 'Upper Right 1st Molar', isUpper: true, type: 'Molar', center: { x: -24.31, y: 0.79, z: 5.41 }, extents: { width: 8.6, height: 9.4 } },
  4: { number: 4, name: 'Upper Right 2nd Premolar', isUpper: true, type: 'Premolar', center: { x: -22.67, y: -0.45, z: 12.86 }, extents: { width: 7.8, height: 8.8 } },
  5: { number: 5, name: 'Upper Right 1st Premolar', isUpper: true, type: 'Premolar', center: { x: -19.44, y: -0.68, z: 19.51 }, extents: { width: 6.1, height: 9.0 } },
  6: { number: 6, name: 'Upper Right Canine', isUpper: true, type: 'Canine', center: { x: -17.05, y: -1.73, z: 24.30 }, extents: { width: 6.6, height: 9.2 } },
  7: { number: 7, name: 'Upper Right Lateral Incisor', isUpper: true, type: 'Incisor', center: { x: -11.23, y: -1.49, z: 28.98 }, extents: { width: 7.7, height: 9.3 } },
  8: { number: 8, name: 'Upper Right Central Incisor', isUpper: true, type: 'Incisor', center: { x: -4.36, y: -1.68, z: 31.58 }, extents: { width: 7.9, height: 9.4 } },
  9: { number: 9, name: 'Upper Left Central Incisor', isUpper: true, type: 'Incisor', center: { x: 4.36, y: -1.68, z: 31.58 }, extents: { width: 7.9, height: 9.4 } },
  10: { number: 10, name: 'Upper Left Lateral Incisor', isUpper: true, type: 'Incisor', center: { x: 11.23, y: -1.49, z: 29.00 }, extents: { width: 7.7, height: 9.3 } },
  11: { number: 11, name: 'Upper Left Canine', isUpper: true, type: 'Canine', center: { x: 17.13, y: -1.73, z: 24.40 }, extents: { width: 6.7, height: 9.2 } },
  12: { number: 12, name: 'Upper Left 1st Premolar', isUpper: true, type: 'Premolar', center: { x: 19.54, y: -0.55, z: 19.73 }, extents: { width: 6.1, height: 8.9 } },
  13: { number: 13, name: 'Upper Left 2nd Premolar', isUpper: true, type: 'Premolar', center: { x: 22.83, y: -0.26, z: 13.02 }, extents: { width: 7.8, height: 8.7 } },
  14: { number: 14, name: 'Upper Left 1st Molar', isUpper: true, type: 'Molar', center: { x: 24.27, y: 0.77, z: 5.47 }, extents: { width: 8.7, height: 9.5 } },
  15: { number: 15, name: 'Upper Left 2nd Molar', isUpper: true, type: 'Molar', center: { x: 25.86, y: 1.86, z: -0.80 }, extents: { width: 5.2, height: 8.4 } },
  16: { number: 16, name: 'Upper Left 3rd Molar', isUpper: true, type: 'Molar', center: { x: 25.99, y: 2.05, z: -7.00 }, extents: { width: 4.2, height: 8.2 } },
  17: { number: 17, name: 'Lower Left 3rd Molar', isUpper: false, type: 'Molar', center: { x: 24.44, y: -8.15, z: -6.13 }, extents: { width: 6.8, height: 8.5 } },
  18: { number: 18, name: 'Lower Left 2nd Molar', isUpper: false, type: 'Molar', center: { x: 24.31, y: -8.58, z: -1.84 }, extents: { width: 4.2, height: 7.8 } },
  19: { number: 19, name: 'Lower Left 1st Molar', isUpper: false, type: 'Molar', center: { x: 21.85, y: -9.34, z: 4.41 }, extents: { width: 8.5, height: 8.7 } },
  20: { number: 20, name: 'Lower Left 2nd Premolar', isUpper: false, type: 'Premolar', center: { x: 19.19, y: -9.73, z: 12.03 }, extents: { width: 7.5, height: 8.1 } },
  21: { number: 21, name: 'Lower Left 1st Premolar', isUpper: false, type: 'Premolar', center: { x: 16.23, y: -10.64, z: 18.22 }, extents: { width: 5.6, height: 8.3 } },
  22: { number: 22, name: 'Lower Left Canine', isUpper: false, type: 'Canine', center: { x: 14.28, y: -10.48, z: 22.74 }, extents: { width: 5.7, height: 8.3 } },
  23: { number: 23, name: 'Lower Left Lateral Incisor', isUpper: false, type: 'Incisor', center: { x: 9.60, y: -11.22, z: 25.73 }, extents: { width: 6.0, height: 8.4 } },
  24: { number: 24, name: 'Lower Left Central Incisor', isUpper: false, type: 'Incisor', center: { x: 3.71, y: -11.51, z: 27.91 }, extents: { width: 6.8, height: 8.5 } },
  25: { number: 25, name: 'Lower Right Central Incisor', isUpper: false, type: 'Incisor', center: { x: -3.71, y: -11.51, z: 27.91 }, extents: { width: 6.8, height: 8.5 } },
  26: { number: 26, name: 'Lower Right Lateral Incisor', isUpper: false, type: 'Incisor', center: { x: -9.60, y: -11.22, z: 25.73 }, extents: { width: 6.0, height: 8.4 } },
  27: { number: 27, name: 'Lower Right Canine', isUpper: false, type: 'Canine', center: { x: -14.28, y: -10.48, z: 22.74 }, extents: { width: 5.7, height: 8.3 } },
  28: { number: 28, name: 'Lower Right 1st Premolar', isUpper: false, type: 'Premolar', center: { x: -16.22, y: -10.58, z: 18.36 }, extents: { width: 6.0, height: 8.4 } },
  29: { number: 29, name: 'Lower Right 2nd Premolar', isUpper: false, type: 'Premolar', center: { x: -18.77, y: -10.71, z: 12.02 }, extents: { width: 7.5, height: 9.8 } },
  30: { number: 30, name: 'Lower Right 1st Molar', isUpper: false, type: 'Molar', center: { x: -21.86, y: -9.33, z: 4.40 }, extents: { width: 8.5, height: 8.7 } },
  31: { number: 31, name: 'Lower Right 2nd Molar', isUpper: false, type: 'Molar', center: { x: -24.34, y: -8.60, z: -1.85 }, extents: { width: 4.2, height: 7.9 } },
  32: { number: 32, name: 'Lower Right 3rd Molar', isUpper: false, type: 'Molar', center: { x: -24.45, y: -8.12, z: -6.13 }, extents: { width: 6.8, height: 8.5 } }
};

export interface DentalShadePreset {
  name: string;
  code: string;
  hex: string;
}

export const DENTAL_SHADE_PRESETS: DentalShadePreset[] = [
  { name: 'Treatment Area Highlight (Blue)', code: 'Highlight', hex: '#4A9CFF' },
  { name: 'Composite Filling', code: 'Composite', hex: '#EFEAD8' },
  { name: 'Porcelain Veneer', code: 'Veneer', hex: '#F7F6F2' },
  { name: 'Dental Crown', code: 'Crown', hex: '#E8DFC5' },
  { name: 'Natural Enamel', code: 'Natural', hex: '#FAF9F5' },
  { name: 'Bleach White', code: 'BL1', hex: '#FFFFFF' },
  { name: 'VITA Shade A1', code: 'A1', hex: '#EFE9D7' },
  { name: 'VITA Shade A2', code: 'A2', hex: '#E6DCBF' },
  { name: 'VITA Shade A3', code: 'A3', hex: '#D8CCA8' },
  { name: 'VITA Shade B1', code: 'B1', hex: '#EAE7CE' },
  { name: 'VITA Shade C1', code: 'C1', hex: '#DDD8C7' },
  { name: 'Restoration Gold', code: 'Gold', hex: '#E8B85C' },
  { name: 'Amber Glow', code: 'Amber', hex: '#F59E0B' }
];
