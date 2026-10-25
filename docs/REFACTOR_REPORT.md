# Organ viewer refactoring report

Date: 2026-10-25. Baseline commit: `9ca096f` (`Enhances 3D viewer robustness, data integrity, and mobile experience`). The working tree was clean before this task. The earlier stabilization report remains unchanged as historical evidence.

## A. Architecture summary

`OrganViewerComponent` now coordinates Angular inputs/signals, UI handlers, persistence feedback, scene initialization/destruction, model attachment, and the single demand-driven rendering scheduler. It delegates substantial geometry, loading, disposal, projection, picking, camera, and image-composition work to ten viewer-local modules. Its source decreased from 2,166 to 1,085 lines, excluding trailing blank lines.

| Module | Responsibility and ownership |
| --- | --- |
| `dental/dental-geometry.ts` | Pure subdivision and enamel-bound calculations. Subdivision returns replacement geometry and releases only intermediate geometries it creates; the caller owns input/final geometry. Bounds computation returns measurements; component coordination retains catalog calibration and its existing cache-merging behavior. |
| `dental/dental-color-renderer.ts` | Writes the existing dental vertex-color buffers from explicit state, bounds, texture samples, and domain-calculation dependencies. Reuses existing color attributes. Owns no UI state, geometry lifetime, or rendering loop. |
| `dental/dental-texture.ts` | Finds the diffuse image and owns the viewer's CPU texture-sample WeakMap and UV scratch vector. Preserves downsampling, texture transforms, root/UV cutoffs, and gum classification. |
| `scene/model-loader.ts` | Owns the GLTF/3DS loaders, Meshopt decoder configuration, loading managers, and request generation. Transfers only current results, disposes abandoned results, ignores stale errors, and invalidates pending work on destruction. OBJ callbacks retain separate geometry-ready and texture-ready stages. |
| `scene/model-preparation.ts` | Preserves the existing BVH prototype registration, geometry preparation, vertex-color material setup, normalization, and matrix freezing. Does not own the live scene or scheduler. |
| `scene/resource-disposer.ts` | Releases resources belonging to a removed/abandoned model or an untransferred material set. Deduplicates geometry, materials, textures, and ImageBitmaps within that ownership scope. |
| `hotspots/hotspot-projection.ts` | Sole owner of world anchors, occlusion cache, marker-element cache, raycaster, and projection scratch vectors. Receives the current model/camera and the component's existing projected list; returns a replacement list only when list/visibility changes. Updates coordinates and marker DOM positions without duplicating Angular state. |
| `interactions/picking-controller.ts` | Owns pointer raycasting and normal-transform scratch objects. Receives the current bounds/camera/model/filter and uses the existing gum predicate. No pointer-event subscriptions or UI signals move here. |
| `camera/camera-controller.ts` | Performs reset, recenter, pan, and zoom operations on supplied camera/controls. Owns reusable calculation vectors, not camera instances, interaction state, or animation frames. Returns whether a step needs rendering. |
| `screenshots/screenshot-capture.ts` | Composes the current canvas, studio gradient, and visible hotspot markers; retains the 1,200-pixel cap and WebP/PNG behavior. Returns an image URL or an unavailable-context result. Rendering, metadata, storage, downloads, timers, and toast feedback remain coordinated by the component. |

Scene construction and OrbitControls/event/ResizeObserver setup intentionally remain together in the component. They establish resources consumed by Angular view references and the existing scheduler, and share partial-initialization/error cleanup. Moving them into a separate scene owner would add lifecycle plumbing without a corresponding benefit in this refactor. Dental selection/part editing and custom-point storage operations also remain with their signals and feedback rather than creating parallel UI-state owners.

`CameraControlAction` and `Hotspot2D` remain exported from the original component module through type re-exports. The selector, input, public signals, public methods, template, stylesheet, and persistence contracts are preserved. New production modules have explicit typed dependencies and introduce no Angular singleton services or additional animation loops.

## B. Files changed

All source paths below are relative to `src/app/features/anatomy/organ-viewer/` unless otherwise stated.

