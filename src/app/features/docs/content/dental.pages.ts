import type { DocPage } from '../docs.models';
import { api, code, diagram, links, note, page, section, table, text } from './foundation.pages';

const viewer = 'src/app/features/anatomy/organ-viewer/';
export const DENTAL_PAGES: DocPage[] = [
  page('dental-system', 'Dental restoration system', 'Dental system', 'The full calibrated pipeline from the bundled OBJ arches to editable, persistent region colors.',
    ['src/app/core/models/dental.model.ts', 'src/app/core/services/dental.service.ts', viewer + 'dental/dental-geometry.ts', viewer + 'dental/dental-color-renderer.ts', viewer + 'dental/dental-texture.ts', viewer + 'organ-viewer.component.ts'],
    section('pipeline', 'End-to-end dental pipeline',
      diagram('Dental processing', 'Geometry preparation precedes classification. State changes update color buffers and request a frame; they do not remesh teeth.', ['teeth.OBJ + teeth.mtl + Texture/*.webp', 'Group1014 lower arch / Group1059 upper arch', 'Non-indexed paired quads → 3 subdivision iterations', 'Diffuse image → cached CPU RGBA sample', 'Local xyz + UV + gum mask → identifyTooth', 'Accepted quad centers → computeToothBounds → calibrate catalog centers', 'Division mode + selected parts + stored states → region color', 'renderDentalColors → color.needsUpdate → requested WebGL frame'])),
    section('meshes', 'Mesh mapping is not tooth mapping',
      table(['Name', 'Verified role', 'Code behavior'], [
        ['Group1014', 'Lower arch; original y range about -22.17 to -2.43', 'Allowed picking, subdivision, lower strip/root thresholds'],
        ['Group1059', 'Upper arch; original y range about -7.05 to 23.13', 'Allowed picking, subdivision, upper strip/root thresholds'],
        ['Group1104', 'Third mesh; not an individual tooth or an arch used by the algorithms', 'Rendered, but excluded from dental subdivision, bounds, colors and allowlisted picking'],
      ]), text('check-assets parses the actual OBJ and reports names/attributes/bounds. The code establishes upper/lower roles through Group1059 checks. A semantic anatomical label for Group1104 is not provided by the source, so it is described by its verified treatment rather than guessed. Each arch includes many teeth plus gum/palate/floor regions. Tooth identity comes from calibrated UV or crease planes, not one mesh per tooth.')),
    section('numbering', 'Universal numbering and physical selection',
      text('The 32-entry catalog retains Universal numbering. Upper IDs run #1 through #16; lower IDs #17 through #32. The asset omits third molars #1/#16/#17/#32, giving seven physical teeth per quarter-arch. MODEL_TEETH filters catalog entries with center data. DentalService exposes those 28 physical entries; identifyTooth cannot select absent wisdom teeth. Storage validates against the full catalog, so a valid persisted wisdom-tooth state can exist even though no geometry is colored for it.'),
      diagram('Physical numbering by model side', 'The numeric mapping depends on original mesh x and the calibrated distance index from the front midline.', ['Upper x<0: 8 → 7 → 6 → 5 → 4 → 3 → 2', 'Upper x>=0: 9 → 10 → 11 → 12 → 13 → 14 → 15', 'Lower x<0: 25 → 26 → 27 → 28 → 29 → 30 → 31', 'Lower x>=0: 24 → 23 → 22 → 21 → 20 → 19 → 18'])),
    section('selection', 'Selecting a physical tooth',
      text('Picking is restricted to the two named arch meshes and rejects gum hits with DentalTextureSampler.isGum. The component converts hit.point from world to that mesh’s local coordinates and calls identifyTooth(x,y,z,isUpper,hit.uv?.x). selectTooth checks getTooth, measures bounds if needed, calibrates center/extents to enamel, restores saved divisionMode, selects all parts and refreshes colors. A clicked-point fallback uses the 3D classifier when a bound is unavailable. Camera zooming toward a tooth is not part of selectTooth.')),
    section('modes', 'Four division modes and actual zone storage',
      table(['Mode', 'UI selection keys', 'Persisted zone keys / rendering'], [
        ['1: full tooth', 'full', 'applyColor assigns q1,q2,q3,q4 the same color; no grid'],
        ['2: left/right', 'left, right', 'left assigns q1+q3, right assigns q2+q4; vertical grid'],
        ['3: thirds', 'top, middle, bottom', 'Direct same-named keys; two horizontal boundaries in local y'],
        ['4: quadrants', 'q1, q2, q3, q4', 'Direct keys; vertical and midpoint horizontal grid'],
      ]),
      diagram('Segmentation in the enamel frame', 'Top/bottom refer to geometric local y, and left/right follows UV or the arch tangent. This is not a world-screen quadrant definition.', ['Mode 1: [ full crown ]', 'Mode 2: [ left | right ]', 'Mode 3: [ top ] / [ middle ] / [ bottom ]', 'Mode 4: [ q1 | q2 ] / [ q3 | q4 ]']),
      text('setDivisionMode persists the mode without erasing old color keys. Both quadrant and thirds families can coexist. renderDentalColors uses state.divisionMode to choose the stored zone family; the active selected mode drives grid drawing. togglePart keeps at least one selection. selectAllParts resets selection according to mode. getPartColor maps full/left/right preview keys to stored quadrant values with #FAF9F5 fallback.')),
    section('editing', 'Editing, grid and persistence',
      text('applyColor first validates hex and requires a selected physical tooth. It clones the tooth Map and zone object, writes selected zones, updates the toothColors signal, calls saveToothStates, then renders vertex colors. resetCurrentTooth removes one map entry; resetAllTeeth clears all. Grid preference persists separately. Failed saves leave dental edits visible and set storageError, allowing the user to see the storage problem without falsely claiming success.'),
      code(`const states = new Map<number, ToothState>();
states.set(8, { divisionMode: 4, zones: { q1: '#4A9CFF', q4: '#EFEAD8' } });
const saved = dental.saveToothStates(states);
// In a rendering integration, pass states to renderDentalColors as statesMap.
// A true result confirms a storage write, not clinical validity.`),
      note('Color meaning', 'Palette labels describe the configured UI. Values such as Crown red and A1 green are source behavior. The software does not validate restoration suitability or physical shade accuracy.')),
    section('reuse', 'Calibrating a replacement model',
      text('For the exact asset, copy OBJ, MTL and all referenced textures with unchanged relative paths, the dental model/catalog, domain calculations, geometry/color/texture modules and compatible preparation. For another asset, inventory meshes and topology, establish the coordinate frame and numbering map, measure UV symmetry and interproximal boundaries, root/strip exclusion regions and gum colors, redefine arch tangents and crown bounds, and rebuild golden fixtures. Merely renaming meshes cannot make arbitrary UVs or triangle topology compatible.'), links(['Algorithm details and formulas', 'dental-algorithms'], ['Geometry assumptions', 'geometry'], ['Dental integration scenario', 'integration'])),
  ),
  page('dental-algorithms', 'Dental algorithms', 'Dental system', 'Exact thresholds, classification formulas, enamel bounds, segmentation, texture sampling and vertex-buffer behavior.',
    ['src/app/core/services/dental.service.ts', viewer + 'dental/dental-geometry.ts', viewer + 'dental/dental-color-renderer.ts', viewer + 'dental/dental-texture.ts'],
    section('identification', 'identifyTooth: raw coordinates and UV distances',
      text('identifyTooth(x,y,z,isUpper,u?) starts archIdx=0. With u supplied, use upper symmetry 0.3784 or lower 0.65595. uDist = x>=0 ? uSym-u : u-uSym. Compare against crease indices 1 through length-2; every passed threshold advances archIdx. The final distal threshold is documented calibration but is not a separate tooth bin. This yields indices 0..6. x sign decides side; upper maps x<0 to 8-index, otherwise 9+index; lower maps x<0 to 25+index, otherwise 24-index. Fallback is physical #8 or #25 if lookup fails.'),
      table(['Model-specific calibration', 'Values in current source'], [
        ['Upper u distance edges', '0, 0.0550, 0.1033, 0.1497, 0.1920, 0.2441, 0.3010, 0.3800'],
        ['Lower u distance edges', '0, 0.0469, 0.0864, 0.1235, 0.1601, 0.2088, 0.2685, 0.3400'],
        ['Upper/lower UV symmetry', '0.3784 / 0.65595'],
      ]), text('Without u, the fallback mirrors x using abs(x), reads six internal calibrated crease planes for the chosen arch, optionally adjusts z by yTilt*y, and evaluates cross=(x2-x1)*(zAdj-z1)-(z2-z1)*(abs(x)-x1). cross<0 advances the index. Only the upper molar crease has yTilt=0.16. These are original geometry-space values; applying them to normalized world coordinates would identify incorrect teeth.'),
      diagram('Tooth classification', 'An already accepted enamel point is classified using UV first; the 3D fallback is for missing UV.', ['Arch mesh → upper/lower', 'World hit → mesh-local xyz', 'UV available? signed distance from calibrated symmetry axis', 'Otherwise mirrored xz crease-plane tests (+ optional y tilt)', 'Index 0..6 + side → Universal physical ID', 'Physical ToothData → segmentation / selection'])),
    section('bounds', 'computeToothBounds: sampling and exclusion', api('computeToothBounds'),
      text('Traverse only Group1014/Group1059. For each six-vertex quad, average the four distinct corners A/B/C/D into cx/cy/cz and, if present, cu/cv. Skip upper cy>6.8 and lower cy<-16.5. If UV exists, skip upper cv<0.838; skip lower cv<0.6915 or cu<0.3215. With a TextureSample, look up clamped floor(cu*width), floor((1-cv)*height) and reject distinctly pink gum pixels. Root/UV values are calibrated to this mesh, not measured physical units.'),
      text('For each remaining center, call identifyTooth and accumulate extrema in xyz, projected H=cx*tangent.x+cz*tangent.z, and UV u. Also accumulate sumY/sumH/sumU and count. MidX/MidZ are bbox midpoints; midY=0.5*(bboxMidY+meanY), midH=0.5*(bboxMidH+meanH). UV min/max fall back to 0/1 when nonfinite; meanU uses sumU/count only when count>0 and sumU>0, otherwise bboxMidU; midU blends them. anchor=(midX,midY,midZ). The function returns a new Map and does not mutate the service or model.'),
      text('The component owns the next step: calibrateToothCenter(number, anchor, {width:maxH-minH,height:maxY-minY}), merge into its toothBoundsMap and remember whether texture-calibrated. If initial measurements lacked a sample and one later becomes available, updateMeshVertexColors triggers remeasurement. No assumption of 32 measured teeth is made.')),
    section('tangent', 'Arch tangent and quadrant classification',
      text('getArchTangent chooses mesial/distal crease planes around the tooth, mirrors their x direction for the model side, averages their unit outward xz vectors, and returns the perpendicular tangent {x:nz/norm,z:-nx/norm}. projectHorizontal uses a supplied bounds tangent or recomputes it. getQuadrant uses y>=midY as top. With u and bounds it uses u>midU as left; otherwise compares projected H<midH. Results are q1 top-left, q2 top-right, q3 bottom-left, q4 bottom-right. Equality goes to top and right.'),
      code(`const bounds = boundsMap.get(tooth.number);
const quadrant = dental.getQuadrant(x, y, tooth, bounds, z, u);
const third = dental.getThird(y, tooth, bounds);
const line = dental.isNearBoundary(x, y, tooth, 4, bounds, z, 0.14, u);`)),
    section('thirds-grid', 'Thirds and boundary rules',
      text('getThird splits [minY,maxY] at minY+height/3 and minY+2*height/3. y>=second is top; y>=first is middle; otherwise bottom. Without bounds, height comes from tooth.extents?.height ?? 8.0 around tooth.center.y. These labels use local y for both jaws; they are not automatically anatomical incisal/cervical labels.'),
      table(['Mode', 'isNearBoundary behavior'], [
        ['1', 'Always false'],
        ['2', 'Vertical only: |u-midU| < max(0.015,maxU-minU)*0.032 if UV+bounds, else |H-midH|<epsilon'],
        ['3', 'With bounds, within epsilon of the two y third cuts; without bounds, |dy-1.3| or |dy+1.3|<epsilon'],
        ['4', 'Vertical condition OR |y-midY|<epsilon'],
      ]), text('epsilon defaults to 0.14 and the renderer explicitly passes 0.14. Boundary widths in UV and geometry units are different calibrated quantities. getThird’s no-bound fallback and isNearBoundary’s no-bound thirds grid use different formulas; preserve that distinction when debugging missing bounds.')),
    section('texture', 'Texture lookup and gum classification', api('DentalTextureSampler'), api('getDentalDiffuseImage'),
      text('getDentalDiffuseImage returns the first traversed mesh material’s map.image (first material if an array), or null; it does not select a specific arch. new DentalTextureSampler(dental) accepts only the isGumPixel contract. getSample downsizes an image to at most 1024 pixels on its largest dimension, uses Canvas 2D with willReadFrequently, reads RGBA and caches success or null by image identity in a WeakMap. A tainted canvas or draw/read failure yields null. An initially zero-size image also caches null; if the same image object later becomes ready, that cached null is not automatically invalidated.'),
      text('isGum(hit) rejects a missing hit.uv outright. It then applies root and UV strip cutoffs in mesh-local coordinates. If no map/image/sample is available after those checks, it returns false (accepting the remaining crown region). For a valid sample it selects the face material, applies texture.transformUv including repeat/offset/wrapping/flipY, clamps pixel indices and runs isGumPixel. Bounds/color sampling instead uses the raw quad-average UV and explicit 1-v inversion. That difference is intentional current behavior and must be reviewed for new texture conventions.'),
      code(`// Current domain predicate, in 0..255 channel units:
const isGum = (r - g) >= 38 && (r - b) >= 48;
// It does not reject dark pits or warm cervical enamel by brightness.`)),
    section('colors', 'renderDentalColors and the GPU buffer', api('renderDentalColors'), api('DentalColorState'),
      diagram('Color decision order', 'A single color is applied to all six entries of each accepted quad, then the attribute is marked dirty.', ['Named arch → quad center + average UV', 'Root / strip / gum rejected → white RGB', 'identifyTooth → stored state + selected status + bounds', 'Selected + showGrid + near active boundary → dark grid [0.14,0.18,0.25]', 'Stored mode 3 → thirds color; all other stored modes → quadrant color', 'Valid zone color → hexToRgb; missing zone → [1,1,1]', 'set all 6 quad corners → color.needsUpdate=true']),
      text('The renderer reuses an existing color attribute or allocates a white Float32Array of position.count*3. Selected tooth uses activeMode for the grid; other teeth use stored mode or default 4. Restoration lookup uses state.divisionMode, so callers should keep selected active state aligned as the component does. Grid takes priority over restoration color. Skipped regions are reset to white so old state does not leak. Material vertexColors must already be enabled; this function writes buffers but does not attach a model, update material flags, persist state, render a frame or dispose geometry.')),
    section('limits', 'Engineering limitations and validation',
      note('Asset-specific algorithms', 'The algorithms assume exact names, paired-quad ordering, model-local axes, calibrated UV strips and crease positions. They cannot automatically segment a new dental scan or supply clinical tooth recognition.', 'warning'),
      text('Use dental-fixture.ts and dental-golden.ts when changing algorithms. Golden hashes cover actual subdivided attributes, bounds, and eight mode/grid color outputs. Texture-dependent tests separately exercise gum masking. Tests establish implementation stability for the fixture; they do not prove segmentation accuracy on unseen assets.'), links(['Integration and replacement-model calibration', 'integration'], ['Golden test strategy', 'testing'], ['Full service declarations', 'api-reference/dental-service'])),
  ),
];
