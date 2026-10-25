# Anatomy Angular stabilization audit

Date: 2026-10-25. Work performed directly in the existing workspace. The starting Git working tree was clean. No dependencies, lockfiles, model assets, routes, or features were removed or upgraded.

## A. Executive summary

Implemented storage correctness, persisted-data validation, demand-driven rendering, lifecycle cleanup, error feedback, and mobile interaction fixes. The production build passes, all 55 unit tests pass, and automated Chrome checks exercised all seven catalog models with a real WebGL context backed by SwiftShader. This is runtime verification of the checks listed below, not a claim of production readiness or coverage of every device.

The installed stack is Angular 18.2.14, Angular CLI/build tools 18.2.21, TypeScript 5.5.4, Three.js 0.185.1, three-mesh-bvh 0.9.15, meshoptimizer 1.2.0, npm 11.13.0, and Node 24.20.0. The project uses standalone components, the Angular application builder, and Karma/Jasmine. No lint script or lint target is configured. The installed CLI reports Node 24 as unsupported, although installation, compilation, tests, and browser checks succeeded here.

## B. Files changed

Paths below are relative to the repository root. Each row describes the change and its purpose.

| File | Change and reason |
| --- | --- |
| `src/app/app.component.ts` | Removed the unused static anatomy-page import and component-import registration. The root continues to render its router outlet. |
| `src/app/app.component.spec.ts` | Replaced starter-template assertions with actual outlet and initial redirect/lazy-route integration checks; isolated the WebGL boundary. |
| `src/app/core/models/dental.model.ts` | Separated the 32-entry Universal catalog from 28 physical model teeth; removed duplicated neighboring coordinates from absent wisdom teeth. |
| `src/app/core/models/storage-validation.ts` | Added shared runtime checks for records, finite vectors, and supported three/six-digit hex colors. |
| `src/app/core/services/anatomy.service.ts` | Explained the 28-tooth model and absent wisdom teeth in its existing description. No additional assets were exposed. |
| `src/app/core/services/dental.service.ts` | Validated tooth IDs, division modes, zone keys, colors, and grid preferences; retained valid legacy data and cross-mode zone families. Added safe color fallback and explicit write success/failure results. |
| `src/app/core/services/dental.service.spec.ts` | Added persistence, malformed-data, color, numbering, mapping, quadrant, third, boundary, and storage-failure checks. |
| `src/app/core/services/hotspot-storage.service.ts` | Validated custom-point shapes and finite coordinates/values, normalized legacy empty numeric values, rejected duplicate IDs on load, and returned write failures. Organ association remains in the existing per-organ storage key. |
| `src/app/core/services/hotspot-storage.service.spec.ts` | Added valid-record, organ-isolation, malformed-record/JSON, duplicate-ID, optional-field, non-finite-coordinate, and storage-denial checks. |
| `src/app/core/services/organ-screenshot.service.ts` | Published in-memory changes only after successful persistence; returned null/false on failures. Removed quota retries that silently dropped older captures, while retaining the existing 12-capture retention policy. Validated loaded arrays and legacy single records. |
| `src/app/core/services/organ-screenshot.service.spec.ts` | Added success, quota, serialization, deletion/clear failure, retention, legacy-record, malformed-data, unavailable-storage, and server-platform checks. |
| `src/app/features/anatomy/anatomy-page/anatomy-page.component.ts` | Added validated selection by ID for the compact mobile selector. |
| `src/app/features/anatomy/anatomy-page/anatomy-page.component.html` | Added a labeled selector where the existing mobile layout hides the organ sidebar. |
| `src/app/features/anatomy/anatomy-page/anatomy-page.component.css` | Styled the mobile selector using existing variables and sized the mobile viewer to leave room for it. Desktop grid rules remain in place. |
| `src/app/features/anatomy/anatomy-page/anatomy-page.component.spec.ts` | Isolated WebGL initialization and verified list/selector selection reaches the viewer and information panel. |
| `src/app/features/anatomy/organ-info/organ-info.component.ts` | Represented screenshot deletion failures in a signal rather than implying removal. |
| `src/app/features/anatomy/organ-info/organ-info.component.html` | Added accessible deletion-error feedback. |
| `src/app/features/anatomy/organ-info/organ-info.component.spec.ts` | Supplied the required input before detection and verified input changes and failed-deletion feedback. |
| `src/app/features/anatomy/organ-list/organ-list.component.html` | Labeled search and displayed a no-results state. |
| `src/app/features/anatomy/organ-list/organ-list.component.spec.ts` | Supplied the required selected-organ input; verified filtering, empty results, active selection, and emitted selections. |
| `src/app/features/anatomy/organ-viewer/organ-viewer.component.ts` | Added a single pending-frame scheduler outside Angular that sleeps at idle and continues for damping, rotation, held camera movement, and pointer work. Hardened teardown/stale-load handling, geometry/material/texture disposal, subdivision metadata, screenshot projection/capture errors, custom-point persistence, dental write feedback, and load/retry errors. |
| `src/app/features/anatomy/organ-viewer/organ-viewer.component.html` | Wired custom-point value saving; added errors/retry and accessible control names; prevented screenshot capture while the model is loading or unavailable. |
| `src/app/features/anatomy/organ-viewer/organ-viewer.component.css` | Allowed overflowing header actions to wrap and added a visible keyboard-focus indicator for the division-grid toggle. |
| `src/app/features/anatomy/organ-viewer/organ-viewer.component.spec.ts` | Added deterministic renderer/control/frame mocks and tests for idle scheduling, damping, auto-rotation pause/resume, camera actions, coalesced pointer work, screenshots, storage failures, dental state, subdivision, shared disposal, late loads, teardown, and errors. |
| `scripts/check-assets.mjs` | Added repeatable exact-case catalog/material path checks, actual OBJ structure checks, and GLB metadata inspection. |
| `scripts/check-bundles.mjs` | Added production-output graph checks that follow initial HTML script entries and verify anatomy/Three.js inputs remain lazy. Reports component CSS output size. |
| `scripts/browser-smoke.mjs` | Added repeatable isolated-profile Chrome/CDP runtime checks, screenshots, downloaded-file verification, reload persistence, responsive checks, and browser-error/HTTP-error collection. Requires a running development server and Chrome; supports `CHROME_BIN` and `ANATOMY_URL`. |
| `docs/AUDIT_REPORT.md` | Recorded implemented fixes, validation evidence, limitations, and remaining work. |