| File | Reason |
| --- | --- |
| `organ-viewer.component.ts` | Replaced extracted implementations with coordination calls; retained the existing public API, signals, event handlers, scheduler, and cleanup order. |
| `organ-viewer.component.spec.ts` | Retained all existing tests/assertions; moved direct algorithm/disposal calls to their new locations, changed GLTF mocking to the loader boundary, and replaced the untyped private test harness with an explicit test interface. |
| `camera/camera-controller.ts` | Extracted camera operations and scratch vectors. |
| `camera/camera-controller.spec.ts` | Added pan scale, held-step scale, reset/recenter, radius, and zoom-limit checks. |
| `dental/dental-geometry.ts` | Extracted subdivision and pure enamel-bound measurement. |
| `dental/dental-geometry.spec.ts` | Added actual-asset geometry-buffer and bounds equivalence checks against pre-refactor results. |
| `dental/dental-color-renderer.ts` | Extracted color-buffer mutation without changing region/shading rules. |
| `dental/dental-color-renderer.spec.ts` | Added eight exact color-buffer comparisons covering four modes and both grid settings, attribute reuse, gum masking, and restoration. |
| `dental/dental-texture.ts` | Extracted shared CPU sampling, diffuse-image lookup, and surface gum checks. |
| `dental/dental-texture.spec.ts` | Added sample-cache/size-limit and root/UV/fallback checks. |
| `hotspots/hotspot-projection.ts` | Extracted anchor registration, projection, visibility, occlusion, and DOM-position cache logic. |
| `hotspots/hotspot-projection.spec.ts` | Added model/world-space, coordinate-update, DOM, occlusion-threshold, backface, and cache-removal checks. |
| `interactions/picking-controller.ts` | Extracted raycasting, pointer normalization, and world-normal calculation. |
| `interactions/picking-controller.spec.ts` | Added nearest-hit, allowed-mesh, gum-filter, miss, and normal-transform checks. |
| `scene/model-loader.ts` | Extracted format dispatch, loader configuration, OBJ texture readiness, generation checks, and destruction invalidation. |
| `scene/model-loader.spec.ts` | Added current/stale/error/destruction checks, decoder preservation, OBJ fallback, texture readiness, and abandoned-material cleanup. |
| `scene/model-preparation.ts` | Extracted BVH/material/normalization/matrix preparation. |
| `scene/model-preparation.spec.ts` | Added normalization, vertex-color material, BVH disposal, and frozen-matrix checks. |
| `scene/resource-disposer.ts` | Extracted model/material resource cleanup. |
| `scene/resource-disposer.spec.ts` | Added actual ImageBitmap sharing/disposal coverage; the existing shared geometry/material/texture test also remains. |
| `screenshots/screenshot-capture.ts` | Extracted Canvas 2D composition and encoding. |
| `screenshots/screenshot-capture.spec.ts` | Added output-size, marker-position/visibility, WebP settings, PNG fallback, and unavailable-context checks. |
| `testing/dental-fixture.ts` | Loads and subdivides the actual OBJ for tests; provides hashing and fixture cleanup helpers. |
| `testing/dental-golden.ts` | Stores SHA-256 results captured from the original implementation at `9ca096f`, independently of the extracted implementations. |
| `docs/REFACTOR_REPORT.md` | Records architecture, method mapping, behavior evidence, commands, and remaining limits. |

The production HTML/CSS, routes, core services/models, dependencies, lockfile, assets, Angular configuration, existing validation scripts, and historical audit report have no changes.

## C. Methods moved

