import type { DocPage } from '../docs.models';
import { api, code, diagram, links, note, page, section, table, text } from './foundation.pages';

const viewer = 'src/app/features/anatomy/organ-viewer/';
export const ENGINE_PAGES: DocPage[] = [
  page('organ-viewer', 'OrganViewer orchestration', 'Three.js engine', 'The Angular owner of scene lifetime, editing state, pointer events, rendering, and persistence feedback.',
    [viewer + 'organ-viewer.component.ts'],
    section('contract', 'Component contract and template',
      text('OrganViewerComponent is standalone, imports FormsModule, uses OnPush, and implements AfterViewInit and OnDestroy. The sole input is organ = input.required<Organ>(); it declares no outputs and no computed signals. canvasContainer and hotspotsOverlay are static ViewChild ElementRefs. The template provides loading/retry UI, camera actions, screenshot feedback, hotspot markers/forms, hover hints and the dental editing panel. DOM events and storage messages remain here because they depend on this view’s state and lifetime.'),
      table(['State group', 'Signals / fields and initial values'], [
        ['Loading / errors', 'isLoading false; loadError and storageError null'],
        ['Hotspots', 'hotspots2D []; activeHotspot null; placementMode false; pendingHotspot null'],
        ['Placement form', 'pendingName / pendingDescription empty; pendingValue undefined; ordinary fields used by ngModel'],
        ['Camera', 'activeCameraAction null; private autoRotateEnabled false; actual controls rotation pauses during point interactions'],
        ['Screenshots', 'isCapturingFlash false; lastCapturedScreenshot null; flash and toast timers'],
        ['Dental', 'hoveredTooth and selectedTooth null; divisionMode 4; selectedParts q1..q4; activeColor #4A9CFF'],
        ['Restoration state', 'showGridLines and toothColors load from DentalService; shadePresets references DENTAL_SHADE_PRESETS'],
        ['Private scene state', 'scene / camera / renderer / controls, model, loadedOrgan, boundsMap, render flags, cached sizes and pointer'],
      ])),
    section('dependencies', 'Injected and constructed dependencies',
      text('Injected: HotspotStorageService, OrganScreenshotService, DentalService and NgZone. Constructed per component: ModelLoader(requestRender), CameraController(), DentalTextureSampler(dentalService), PickingController(hit => sampler.isGum(hit)), and HotspotProjection(() => overlay). Helpers have no independent Angular lifecycle. The callbacks capture this component, so invalidating and clearing them during destruction is part of ownership.')),
    section('effects', 'Effects and lifecycle',
      text('The first effect reads organ and, inside untracked, loads a different reference only after scene/renderer/controls exist. The initial load occurs in ngAfterViewInit. The second effect observes auto-rotate preference and whether a point is open, being placed, or pending; it sets controls.autoRotate only when interaction allows it. ngAfterViewInit runs initialization/loading outside Angular and catches startup failure into loadError. ngOnDestroy releases all scene resources and listeners. retryLoad reuses a healthy scene or retries initialization if it was unavailable.'),
      diagram('Viewer lifecycle', 'Angular owns view readiness and destruction. Scene helpers work within that lifetime.', ['Required organ input', 'ngAfterViewInit → initScene → loadModel', 'organ effect → replace model; auto-rotate effect → controls flag', 'Pointer / UI actions → state + helper + requestRender', 'ngOnDestroy → invalidate requests → detach / dispose resources'])),
    section('public-methods', 'Public UI method families',
      table(['Methods', 'Responsibility'], [
        ['resetCamera / recenterCamera / startCameraControl / stopCameraControl / nudgeCamera / toggleAutoRotate', 'Delegate math, maintain held action and preference, request render and marker sync'],
        ['captureScreenshot / dismissScreenshotToast / downloadScreenshot', 'Capture error boundary, persisted feedback, timers and anchor download'],
        ['selectHotspot / clearHotspot / togglePlacementMode / cancelPlacement / confirmPlacement / deleteHotspot / saveHotspotValue', 'Point selection, form validation, custom-point writes and caches'],
        ['isDentalModel / selectTooth / closeToothPanel', 'Detect compatible model and manage selected tooth/calibration'],
        ['setDivisionMode / toggleGridLines / togglePart / isPartSelected / selectAllParts', 'Zone selection and preferences'],
        ['applyColor / getPartColor / resetCurrentTooth / resetAllTeeth / updateMeshVertexColors', 'Edit restoration map, persist, update GPU color buffer'],
        ['retryLoad / ngAfterViewInit / ngOnDestroy', 'Initialization, recovery and disposal'],
      ]), text('The generated component reference lists every actual method signature and public signal declaration. Public methods primarily serve template bindings; they do not form a standalone renderer API. Event parameters are optional where the component supports keyboard or programmatic invocation.'), api('OrganViewerComponent')),
    section('private-methods', 'Important internal coordination',
      text('initScene builds renderer/camera/lights/controls and listeners. loadModel resets interactions/caches/errors, removes and disposes the old model, configures callbacks, prepares and freezes the current result, merges custom points, registers anchors and resets camera. requestRender marks dirty; scheduleFrame prevents duplicates; animate consumes pointer work, updates controls, renders and projects. handleResize updates aspect and renderer size. computeAllToothBounds measures and calibrates the service’s teeth. createScreenshot renders synchronously before composition. persistToothStates reports visible-but-unsaved edits. Keeping these together prevents multiple owners of RAF, scene attachment and Angular feedback.')),
    section('errors', 'Error and integration boundaries',
      text('loadError reports initialization, model load or unsupported format failures. storageError distinguishes failed persistence from successful visual edits. Screenshot saved feedback occurs only after service persistence succeeds; point creation/deletion updates memory after a successful write. Dental color/grid changes can remain visible if saving fails. Do not read private scene fields as an integration API: copy the component with its templates/styles and services, or use the extracted helpers.'), links(['Embedding guide', 'integration'], ['Performance', 'performance'], ['Model loading', 'model-loading'])),
  ),
  page('threejs-engine', 'Three.js engine', 'Three.js engine', 'Learn the graphics concepts through the concrete scene and geometry operations in this repository.',
    [viewer + 'organ-viewer.component.ts', viewer + 'scene/model-preparation.ts', viewer + 'dental/dental-color-renderer.ts', viewer + 'interactions/picking-controller.ts'],
    section('scene-graph', 'Scene, Object3D, Group and Mesh',
      text('Object3D is the transform-bearing scene-graph node. Scene is the root rendered with a camera; Group collects children; Mesh combines BufferGeometry and Material. Loaders return an Object3D tree rather than a single mesh. The viewer adds the prepared root to its scene and traverses descendant meshes for colors, BVHs and disposal. Mesh names such as Group1059 are application classification keys, independent of Three.js geometry material groups.'),
      diagram('Actual object hierarchy', 'The camera is passed to renderer.render; lights and the loaded model live in the scene.', ['Scene', 'AmbientLight + key / fill / rim DirectionalLight', 'Prepared Object3D root (scale + centered translation)', 'Mesh children → geometry + material(s) → texture maps', 'PerspectiveCamera + OrbitControls target (separate render arguments)']),
      code(`const scene = new THREE.Scene();
const root = new THREE.Group();
root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial()));
scene.add(root);`)),
    section('geometry', 'BufferGeometry and BufferAttribute',
      text('BufferGeometry stores attribute buffers and optional triangle indices. A position attribute has three numbers per vertex; normal has three; uv has two; color has three. Indexed triangles refer to shared vertices; non-indexed triangles store each corner separately. The dental routine requires paired triangles A-B-C / A-C-D, six vertices per quad. prepareModel converts only the named arches to non-indexed data and subdivides them. BufferGeometry groups are material ranges, not individual teeth.'),
      code(`const count = mesh.geometry.attributes['position'].count;
mesh.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3).fill(1), 3));`, 'typescript', 'scene/model-preparation.ts'),
      text('Normals represent surface direction for lighting. Subdivision preserves source corner normals and normalizes interpolated edge/center normals; absent normals are computed. New geometry does not automatically retain arbitrary custom attributes. Review the geometry guide before applying subdivision to a different mesh.')),
    section('materials', 'Materials, textures, UVs and vertex colors',
      text('A material describes surface shading; MeshStandardMaterial supports physically based lighting and a diffuse map. The loader can also produce other material types (OBJ/MTL commonly yields Phong materials); casting a material to MeshStandardMaterial to read map does not replace its runtime class. UV coordinates map vertex locations to an image. The teeth MTL references diffuse, normal and specular textures. CPU texture classification reads diffuse RGB; vertex colors tint the textured surface, so a white buffer [1,1,1] preserves its texture rather than painting flat white.'),
      code(`mesh.material.vertexColors = true;
mesh.material.needsUpdate = true;
const colors = mesh.geometry.attributes['color'];
// Write RGB entries, then upload the modified attribute on the next render.
colors.needsUpdate = true;`),
      text('The displayed snippet assumes one material. prepareModel handles arrays and sets all material flags. Texture wrapping, repeat, offset and flipY matter during hit sampling; DentalTextureSampler.isGum applies texture.transformUv. Bounds/color sampling uses averaged raw UV with an explicit 1-v inversion, matching the current asset.')),
    section('lighting', 'Lighting, camera and renderer',
      table(['Scene configuration', 'Current value / implication'], [
        ['PerspectiveCamera', '45° FOV, near 0.1, far 1000, position (0,0,4); aspect follows container'],
        ['WebGLRenderer', 'Antialias, alpha, high-performance preference; pixel ratio min(devicePixelRatio,2)'],
        ['Output color space', 'THREE.SRGBColorSpace'],
        ['AmbientLight', 'White, intensity 2'],
        ['Directional lights', 'White key 3 at (4,4,4); warm fill 1.5 at (-4,2,3); rim 1.2 at (0,5,-5)'],
        ['Background', 'Transparent WebGL over CSS studio backdrop; screenshot paints an equivalent gradient'],
      ]), text('OrbitControls maps browser pointer/wheel/touch input to camera orbit, pan and zoom. Damping continues camera updates after input ends; auto-rotation requires ongoing frames. The renderer does not own the animation loop here: OrganViewer’s dirty-flag scheduler does.')),
    section('coordinates', 'Transforms, bounds and rays',
      text('Mesh-local coordinates are the original OBJ numeric space used by dental thresholds. World coordinates include parent matrices and normalization. prepareModel uses Box3.setFromObject to center the model and scale its largest dimension to 2. BoundingBox is an axis-aligned extent; BoundingSphere is a center/radius broad-phase used internally by mesh intersection routines, not a stored tooth measurement in this app. Raycaster casts a camera ray against meshes; an intersection point is world space, while face.normal is local and must use the normal matrix under nonuniform scale.'),
      code(`const local = hit.object.worldToLocal(hit.point.clone());
const worldNormal = picking.surfaceNormal(hit.face!.normal, hit.object.matrixWorld);`),
      note('Static transform assumptions', 'freezeModel disables matrixAutoUpdate for the entire tree. The bundled GLBs have no animations or skins according to check-assets. Animated or moving models need explicit matrix updates or a different freeze policy.', 'warning')),
    section('lifecycle', 'GPU resource lifetime',
      diagram('Rendering pipeline', 'Buffers and materials are prepared once, then updated and rendered on demand.', ['Model bytes → loader → Object3D graph', 'Geometry attributes + material flags + BVH + normalization', 'Camera matrices + controls + lights', 'renderer.render(scene, camera) → WebGL canvas', 'Replacement / teardown → geometry / BVH / materials / textures / ImageBitmap disposal']),
      text('Removing an object from a scene does not free its GPU buffers. disposeModel deduplicates shared geometry/material resources inside one object tree; disposeMaterials deduplicates direct texture properties and ImageBitmap instances. It is not a global reference counter: assets shared between independently disposed models require an explicit external owner.'), links(['Ownership and disposal', 'model-loading'], ['Geometry', 'geometry'], ['Raycasting', 'raycasting'])),
  ),
  page('model-loading', 'Model loading and ownership', 'Three.js engine', 'Format dispatch, texture readiness, stale request protection, preparation and exact resource ownership.',
    [viewer + 'scene/model-loader.ts', viewer + 'scene/model-preparation.ts', viewer + 'scene/resource-disposer.ts'],
    section('formats', 'Formats and callbacks', api('ModelLoader'), api('ModelLoadCallbacks'),
      text('new ModelLoader(requestRender: () => void) constructs a shared LoadingManager, GLTFLoader configured with the Three.js bundled MeshoptDecoder, and TDSLoader. load(path, callbacks): void dispatches by a case-insensitive filename suffix: .gltf/.glb, .3ds, .obj. It does not strip query strings, so /model.glb?v=1 is not recognized by the current endsWith checks. Unsupported input calls unsupported; current asynchronous errors call error(unknown). Calling load after dispose is a no-op.'),
      table(['Stage', 'Meaning for the caller'], [
        ['loaded(object, false)', 'GLTF/3DS or geometry-only OBJ is transferred to caller; viewer may end loading immediately'],
        ['loaded(object, true)', 'Textured OBJ transferred hidden; caller must wait for texturesReady to show it'],
        ['texturesReady()', 'Dedicated OBJ manager completed; viewer sets model.visible true and refreshes dental colors'],
        ['error(error)', 'Current request failed; viewer reports readable loadError'],
        ['unsupported()', 'No supported suffix; no model attachment'],
      ])),
    section('sequence', 'Selection-to-render sequence',
      diagram('Model loading sequence', 'Each line describes a message or ownership transfer. A newer selection invalidates the earlier generation at any asynchronous stage.', ['Page → viewer: organ input changes', 'Viewer → old model: scene.remove + disposeModel; clear interaction/projection/bounds', 'Viewer → loader: load(path, callbacks), increment requestId', 'Loader → format parser: GLTF / TDS OR MTL → preload textures → OBJ', 'Parser → loader: Object3D; reject stale generation and dispose it', 'Loader → viewer.loaded: current object ownership transfers', 'Viewer → object: prepareModel → scene.add → freezeModel → register hotspots → reset camera', 'Textured OBJ manager → texturesReady: show model, compute colors, requestRender', 'Viewer → renderer: next demand frame'])),
    section('obj', 'OBJ, MTL and texture readiness',
      text('The loader replaces the OBJ extension with .mtl and uses the OBJ directory as MTL resourcePath. It creates a dedicated LoadingManager and fresh OBJLoader per request. materials.preload starts texture requests; ownedMaterials tracks generated materials, with vertexColors enabled. On successful OBJ parsing transferred becomes true; the object is hidden and passed with waitForTextures true. manager.onLoad cleans untransferred materials when the request failed or became stale, then signals texturesReady only if current and not failed. An MTL load error warns and falls back to a geometry-only OBJ using the shared manager.'),
      note('Ownership boundary', 'The existing working-tree loader edit is included in the source snapshot. Resource cleanup relies on the parser/LoadingManager completion path; this is not an AbortController implementation. A stale in-flight OBJ may still finish downloading and parsing before disposal.')),
    section('stale', 'Generation IDs are not network cancellation',
      text('Each load increments modelRequestId and captures it. isCurrent checks both destroyed and matching requestId. A stale success disposes the result instead of calling loaded; stale errors are ignored. dispose sets destroyed and increments the generation. This prevents a slow previous selection from replacing a newer model and prevents callbacks targeting a destroyed component. No request cancellation API is exposed. The LoadingManager may still request a render after network activity; the viewer scheduler’s destroyed guard makes that harmless.')),
    section('preparation', 'Geometry preparation and normalization', api('prepareModel'), api('freezeModel'),
      text('Importing model-preparation registers BVH compute/dispose methods on BufferGeometry.prototype and acceleratedRaycast on Mesh.prototype. prepareModel traverses meshes, converts dental arches to non-indexed geometry when needed, subdivides them three times, releases replaced original geometry, initializes white color attributes, enables vertexColors on all materials, and creates missing BVHs. It resets root transforms, measures Box3, scales largest dimension to 2, and translates by -center*scale. A zero-size model is only centered.'),
      text('freezeModel first updates matrixWorld recursively, then disables matrixAutoUpdate for every node. It is appropriate for the static bundled assets. AnimationMixer, skeletal poses, moving parts and later root transforms must opt back into updates or explicitly update local/world matrices. Register built-in hotspot anchors after normalization/freeze so they use the actual world matrix.')),
    section('disposal', 'Disposal contracts', api('disposeModel'), api('disposeMaterials'),
      text('disposeModel traverses Mesh descendants, collects unique geometries and materials, disposes geometry bounds trees if present and each geometry once, then calls disposeMaterials. disposeMaterials iterates direct material property values for Texture instances, disposes unique materials/textures and closes unique ImageBitmaps. It does not remove objects from scenes, release a renderer, dispose OrbitControls, inspect nested shader-uniform texture graphs, or reference-count externally shared textures. Callers own those boundaries.'),
      code(`scene.remove(model);
disposeModel(model);
// On final teardown, also release caller-owned controls and renderer.
controls.dispose();
renderer.dispose();
renderer.forceContextLoss();`), links(['Reuse ModelLoader', 'integration'], ['Source/API', 'api-reference/model-loader'], ['Memory guide', 'performance'])),
  ),
  page('geometry', 'Geometry and subdivision', 'Three.js engine', 'Buffer layouts, paired dental quads, interpolation, bounds, material groups and disposal rules.',
    [viewer + 'dental/dental-geometry.ts', viewer + 'scene/model-preparation.ts'],
    section('layout', 'The input is paired dental quads',
      text('subdivideGeometry is specialized quad subdivision, not a general-purpose triangle remesher. Non-indexed dental geometry stores each quad as six entries A B C A C D. The code takes A=q*6, B=A+1, C=A+2, D=A+5. quadCount is floor(position.count/6). An arbitrary triangle soup with a multiple-of-six count still may not satisfy this topology. scripts/check-assets.mjs verifies the actual OBJ duplicate A/C positions, normals and UVs for both arch meshes.'),
      table(['Asset mesh', 'Original vertices', 'Treatment'], [
        ['Group1014', '6240', 'Lower arch; 1040 paired quads; subdivided three times'],
        ['Group1059', '6684', 'Upper arch; 1114 paired quads; subdivided three times'],
        ['Group1104', '726', 'Other model geometry; no dental subdivision or coloring'],
      ])),
    section('subdivision', 'One quad becomes four', api('subdivideGeometry'),
      diagram('Quad refinement', 'Compute the four edge midpoints and the center, then emit each sub-quad as two triangles with the same A B C A C D structure.', ['A B C A C D (6 non-indexed corners)', 'AB / BC / CD / DA midpoints and M=(A+B+C+D)/4', 'A AB M DA | AB B BC M | M BC C CD | DA M CD D', '4 sub-quads × 6 corners = 24 vertices', 'Repeat 3 times → 64× original vertices']),
      text('Positions and UVs use linear midpoint/center interpolation. Corner normals are copied; edge normals normalize the summed endpoint normals, center normal normalizes all four. If normals are missing after all iterations, computeVertexNormals runs. UVs remain absent if input has none. Geometry name and shallow userData are retained; each material group start and count is multiplied by four per iteration. Arbitrary colors, tangents, morph targets and other attributes are not carried through.'),
      note('Cost', 'The 64× vertex multiplier follows directly from the algorithm; it is not a measured speed or memory benchmark. Changing iterations changes buffer size and classification granularity. Keep exact-asset golden tests when modifying subdivision.', 'warning')),
    section('ownership', 'Input, intermediate and final ownership',
      text('iterations defaults to 3. With zero iterations, the input itself is returned (and missing normals can be added). With positive iterations, the function disposes only intermediate geometries it created, never the input or returned final object. prepareModel disposes the original after replacement and any old bounds tree. The caller owns final geometry until model disposal. Do not dispose the input before handling whether returned === input.'),
      code(`const refined = subdivideGeometry(original, 3);
if (refined !== original) {
  original.disposeBoundsTree?.();
  original.dispose();
}
mesh.geometry = refined;`)),
    section('measurement', 'Bounds are measured from accepted quad centers',
      text('computeToothBounds operates in raw local geometry space, not normalized world space. It measures one center per six-corner quad after root/UV/pink-gum exclusion and tooth assignment. As a result these bounds describe sampled enamel centers, not every vertex, an oriented bounding box, or the full tooth root. The xz arch tangent provides an arch-aware horizontal projection H, while UV u follows the sculpted interproximal grooves.'), links(['Detailed bounds algorithm', 'dental-algorithms'], ['Model preparation', 'model-loading'])),
    section('bvh', 'Bounding boxes and BVH',
      text('prepareModel builds a bounds tree after replacing geometry so picking can use acceleratedRaycast. A BVH partitions triangles spatially; it accelerates compatible ray intersections without changing dental numbering. First-hit mode applies within each mesh’s accelerated raycast; PickingController still filters among object intersections. Rebuild the tree after changing positions/topology; color-only buffer changes do not require rebuilding it. Dispose the tree before releasing its geometry.')),
  ),
  page('raycasting', 'Surface picking and raycasting', 'Three.js engine', 'Pointer normalization, intersection filtering, BVH behavior, and local-to-world surface normals.',
    [viewer + 'interactions/picking-controller.ts', viewer + 'organ-viewer.component.ts'],
    section('pipeline', 'From a screen pointer to a surface',
      diagram('Raycasting pipeline', 'Use the canvas container rectangle, current camera matrices and model world matrices to obtain an intersection.', ['Pointer clientX / clientY', 'Subtract rect.left / top and divide by width / height', 'NDC x = 2*x/width - 1; y = 1 - 2*y/height', 'Raycaster.setFromCamera → camera ray', 'intersectObject(model, true) → BVH / mesh intersections', 'Allowed mesh + gum predicate → nearest valid returned hit', 'worldToLocal(hit.point) → tooth; world normal + point → custom hotspot'])),
    section('api', 'PickingController contract', api('PickingController'), api('createFirstHitRaycaster'),
      text('Construct with an isGum(hit) predicate. pick(event, rect, camera, model, allowed) returns THREE.Intersection | undefined. The pointer parameter only needs clientX/clientY; rect only needs left/top/width/height. allowed null returns the nearest intersection without gum filtering. A Set finds the first intersection whose object.name is allowed and whose gum predicate returns false. The component uses organ.clickableMeshes only when nonempty. Empty Set and null differ: empty Set permits nothing.'),
      text('createFirstHitRaycaster sets the BVH extension firstHitOnly=true. Without the prototype BVH registration, normal Three.js raycasting still operates; with BVH it returns the first hit per intersected mesh. Filtering cannot discover an intentionally omitted deeper triangle of the same mesh behind a rejected first hit. The algorithm does not loop through arbitrary deeper enamel layers.')),
    section('normal', 'Coordinate-space discipline',
      code(`const picking = new PickingController(() => false);
const hit = picking.pick(event, canvas.getBoundingClientRect(), camera, model, null);
if (hit?.face) {
  const worldPoint = hit.point.clone();
  const localPoint = hit.object.worldToLocal(worldPoint.clone());
  const worldNormal = picking.surfaceNormal(hit.face.normal, hit.object.matrixWorld);
}`),
      text('surfaceNormal clones the input and applies the inverse-transpose normal matrix derived from matrixWorld, then normalizes. This handles nonuniform scale correctly. worldToLocal mutates its vector, hence the clone. Make sure width/height are positive and matrices reflect recent transforms before picking; the helper does not validate the rectangle or update the entire scene for you.')),
    section('pointer', 'Mouse, touch and gesture handling',
      text('Pointer events unify mouse/pen/touch coordinates; OrbitControls owns camera gestures. The component accepts button 0, records pointer-down position/time, and treats pointer-up as tooth selection only if movement <6 CSS pixels and duration <500ms. In placement mode controls.enabled=false, a surface hit with a face creates a pending world point/normal. Pointer moves are coalesced into one pending event per frame. Pointer leave clears hover/cursor. Gesture thresholds, forms and Angular signal updates remain in the component; ray math remains framework-independent.'), links(['Dental texture filtering', 'dental-algorithms'], ['Hotspot projection', 'hotspots'], ['Reuse picking', 'integration'])),
  ),
  page('camera-controls', 'Camera controls', 'Three.js engine', 'Reset, recenter, bounded pan and zoom, damping, auto-rotation, and held-button scheduling.',
    [viewer + 'camera/camera-controller.ts', viewer + 'organ-viewer.component.ts'],
    section('contract', 'CameraController and action contract', api('CameraController'), api('CameraControlAction'),
      text('new CameraController() owns only scratch vectors. reset and recenter receive a PerspectiveCamera and a structural subset of OrbitControls: target, update, minDistance, maxDistance. step also receives CameraControlAction and a numeric stepMultiplier, returning a boolean for accepted movement. There is no scene, renderer, DOM subscription, Angular injection or RAF in this class.')),
    section('reset', 'Reset versus recenter',
      text('reset sets camera.position=(0,0,4) and target=(0,0,0), then calls controls.update(). recenter subtracts the old target from the camera position, sets target to origin and updates controls. It preserves the view offset/zoom and orbit direction while removing pan; it is not equivalent to reset. The component schedules a render and hotspot update after either.')),
    section('pan-zoom', 'Pan and zoom calculations',
      table(['Operation', 'Calculation / guard'], [
        ['Pan scale', 'max(0.4, camera-to-target distance) × 0.025 × direction × stepMultiplier'],
        ['Pan basis', 'Camera matrixWorld columns 0 and 1 are screen-right and screen-up'],
        ['Pan limit', 'Accept only if next target length <=3.2; translate camera and target equally'],
        ['Zoom in / out', 'Multiply distance by 1-0.07*m / 1+0.08*m; clamp to controls distance limits'],
        ['Degenerate zoom', 'If current camera-to-target distance <=0, return false'],
      ]), code(`const navigation = new CameraController();
controls.minDistance = 0.4;
controls.maxDistance = 8;
if (navigation.step(camera, controls, 'right', 1)) requestRender();
navigation.recenter(camera, controls);
requestRender();`)),
    section('controls', 'OrbitControls behavior',
      text('The component enables damping with dampingFactor=0.08, pan and screenSpacePanning, panSpeed=0.85, minDistance=0.4 and maxDistance=8. autoRotateSpeed=1.5. A controls change event requests a frame and marker update; animate calls controls.update and continues while damping changes the camera. Auto-rotation preference is paused during active/pending hotspot interactions and placement, then restored. This prevents the surface moving away during annotation.')),
    section('continuous', 'Held navigation and cleanup',
      text('startCameraControl immediately applies multiplier 1, records performance.now and sets activeCameraAction. After 180ms, animate applies multiplier 0.2 on subsequent scheduled frames until stopCameraControl clears it. nudgeCamera performs one keyboard-accessible step. These timings are component interaction behavior, not CameraController functionality. The viewer removes controls listeners and calls controls.dispose on destroy; reused controls require the same cleanup and caller-owned render scheduling.'), links(['Reuse camera controls', 'integration'], ['Frame scheduling', 'performance'])),
  ),
];
