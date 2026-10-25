import * as THREE from 'three';
import type { DentalService, ToothEnamelBounds } from '../../../../core/services/dental.service';
import type { TextureSample } from './dental-texture';
import type { ToothData, ToothState, DivisionMode } from '../../../../core/models/dental.model';

export interface DentalColorState {
  sample: TextureSample | null;
  statesMap: ReadonlyMap<number, ToothState>;
  selectedTooth: ToothData | null;
  showGrid: boolean;
  activeMode: DivisionMode;
  boundsMap: ReadonlyMap<number, ToothEnamelBounds>;
}

export function renderDentalColors(
  model: THREE.Object3D,
  dental: Pick<DentalService, 'identifyTooth' | 'isGumPixel' | 'isNearBoundary' | 'getThird' | 'getQuadrant' | 'hexToRgb'>,
  { sample, statesMap, selectedTooth, showGrid, activeMode, boundsMap }: DentalColorState,
): void {
  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || (mesh.name !== 'Group1014' && mesh.name !== 'Group1059')) return;

    const isUpper = mesh.name === 'Group1059';
    const geo = mesh.geometry;
    const pos = geo.attributes['position'];
    const uvAttr = geo.attributes['uv'];
    let colorAttr = geo.attributes['color'] as THREE.BufferAttribute;

    if (!colorAttr) {
      const colors = new Float32Array(pos.count * 3).fill(1.0);
      colorAttr = new THREE.BufferAttribute(colors, 3);
      geo.setAttribute('color', colorAttr);
    }

    const colorArray = colorAttr.array as Float32Array;
    const quadCount = Math.floor(pos.count / 6);

    for (let q = 0; q < quadCount; q++) {
      const iA = q * 6;
      const iB = iA + 1;
      const iC = iA + 2;
      const iD = iA + 5;

      const cx = 0.25 * (pos.getX(iA) + pos.getX(iB) + pos.getX(iC) + pos.getX(iD));
      const cy = 0.25 * (pos.getY(iA) + pos.getY(iB) + pos.getY(iC) + pos.getY(iD));
      const cz = 0.25 * (pos.getZ(iA) + pos.getZ(iB) + pos.getZ(iC) + pos.getZ(iD));

      // 1. Deep vertical root cutoff
      if (isUpper && cy > 6.8) {
        setQuadColor(colorArray, iA, 1.0, 1.0, 1.0);
        continue;
      }
      if (!isUpper && cy < -16.5) {
        setQuadColor(colorArray, iA, 1.0, 1.0, 1.0);
        continue;
      }

      // 2. UV tooth-strip & pink gum filter (never rejects shaded enamel pits/grooves)
      let cu: number | undefined;
      if (uvAttr) {
        cu = 0.25 * (uvAttr.getX(iA) + uvAttr.getX(iB) + uvAttr.getX(iC) + uvAttr.getX(iD));
        const cv = 0.25 * (uvAttr.getY(iA) + uvAttr.getY(iB) + uvAttr.getY(iC) + uvAttr.getY(iD));

        if ((isUpper && cv < 0.838) || (!isUpper && (cv < 0.6915 || cu < 0.3215))) {
          setQuadColor(colorArray, iA, 1.0, 1.0, 1.0);
          continue;
        }

        if (sample) {
          const sx = Math.min(sample.width - 1, Math.max(0, Math.floor(cu * sample.width)));
          const sy = Math.min(sample.height - 1, Math.max(0, Math.floor((1.0 - cv) * sample.height)));
          const sIndex = (sy * sample.width + sx) * 4;
          const r = sample.data[sIndex];
          const g = sample.data[sIndex + 1];
          const b = sample.data[sIndex + 2];
          if (dental.isGumPixel(r, g, b)) {
            setQuadColor(colorArray, iA, 1.0, 1.0, 1.0);
            continue;
          }
        }
      }

      // 3. Interproximal-aware tooth assignment (28 physical teeth: 7 per quadrant)
      const tooth = dental.identifyTooth(cx, cy, cz, isUpper, cu);
      const state = statesMap.get(tooth.number);
      const isToothSelected = selectedTooth?.number === tooth.number;
      const mode = isToothSelected ? activeMode : (state?.divisionMode ?? 4);
      const bounds = boundsMap.get(tooth.number);

      // 4. High-contrast divider grid lines for active selected tooth ONLY
      if (isToothSelected && showGrid && mode !== 1) {
        if (dental.isNearBoundary(cx, cy, tooth, mode, bounds, cz, 0.14, cu)) {
          setQuadColor(colorArray, iA, 0.14, 0.18, 0.25);
          continue;
        }
      }

      // 5. Dynamic zone clinical restoration coloring
      if (state?.zones) {
        let colorHex: string | undefined;
        if (state.divisionMode === 3) {
          const third = dental.getThird(cy, tooth, bounds);
          colorHex = state.zones[third];
        } else {
          const quad = dental.getQuadrant(cx, cy, tooth, bounds, cz, cu);
          colorHex = state.zones[quad];
        }

        if (colorHex) {
          const rgb = dental.hexToRgb(colorHex);
          setQuadColor(colorArray, iA, rgb[0], rgb[1], rgb[2]);
          continue;
        }
      }

      // Default unaltered enamel
      setQuadColor(colorArray, iA, 1.0, 1.0, 1.0);
    }

    colorAttr.needsUpdate = true;
  });

}

function setQuadColor(arr: Float32Array, iA: number, r: number, g: number, b: number): void {
  let idx = iA * 3;
  for (let v = 0; v < 6; v++) {
    arr[idx++] = r;
    arr[idx++] = g;
    arr[idx++] = b;
  }
}