| Original responsibility/method | New location |
| --- | --- |
| `subdivideGeometry()` | `dental-geometry.ts`: `subdivideGeometry()` |
| `computeAllToothBounds()` calculation | `dental-geometry.ts`: `computeToothBounds()`; component keeps calibration/cache coordination |
| `updateMeshVertexColors()` buffer calculations | `dental-color-renderer.ts`: `renderDentalColors()`; public component method remains and requests rendering |
| `setQuadColor()` | Private helper in `dental-color-renderer.ts` |
| `getDentalDiffuseImage()` | `dental-texture.ts`: `getDentalDiffuseImage(model)` |
| `getTextureSample()` | `DentalTextureSampler.getSample()` |
| `checkIsGum()` | `DentalTextureSampler.isGum()` |
| `loadModel()` format dispatch and request guards | `ModelLoader.load()` / `isCurrent()`; component keeps loaded-organ state, attachment, hotspots, errors, and retry UI |
| `loadObj()` | `ModelLoader.loadObj()` |
| `prepareModel()` | `model-preparation.ts`: `prepareModel()`; dental cache reset remains with component state |
| `freezeModel()` | `model-preparation.ts`: `freezeModel()` |
| `disposeModel()` / `disposeMaterials()` | Functions in `resource-disposer.ts` |
| Model request-generation invalidation in `ngOnDestroy()` | `ModelLoader.dispose()` called by the component |
| `registerHotspot()` | `HotspotProjection.register()` |
| `removeHotspotState()` / `clearHotspotState()` | `HotspotProjection.remove()` / `clear()` |
| `updateHotspots()` calculation loop | `HotspotProjection.project()`; component keeps signal publication |
| `isOccluded()` / `getHotspotElement()` | Private methods of `HotspotProjection` |
| `updateMouse()` / `pickSurface()` raycasting | `PickingController.pick()`; component retains its model-availability wrapper |
| World-normal calculation in `handlePointerDown()` | `PickingController.surfaceNormal()` |
| `resetCamera()` / `recenterCamera()` calculations | `CameraController.reset()` / `recenter()`; public handlers retain event/render coordination |
| `applyCameraControlStep()` dispatch | `CameraController.step()`; component retains render/hotspot flags |
| `panCameraBy()` / `zoomCameraBy()` | Private `CameraController.pan()` / `zoom()` |
| Canvas composition/encoding in `createScreenshot()` | `screenshot-capture.ts`: `composeScreenshot()` |

`animate()`, `scheduleFrame()`, `requestRender()`, `handleControlsChange()`, and `handleResize()` remain in the component. Their token streams were compared against the baseline and are unchanged. Auto-rotation effects, held-button timing, pointer handlers, persistence calls, screenshot metadata/downloads, and all signal-backed UI actions remain coordinated there.

## D. Behavior preservation

The baseline was re-run before source changes: 55 passing tests, successful production build, successful application/test TypeScript checks, passing asset/bundle scripts, and a passing Chrome/SwiftShader smoke run. This established the current checkout's state rather than relying on the previous report.

Dental equivalence fixtures were captured by executing the original methods from the baseline against `public/models/teeth.OBJ`. Tests compare SHA-256 hashes for every subdivided position/normal/UV buffer in both dental arches, all measured tooth bounds, and complete vertex-color buffers for four division modes with grid lines enabled and disabled. These comparisons pass byte-for-byte. Existing zone IDs, numbering, shade values, UV strip thresholds, gum classification, and calibration formulas were not edited. Texture sampling and additional pink-gum/restoration tests cover the separate texture-dependent boundary.

Existing component tests were retained, including animation scheduling, damping, rotation pause/resume, camera controls, pointer coalescing, storage failures, late results, and destruction. Direct tests of code that moved now call the extracted location; their assertions remain. No tests were skipped or disabled. Added coverage brings the full suite to 88 passing tests.

The loader owns request validity but never owns the live scene. On transfer, the component owns preparation, attachment, replacement, and disposal; canceled results and untransferred OBJ material sets remain the loader's cleanup responsibility. Tests cover stale successes/errors, destruction, decoder setup, geometry-only fallback, texture readiness, and shared ImageBitmap cleanup. New modules have no `requestAnimationFrame()` calls.

The existing browser script ran unchanged against the refactored application. It passed all catalog models; actual pointer orbit and wheel zoom; dental picking and four division modes; color and grid persistence; custom-point placement/edit/deletion; reload persistence; screenshot capture/list/download/deletion; injected storage failure; idle rendering; mobile selection; resizing; rapid model replacement; and destruction. No uncaught browser exceptions or HTTP error responses were collected.

Before/after desktop and mobile screenshots were inspected. Desktop brain, mobile, mobile heart, and tablet PNG hashes match exactly. Decoded comparison of the two dental captures found 2,164 and 2,138 differing pixels out of 1,440,000, localized to the rendered-model region; mean absolute channel differences were 0.000776 and 0.000718 on the 0–255 scale. Whole-screen pixel identity across these browser runs is not claimed. The separate dental buffer tests establish equality for identical geometry/color inputs, and token comparisons also confirm unchanged texture-sampling/gum calculations after dependency renaming.

