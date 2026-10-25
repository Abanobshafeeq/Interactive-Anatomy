import * as THREE from 'three';
import type { DentalService, ToothEnamelBounds } from '../../../../core/services/dental.service';
import type { TextureSample } from './dental-texture';

export function subdivideGeometry(geometry: THREE.BufferGeometry, iterations = 3): THREE.BufferGeometry {
  let current = geometry;

  const emitQuadPos = (
    dst: Float32Array, out: number,
    ax: number, ay: number, az: number,
    bx: number, by: number, bz: number,
    cx: number, cy: number, cz: number,
    dx: number, dy: number, dz: number
  ): number => {
    dst[out++] = ax; dst[out++] = ay; dst[out++] = az;
    dst[out++] = bx; dst[out++] = by; dst[out++] = bz;
    dst[out++] = cx; dst[out++] = cy; dst[out++] = cz;
    dst[out++] = ax; dst[out++] = ay; dst[out++] = az;
    dst[out++] = cx; dst[out++] = cy; dst[out++] = cz;
    dst[out++] = dx; dst[out++] = dy; dst[out++] = dz;
    return out;
  };

  const emitQuadUv = (
    dst: Float32Array, out: number,
    au: number, av: number,
    bu: number, bv: number,
    cu: number, cv: number,
    du: number, dv: number
  ): number => {
    dst[out++] = au; dst[out++] = av;
    dst[out++] = bu; dst[out++] = bv;
    dst[out++] = cu; dst[out++] = cv;
    dst[out++] = au; dst[out++] = av;
    dst[out++] = cu; dst[out++] = cv;
    dst[out++] = du; dst[out++] = dv;
    return out;
  };

  for (let iter = 0; iter < iterations; iter++) {
    const posAttr = current.attributes['position'] as THREE.BufferAttribute;
    const normAttr = current.attributes['normal'] as THREE.BufferAttribute | undefined;
    const uvAttr = current.attributes['uv'] as THREE.BufferAttribute | undefined;

    const quadCount = Math.floor(posAttr.count / 6);
    const nextVertCount = quadCount * 24; // 4 sub-quads * 6 vertices

    const srcPos = posAttr.array as Float32Array;
    const dstPos = new Float32Array(nextVertCount * 3);

    const srcNorm = normAttr ? (normAttr.array as Float32Array) : null;
    const dstNorm = srcNorm ? new Float32Array(nextVertCount * 3) : null;

    const srcUv = uvAttr ? (uvAttr.array as Float32Array) : null;
    const dstUv = srcUv ? new Float32Array(nextVertCount * 2) : null;

    let pOut = 0;
    let nOut = 0;
    let uOut = 0;

    for (let q = 0; q < quadCount; q++) {
      const iA = q * 6;
      const iB = iA + 1;
      const iC = iA + 2;
      const iD = iA + 5;

      const pA = iA * 3, pB = iB * 3, pC = iC * 3, pD = iD * 3;
      const ax = srcPos[pA], ay = srcPos[pA + 1], az = srcPos[pA + 2];
      const bx = srcPos[pB], by = srcPos[pB + 1], bz = srcPos[pB + 2];
      const cx = srcPos[pC], cy = srcPos[pC + 1], cz = srcPos[pC + 2];
      const dx = srcPos[pD], dy = srcPos[pD + 1], dz = srcPos[pD + 2];

      const abx = 0.5 * (ax + bx), aby = 0.5 * (ay + by), abz = 0.5 * (az + bz);
      const bcx = 0.5 * (bx + cx), bcy = 0.5 * (by + cy), bcz = 0.5 * (bz + cz);
      const cdx = 0.5 * (cx + dx), cdy = 0.5 * (cy + dy), cdz = 0.5 * (cz + dz);
      const dax = 0.5 * (dx + ax), day = 0.5 * (dy + ay), daz = 0.5 * (dz + az);
      const mx = 0.25 * (ax + bx + cx + dx);
      const my = 0.25 * (ay + by + cy + dy);
      const mz = 0.25 * (az + bz + cz + dz);

      pOut = emitQuadPos(dstPos, pOut, ax, ay, az, abx, aby, abz, mx, my, mz, dax, day, daz);
      pOut = emitQuadPos(dstPos, pOut, abx, aby, abz, bx, by, bz, bcx, bcy, bcz, mx, my, mz);
      pOut = emitQuadPos(dstPos, pOut, mx, my, mz, bcx, bcy, bcz, cx, cy, cz, cdx, cdy, cdz);
      pOut = emitQuadPos(dstPos, pOut, dax, day, daz, mx, my, mz, cdx, cdy, cdz, dx, dy, dz);

      if (srcNorm && dstNorm) {
        const nax = srcNorm[pA], nay = srcNorm[pA + 1], naz = srcNorm[pA + 2];
        const nbx = srcNorm[pB], nby = srcNorm[pB + 1], nbz = srcNorm[pB + 2];
        const ncx = srcNorm[pC], ncy = srcNorm[pC + 1], ncz = srcNorm[pC + 2];
        const ndx = srcNorm[pD], ndy = srcNorm[pD + 1], ndz = srcNorm[pD + 2];

        let nabx = nax + nbx, naby = nay + nby, nabz = naz + nbz;
        const lab = Math.hypot(nabx, naby, nabz) || 1;
        nabx /= lab; naby /= lab; nabz /= lab;

        let nbcx = nbx + ncx, nbcy = nby + ncy, nbcz = nbz + ncz;
        const lbc = Math.hypot(nbcx, nbcy, nbcz) || 1;
        nbcx /= lbc; nbcy /= lbc; nbcz /= lbc;

        let ncdx = ncx + ndx, ncdy = ncy + ndy, ncdz = ncz + ndz;
        const lcd = Math.hypot(ncdx, ncdy, ncdz) || 1;
        ncdx /= lcd; ncdy /= lcd; ncdz /= lcd;

        let ndax = ndx + nax, nday = ndy + nay, ndaz = ndz + naz;
        const lda = Math.hypot(ndax, nday, ndaz) || 1;
        ndax /= lda; nday /= lda; ndaz /= lda;

        let nmx = nax + nbx + ncx + ndx, nmy = nay + nby + ncy + ndy, nmz = naz + nbz + ncz + ndz;
        const lm = Math.hypot(nmx, nmy, nmz) || 1;
        nmx /= lm; nmy /= lm; nmz /= lm;

        nOut = emitQuadPos(dstNorm, nOut, nax, nay, naz, nabx, naby, nabz, nmx, nmy, nmz, ndax, nday, ndaz);
        nOut = emitQuadPos(dstNorm, nOut, nabx, naby, nabz, nbx, nby, nbz, nbcx, nbcy, nbcz, nmx, nmy, nmz);
        nOut = emitQuadPos(dstNorm, nOut, nmx, nmy, nmz, nbcx, nbcy, nbcz, ncx, ncy, ncz, ncdx, ncdy, ncdz);
        nOut = emitQuadPos(dstNorm, nOut, ndax, nday, ndaz, nmx, nmy, nmz, ncdx, ncdy, ncdz, ndx, ndy, ndz);
      }

      if (srcUv && dstUv) {
        const uA = iA * 2, uB = iB * 2, uC = iC * 2, uD = iD * 2;
        const au = srcUv[uA], av = srcUv[uA + 1];
        const bu = srcUv[uB], bv = srcUv[uB + 1];
        const cu = srcUv[uC], cv = srcUv[uC + 1];
        const du = srcUv[uD], dv = srcUv[uD + 1];

        const abu = 0.5 * (au + bu), abv = 0.5 * (av + bv);
        const bcu = 0.5 * (bu + cu), bcv = 0.5 * (bv + cv);
        const cdu = 0.5 * (cu + du), cdv = 0.5 * (cv + dv);
        const dau = 0.5 * (du + au), dav = 0.5 * (dv + av);
        const mu = 0.25 * (au + bu + cu + du);
        const mv = 0.25 * (av + bv + cv + dv);

        uOut = emitQuadUv(dstUv, uOut, au, av, abu, abv, mu, mv, dau, dav);
        uOut = emitQuadUv(dstUv, uOut, abu, abv, bu, bv, bcu, bcv, mu, mv);
        uOut = emitQuadUv(dstUv, uOut, mu, mv, bcu, bcv, cu, cv, cdu, cdv);
        uOut = emitQuadUv(dstUv, uOut, dau, dav, mu, mv, cdu, cdv, du, dv);
      }
    }

    const nextGeo = new THREE.BufferGeometry();
    nextGeo.name = current.name;
    nextGeo.userData = { ...current.userData };
    for (const group of current.groups) {
      nextGeo.addGroup(group.start * 4, group.count * 4, group.materialIndex);
    }
    nextGeo.setAttribute('position', new THREE.BufferAttribute(dstPos, 3));
    if (dstNorm) {
      nextGeo.setAttribute('normal', new THREE.BufferAttribute(dstNorm, 3));
    }
    if (dstUv) {
      nextGeo.setAttribute('uv', new THREE.BufferAttribute(dstUv, 2));
    }

    if (current !== geometry) {
      current.dispose();
    }
    current = nextGeo;
  }

  if (!current.attributes['normal']) {
    current.computeVertexNormals();
  }
  return current;
}