## C. Confirmed defects fixed

1. **Screenshot persistence falsely reported success.** Previously a failed final write returned the attempted list and save record anyway. Writes/removals now succeed before the service publishes changes. Failures preserve existing captures and produce explicit UI errors. Serialization and unavailable-storage cases are covered as well as quota errors.
2. **Tests did not match current component contracts.** The initial test run had four failures: an obsolete heading assertion and three missing required inputs (`NG0950`). Inputs are now supplied before change detection. Page/root tests isolate viewer initialization; viewer unit tests mock the WebGL boundary while testing real scheduling and lifecycle logic.
3. **Idle rendering still scheduled animation callbacks continuously.** The scheduler now permits at most one pending frame, continues while OrbitControls reports movement or an active operation needs frames, and becomes idle after damping settles. Controls events, camera buttons, model/texture loads, resize, custom-point changes, and coalesced pointer moves wake it. Destruction blocks later scheduling.
4. **Persisted dental/hotspot/screenshot JSON was trusted after parsing.** Runtime validation now rejects malformed entries independently and preserves valid entries without changing storage keys or formats. Invalid colors no longer silently become unintended colors. Grid preferences accept actual booleans.
5. **Absent teeth had misleading coordinates.** Catalog entries 1, 16, 17, and 32 reused neighboring molar centers although picking identified 2–15 and 18–31. They remain in the Universal catalog and valid saved-state format, but have no physical centers and cannot be selected through the physical-tooth API. Existing physical mappings are unchanged.
6. **Custom-point value edits were not persisted.** The Save action previously only closed the tooltip. It now writes custom-point values and reports failure. Creation/deletion commit the model's point list after a successful write. Loaded custom IDs cannot collide with built-in IDs.
7. **Screenshot markers could use stale coordinates.** Camera motion updated marker DOM positions but left the signal's coordinates unchanged when visibility was stable. Coordinates now stay current and projection is refreshed before capture.
8. **Lifecycle cleanup repeated disposal of shared resources and omitted replacement geometry.** Disposal now deduplicates geometries, materials, textures, and ImageBitmaps within a released model. Replaced dental geometry and its BVH are released, abandoned OBJ material ownership is handled, and late model results are disposed. Subdivision retains groups, name, and user metadata alongside the existing position/normal/UV interpolation.
9. **Mobile organ navigation and header actions were inaccessible.** Browser screenshots confirmed the sidebar disappeared without another organ selector and Auto Rotate was clipped. A mobile-only selector and wrapping controls repair these functions using the existing visual design.
10. **Load failures had no visible recovery path.** Failed model loads now stop loading feedback, show an error, and allow retry. WebGL initialization and screenshot canvas failures are handled without crashing the application. Dental/grid write failures also explain that visible edits could not be saved.