Baseline browser evidence: `C:\Users\ABANOU~1\AppData\Local\Temp\anatomy-results-0Epp9h`.

Refactored browser evidence: `C:\Users\ABANOU~1\AppData\Local\Temp\anatomy-results-0z4nUv`.

Each directory contains `results.json`, viewport screenshots, and a downloaded screenshot file. Evidence directories are temporary and the unchanged smoke script can recreate the checks using the setup documented in `AUDIT_REPORT.md`.

## E. Validation results

Chrome commands used the installed Chrome executable through `CHROME_BIN`. Build commands include `--stats-json` so the existing bundle checker has current production metadata.

| Command/check | Baseline | Refactored result |
| --- | --- | --- |
| `npm test -- --watch=false --browsers=ChromeHeadless --reporters=dots` | PASS — 55/55 | PASS — 88/88 |
| `npm run build -- --configuration production --stats-json` | PASS | PASS — no budget warnings |
| `npx tsc --noEmit -p tsconfig.app.json` | PASS | PASS |
| `npx tsc --noEmit -p tsconfig.spec.json` | PASS | PASS |
| `node scripts/check-assets.mjs` | PASS | PASS |
| `node scripts/check-bundles.mjs` | PASS | PASS — heavy viewer/Three.js code remains lazy |
| `npm start -- --host 127.0.0.1 --port 4200` | PASS | PASS — same server served the refactored checks |
| `node scripts/browser-smoke.mjs` | PASS | PASS |
| Targeted viewer tests using `--include='src/app/features/anatomy/organ-viewer/**/*.spec.ts'` | NOT RUN | PASS — progressive completed runs of 32, 38, and 49 tests during extraction |
| Intermediate targeted projection tests | NOT RUN | FAIL — a new test compared CSS pixel strings at greater precision than Chrome serializes; changed the assertion to numeric subpixel tolerance |
| Intermediate `npm test -- --watch=false --browsers=ChromeHeadless` | NOT RUN | FAIL — 86/88; two new fixtures used a constructor present in typings but not exported by the runtime. Fixtures now use `MTLLoader.parse()`. The final full suite passes. |
| AST/public-API and moved-kernel comparisons | NOT RUN | PASS — unchanged public members, scheduler/resize tokens, subdivision, freezing, and disposal kernels |
| `git diff --check` | PASS | PASS |
| Git scope checks for templates/styles/services/models/routes/assets/configuration/scripts | PASS | PASS — unchanged |
| Linting | NOT RUN | NOT RUN — no configured script/target |

Initial bundle size remains 263.25 kB raw. The anatomy lazy JavaScript chunk changed from 882,978 to 883,417 bytes, a 439-byte increase from module boundaries and explicit coordination. Viewer production CSS remains 20,218 bytes. No bundle-size reduction is claimed.

## F. Remaining risks

- Runtime verification used Chrome Headless with SwiftShader software WebGL. Physical touch devices, other browser engines, hosted production delivery, and long-running GPU-memory profiles were not exercised.
- Node 24 remains unsupported by this Angular 18 CLI, as documented in the original audit. This refactor does not change dependencies or the environment.
- The viewer stylesheet's existing 262-byte warning-budget margin remains unchanged; stylesheet restructuring is outside this behavior-preserving task.
- In-flight network requests may still finish after replacement. Generation checks and disposal prevent stale attachment; transfer cancellation was not added.
- Golden hashes pin the baseline behavior and actual asset. Deliberate future geometry/asset/shading changes require explicit review of those fixtures rather than automatic snapshot updates.

## G. Final Git diff summary

Two existing viewer TypeScript files are modified. Ten production modules, ten module test files, two test-fixture files, and this report are added: 25 reviewable files in total. No unrelated tracked files are modified. The historical audit, UI markup/styles, routes, domain/persistence services/models, assets, package files, configuration, and existing validation scripts are unchanged. Changes remain uncommitted for review.

The component now delegates the large standalone algorithms and low-level disposal implementations while retaining one scene lifecycle and one rendering scheduler. Production build, TypeScript, all 88 tests, asset/bundle checks, and the documented browser regression suite pass.