export function computeToothBounds(
  model: THREE.Object3D,
  sample: TextureSample | null,
  dental: Pick<DentalService, 'identifyTooth' | 'getArchTangent' | 'isGumPixel'>,
): Map<number, ToothEnamelBounds> {
  const toothBoundsMap = new Map<number, ToothEnamelBounds>();
  const accum = new Map<
    number,
    {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
      minZ: number;
      maxZ: number;
      minH: number;
      maxH: number;
      sumH: number;
      sumY: number;
      minU: number;
      maxU: number;
      sumU: number;
      count: number;
      archTangent: { x: number; z: number };
    }
  >();

  model.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || (mesh.name !== 'Group1014' && mesh.name !== 'Group1059')) return;

    const isUpper = mesh.name === 'Group1059';
    const geo = mesh.geometry;
    const pos = geo.attributes['position'];
    const uvAttr = geo.attributes['uv'];
    const quadCount = Math.floor(pos.count / 6);

    for (let q = 0; q < quadCount; q++) {
      const iA = q * 6;
      const iB = iA + 1;
      const iC = iA + 2;
      const iD = iA + 5;

      const cx = 0.25 * (pos.getX(iA) + pos.getX(iB) + pos.getX(iC) + pos.getX(iD));
      const cy = 0.25 * (pos.getY(iA) + pos.getY(iB) + pos.getY(iC) + pos.getY(iD));
      const cz = 0.25 * (pos.getZ(iA) + pos.getZ(iB) + pos.getZ(iC) + pos.getZ(iD));

      // Deep vertical root cutoff
      if (isUpper && cy > 6.8) continue;
      if (!isUpper && cy < -16.5) continue;

      let cu: number | undefined;
      if (uvAttr) {
        cu = 0.25 * (uvAttr.getX(iA) + uvAttr.getX(iB) + uvAttr.getX(iC) + uvAttr.getX(iD));
        const cv = 0.25 * (uvAttr.getY(iA) + uvAttr.getY(iB) + uvAttr.getY(iC) + uvAttr.getY(iD));

        // Exclude gum / palate / floor-of-mouth UV islands outside the dental crown strips
        if (isUpper && cv < 0.838) continue;
        if (!isUpper && (cv < 0.6915 || cu < 0.3215)) continue;

        // Texture check: skip only distinctly deep pink/reddish gum pixels
        if (sample) {
          const sx = Math.min(sample.width - 1, Math.max(0, Math.floor(cu * sample.width)));
          const sy = Math.min(sample.height - 1, Math.max(0, Math.floor((1.0 - cv) * sample.height)));
          const sIndex = (sy * sample.width + sx) * 4;
          const r = sample.data[sIndex];
          const g = sample.data[sIndex + 1];
          const b = sample.data[sIndex + 2];
          if (dental.isGumPixel(r, g, b)) {
            continue;
          }
        }
      }

      const tooth = dental.identifyTooth(cx, cy, cz, isUpper, cu);
      let b = accum.get(tooth.number);
      if (!b) {
        const archTangent = dental.getArchTangent(tooth);
        b = {
          minX: Infinity,
          maxX: -Infinity,
          minY: Infinity,
          maxY: -Infinity,
          minZ: Infinity,
          maxZ: -Infinity,
          minH: Infinity,
          maxH: -Infinity,
          sumH: 0,
          sumY: 0,
          minU: Infinity,
          maxU: -Infinity,
          sumU: 0,
          count: 0,
          archTangent,
        };
        accum.set(tooth.number, b);
      }

      const h = cx * b.archTangent.x + cz * b.archTangent.z;
      b.minX = Math.min(b.minX, cx);
      b.maxX = Math.max(b.maxX, cx);
      b.minY = Math.min(b.minY, cy);
      b.maxY = Math.max(b.maxY, cy);
      b.minZ = Math.min(b.minZ, cz);
      b.maxZ = Math.max(b.maxZ, cz);
      b.minH = Math.min(b.minH, h);
      b.maxH = Math.max(b.maxH, h);
      b.sumH += h;
      b.sumY += cy;
      if (cu !== undefined) {
        b.minU = Math.min(b.minU, cu);
        b.maxU = Math.max(b.maxU, cu);
        b.sumU += cu;
      }
      b.count++;
    }
  });

  for (const [num, b] of accum.entries()) {
    const midX = (b.minX + b.maxX) / 2;
    const midZ = (b.minZ + b.maxZ) / 2;
    const bboxMidY = (b.minY + b.maxY) / 2;
    const meanY = b.count > 0 ? b.sumY / b.count : bboxMidY;
    const midY = 0.5 * (bboxMidY + meanY);

    const bboxMidH = (b.minH + b.maxH) / 2;
    const meanH = b.count > 0 ? b.sumH / b.count : bboxMidH;
    const midH = 0.5 * (bboxMidH + meanH);

    const minU = Number.isFinite(b.minU) ? b.minU : 0;
    const maxU = Number.isFinite(b.maxU) ? b.maxU : 1;
    const bboxMidU = (minU + maxU) / 2;
    const meanU = b.count > 0 && b.sumU > 0 ? b.sumU / b.count : bboxMidU;
    const midU = 0.5 * (bboxMidU + meanU);

    const anchor = { x: midX, y: midY, z: midZ };
    toothBoundsMap.set(num, {
      toothNumber: num,
      minX: b.minX,
      maxX: b.maxX,
      minY: b.minY,
      maxY: b.maxY,
      minZ: b.minZ,
      maxZ: b.maxZ,
      midX,
      midY,
      midZ,
      minH: b.minH,
      maxH: b.maxH,
      midH,
      minU,
      maxU,
      midU,
      archTangent: b.archTangent,
      anchor,
    });
  }

  return toothBoundsMap;
}