The root's unused static anatomy reference was removed. The actual post-fix production graph was inspected; no bundle-size reduction relative to an untouched build is claimed.

## D. Additional risks and verified design decisions

- **Node compatibility:** the installed CLI prints `Warning: The current version of Node (24.20.0) is not supported by Angular.` Use a Node version supported by the installed Angular toolchain for repeatable CI. No dependency changes were needed here.
- **Component style budget:** the viewer stylesheet is 28,811 bytes in source and 20,218 bytes in the production CSS output. The 20 kB warning threshold is 20,480 bytes in this Angular builder, leaving 262 bytes of headroom; the error threshold remains 30 kB. The large stylesheet contains the dental inspector, camera HUD, hotspot UI, and screenshot UI. The final build emits no budget warnings. Styles and budgets were preserved rather than deleting functional rules.
- **Lazy payload:** initial output is 263.25 kB raw / 75.74 kB estimated transfer. The anatomy lazy JavaScript chunk is 882.98 kB raw / 188.71 kB estimated transfer. Three.js and viewer/page inputs occur only outside the initial import graph. The root redirect still opens the anatomy page immediately, so that chunk is naturally requested on first navigation.
- **Hardware/browser coverage:** runtime checks used Chrome Headless 155 on Windows with SwiftShader software WebGL, at 1440×1000, 900×1000, and 390×844. Actual mobile touch hardware, other browser engines, prolonged GPU-memory profiling, and hosted production delivery were not verified. The browser checks ran against the development server; the production build was compiled and its output graph checked separately.
- **Asynchronous loading:** existing loaders still complete some in-flight requests after a model switch. Request-generation checks reject stale results and dispose resources. Network transfer cancellation itself was not added. Assets are independently owned per load with the current loader configuration; cross-model resource caching would need explicit reference ownership before sharing resources.
- **Storage design:** persistence remains localStorage, with the existing 12-screenshot limit. Failed screenshot writes leave previous captures intact instead of dropping old captures until a new image fits. Users can delete a capture to free space. No new format or migration was introduced. Built-in hotspot numeric data remains session-only, as in the original application; custom-point numeric data now persists.
- **Dental geometry:** the actual asset has dental arches `Group1014` (6,240 vertices) and `Group1059` (6,684 vertices), plus `Group1104` (726 vertices). The two subdivided arches have only position/normal/UV attributes, no material groups, and valid paired triangles; the additional mesh is not subdivided. Runtime enamel-bound computation found exactly 28 tooth IDs. All four division modes produced finite color buffers. Clinical numbering/segmentation accuracy still merits domain review beyond these software checks.
- **Assets:** all 14 model/thumbnail catalog paths and three dental material texture references exist with exact filename case. All nine GLBs have zero animations and zero skins, so the current static-model lifecycle does not suppress authored animation tracks. `eyeball.glb`, `intestine.glb`, `kidneys.glb`, `pancreas.glb`, and `skin.glb`, plus their image sets, are unused integration opportunities. Alternative PNG dental textures, spare texture maps, decoder assets, and site artwork were retained.

## E. Validation results

