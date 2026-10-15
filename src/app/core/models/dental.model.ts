export type ToothQuadrant = 'q1' | 'q2' | 'q3' | 'q4';

export interface ToothQuadrantColors {
  q1?: string;
  q2?: string;
  q3?: string;
  q4?: string;
}

export interface ToothData {
  number: number;
  name: string;
  isUpper: boolean;
  type: 'Incisor' | 'Canine' | 'Premolar' | 'Molar';
  center: { x: number; y: number; z: number };
}

export const TEETH_CATALOG: Record<number, ToothData> = {
  1: { number: 1, name: 'Upper Right 3rd Molar', isUpper: true, type: 'Molar', center: { x: -23.47, y: 5.44, z: -9.65 } },
  2: { number: 2, name: 'Upper Right 2nd Molar', isUpper: true, type: 'Molar', center: { x: -24.53, y: 4.41, z: -0.94 } },
  3: { number: 3, name: 'Upper Right 1st Molar', isUpper: true, type: 'Molar', center: { x: -24.26, y: 2.72, z: 4.47 } },
  4: { number: 4, name: 'Upper Right 2nd Premolar', isUpper: true, type: 'Premolar', center: { x: -22.97, y: 2.81, z: 9.73 } },
  5: { number: 5, name: 'Upper Right 1st Premolar', isUpper: true, type: 'Premolar', center: { x: -20.72, y: 1.35, z: 16.45 } },
  6: { number: 6, name: 'Upper Right Canine', isUpper: true, type: 'Canine', center: { x: -17.03, y: 1.24, z: 22.71 } },
  7: { number: 7, name: 'Upper Right Lateral Incisor', isUpper: true, type: 'Incisor', center: { x: -11.1, y: 1.05, z: 27.96 } },
  8: { number: 8, name: 'Upper Right Central Incisor', isUpper: true, type: 'Incisor', center: { x: -2.66, y: 2.56, z: 29.71 } },
  9: { number: 9, name: 'Upper Left Central Incisor', isUpper: true, type: 'Incisor', center: { x: 3.54, y: 1.22, z: 31.24 } },
  10: { number: 10, name: 'Upper Left Lateral Incisor', isUpper: true, type: 'Incisor', center: { x: 11.1, y: 1.05, z: 27.97 } },
  11: { number: 11, name: 'Upper Left Canine', isUpper: true, type: 'Canine', center: { x: 17.07, y: 1.24, z: 22.75 } },
  12: { number: 12, name: 'Upper Left 1st Premolar', isUpper: true, type: 'Premolar', center: { x: 20.76, y: 1.35, z: 16.61 } },
  13: { number: 13, name: 'Upper Left 2nd Premolar', isUpper: true, type: 'Premolar', center: { x: 22.97, y: 2.81, z: 9.77 } },
  14: { number: 14, name: 'Upper Left 1st Molar', isUpper: true, type: 'Molar', center: { x: 24.18, y: 2.65, z: 4.37 } },
  15: { number: 15, name: 'Upper Left 2nd Molar', isUpper: true, type: 'Molar', center: { x: 24.53, y: 4.4, z: -0.95 } },
  16: { number: 16, name: 'Upper Left 3rd Molar', isUpper: true, type: 'Molar', center: { x: 24.36, y: 4.82, z: -9.62 } },
  17: { number: 17, name: 'Lower Left 3rd Molar', isUpper: false, type: 'Molar', center: { x: 23.04, y: -9.63, z: -8.64 } },
  18: { number: 18, name: 'Lower Left 2nd Molar', isUpper: false, type: 'Molar', center: { x: 23.48, y: -10.21, z: -1.2 } },
  19: { number: 19, name: 'Lower Left 1st Molar', isUpper: false, type: 'Molar', center: { x: 21.32, y: -11.26, z: 2.8 } },
  20: { number: 20, name: 'Lower Left 2nd Premolar', isUpper: false, type: 'Premolar', center: { x: 20.12, y: -11.14, z: 8.1 } },
  21: { number: 21, name: 'Lower Left 1st Premolar', isUpper: false, type: 'Premolar', center: { x: 17.5, y: -11.65, z: 13.81 } },
  22: { number: 22, name: 'Lower Left Canine', isUpper: false, type: 'Canine', center: { x: 14.83, y: -12.5, z: 19.52 } },
  23: { number: 23, name: 'Lower Left Lateral Incisor', isUpper: false, type: 'Incisor', center: { x: 9.84, y: -13.38, z: 24.03 } },
  24: { number: 24, name: 'Lower Left Central Incisor', isUpper: false, type: 'Incisor', center: { x: 3.29, y: -13.27, z: 27.04 } },
  25: { number: 25, name: 'Lower Right Central Incisor', isUpper: false, type: 'Incisor', center: { x: -2.64, y: -14.54, z: 25.53 } },
  26: { number: 26, name: 'Lower Right Lateral Incisor', isUpper: false, type: 'Incisor', center: { x: -9.86, y: -13.4, z: 23.99 } },
  27: { number: 27, name: 'Lower Right Canine', isUpper: false, type: 'Canine', center: { x: -14.86, y: -12.47, z: 19.51 } },
  28: { number: 28, name: 'Lower Right 1st Premolar', isUpper: false, type: 'Premolar', center: { x: -17.5, y: -11.65, z: 13.81 } },
  29: { number: 29, name: 'Lower Right 2nd Premolar', isUpper: false, type: 'Premolar', center: { x: -20.13, y: -11.14, z: 8.1 } },
  30: { number: 30, name: 'Lower Right 1st Molar', isUpper: false, type: 'Molar', center: { x: -21.33, y: -11.26, z: 2.8 } },
  31: { number: 31, name: 'Lower Right 2nd Molar', isUpper: false, type: 'Molar', center: { x: -23.49, y: -10.22, z: -1.2 } },
  32: { number: 32, name: 'Lower Right 3rd Molar', isUpper: false, type: 'Molar', center: { x: -21.78, y: -10.08, z: -8.7 } }
};

export interface DentalShadePreset {
  name: string;
  code: string;
  hex: string;
}

export const DENTAL_SHADE_PRESETS: DentalShadePreset[] = [
  { name: 'Natural Enamel', code: 'Natural', hex: '#FAF9F5' },
  { name: 'Bleach White', code: 'BL1', hex: '#FFFFFF' },
  { name: 'VITA Shade A1', code: 'A1', hex: '#EFE9D7' },
  { name: 'VITA Shade A2', code: 'A2', hex: '#E6DCBF' },
  { name: 'VITA Shade A3', code: 'A3', hex: '#D8CCA8' },
  { name: 'VITA Shade B1', code: 'B1', hex: '#EAE7CE' },
  { name: 'VITA Shade C1', code: 'C1', hex: '#DDD8C7' },
  { name: 'Restoration Gold', code: 'Gold', hex: '#E8B85C' },
  { name: 'Clinical Blue', code: 'Blue', hex: '#4A9CFF' },
  { name: 'Amber Glow', code: 'Amber', hex: '#F59E0B' }
];