| Command/check actually executed | Status | Outcome |
| --- | --- | --- |
| `npm ci --no-audit --no-fund` | PASS | Installed 984 packages from the existing lockfile. npm printed transitive-package deprecation notices; versions and lockfile were unchanged. |
| `npm run ng -- version` | PASS | Identified the versions above and the unsupported-Node warning. |
| Initial `npm test -- --watch=false --browsers=ChromeHeadless` | FAIL | 4 failed / 4 passed. Errors included `NG0950: Input is required but no value is available yet` and the obsolete `Hello, anatomy-angular` assertion. |
| Final `npm test -- --watch=false --browsers=ChromeHeadless --reporters=dots` | PASS | 55 of 55 tests passed. `CHROME_BIN` was set to the installed Chrome executable. |
| `npm run build -- --configuration production --stats-json` | PASS | Production application generated successfully with no bundle/style budget warnings. |
| `npx tsc --noEmit -p tsconfig.app.json` | PASS | Application TypeScript check. |
| `npx tsc --noEmit -p tsconfig.spec.json` | PASS | Test TypeScript check. |
| `node scripts/check-assets.mjs` | PASS | Exact-case catalog/material paths, dental quad structure, mesh attributes/bounds, and GLB metadata inspected. |
| `node scripts/check-bundles.mjs` | PASS | Traversed initial scripts/static imports; anatomy and Three.js inputs remained outside that graph. |
| `npm start -- --host 127.0.0.1 --port 4200` | PASS | Development server started and served the browser checks. |
| `node scripts/browser-smoke.mjs` | PASS | Final browser regression run completed with no uncaught browser exceptions or HTTP error responses. Downloaded screenshot file verified on disk. |
| `git diff --check` | PASS | No whitespace errors. Git also prints informational LF/CRLF conversion notices on this Windows checkout. |
| Linting | NOT RUN | No lint script or lint target is configured. |
| Production-hosted / physical-device manual regression | NOT RUN | No hosted deployment or physical-device browser session was exercised. |

Browser regression coverage: initial redirect; every catalog model; search; actual pointer orbit and wheel zoom; damping completion; camera reset/recenter/nudges; auto-rotation; idle frame-count stability; dental picking and all four division modes; finite vertex colors; division-grid preference; custom-point surface placement, value editing, deletion, and reload persistence; screenshot capture/listing/download/deletion and reload persistence; injected quota failure with no false saved toast; mobile organ selection/action visibility without horizontal overflow; responsive renderer sizing; rapid model replacement; and teardown.

The final browser evidence is in the local temporary directory `C:\Users\ABANOU~1\AppData\Local\Temp\anatomy-results-l1IgIy` (`results.json`, desktop/mobile/tablet screenshots, and a downloaded WebP). Screenshots were visually inspected during the audit. The added scripts allow regenerating this temporary evidence with a fresh isolated profile. Intermediate test/smoke iterations also exposed test-harness scheduling and exact-floating-point assertion issues; those checks were corrected before the final passing runs.

To repeat the browser check in PowerShell, start the development server in one terminal, then run `node scripts/browser-smoke.mjs` in another. Set `$env:CHROME_BIN` if Chrome is installed elsewhere. The script creates a separate temporary browser profile and does not use the user's normal browser storage.

## F. Remaining work, ordered by severity

- **P0:** No outstanding confirmed issue identified in the audited paths.
- **P1:** No outstanding confirmed issue identified in the audited paths.
- **P2:** Align CI/local Node with the installed Angular toolchain's supported versions; run physical-device/browser-engine and prolonged GPU-memory checks before a release; address the small viewer-style budget margin before substantial style additions. Profile the lazy payload on target devices before deciding whether further loader/code splitting is worthwhile.
- **P3:** Integrate unused organ assets only when product requirements call for them. Add a configured lint workflow if desired. Decide separately whether built-in hotspot data should persist across sessions.

## G. Final quality assessment

- **Build verified:** yes, production build and initial/lazy output graph.
- **Test verified:** yes, 55 passing unit tests.
- **Runtime verified:** yes, the enumerated automated Chrome/software-WebGL checks; physical hardware and hosted production delivery remain unverified.
- **Ready for further development:** yes, with the documented environment and verification limits. Production readiness was not inferred from successful compilation alone.
