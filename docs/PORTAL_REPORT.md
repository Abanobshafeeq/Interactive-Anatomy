# Developer documentation portal — implementation and verification

Date: 2026-10-27 (Africa/Cairo). Repository baseline at discovery: `6fe3987`.

## A. Executive summary

Implemented a working developer documentation website inside the existing Angular application.
Open `/docs`; `/` still redirects to `/anatomy`. The documentation and anatomy features are
independently lazy-loaded. Documentation never imports the live renderer or application services.

The portal contains **74 pages**: 25 conceptual/index pages and 49 exported-symbol API pages,
plus a dynamic browser for 25 source-file snapshots. Features include a three-column desktop
layout, collapsible sidebar groups, mobile navigation with keyboard focus management, full
content search with Ctrl/Cmd+K, heading anchors and observed TOC highlighting, breadcrumbs,
previous/next links, scoped light/dark themes, escaped/copyable code, and print styles.

There are **22 local HTML/CSS engineering diagrams**, **216 checked content links**, and seven
integration scenarios generated from type-checked TypeScript. No dependency upgrade, new UI
framework, hosted search backend, runtime Markdown renderer, or diagram CDN was introduced.

The existing working-tree edit in `scene/model-loader.ts` was present before this task and was
preserved. No rendering/dental algorithm, asset path or application persistence key was changed.

## B. Routes

| Route | Section |
| --- | --- |
| `/docs` | Documentation overview, stack, quick start and reuse map |
| `/docs/getting-started` | Actual commands, environment and hosting prerequisites |
| `/docs/architecture` | Startup, component data flow, rendering and ownership |
| `/docs/project-structure` | Current refactored source tree and dependency direction |
| `/docs/angular-foundation` | Shell, configuration, page/list/info contracts and signals |
| `/docs/data-models` | Exact types, fields, producers/consumers and validation |
| `/docs/services` | All four services and storage guards |
| `/docs/organ-viewer` | Viewer orchestration, signals, methods and lifecycle |
| `/docs/threejs-engine` | Graphics concepts grounded in this implementation |
| `/docs/model-loading` | Formats, texture readiness, generation IDs and disposal |
| `/docs/geometry` | Paired quads, subdivision, attributes, bounds and BVH |
| `/docs/dental-system` | Asset mapping, physical numbering, editing and persistence |
| `/docs/dental-algorithms` | Classifier formulas, thresholds, bounds, UV and coloring |
| `/docs/hotspots` | Coordinates, projection, occlusion/cache and custom points |
| `/docs/raycasting` | Pointer normalization, filtering and surface normals |
| `/docs/camera-controls` | Reset/recenter, bounded pan/zoom and interaction scheduling |
| `/docs/screenshots` | Fresh-frame composition, formats, metadata and storage |
| `/docs/persistence` | Exact keys, runtime validators and write-failure behavior |
| `/docs/performance` | Demand frames, caches, memory ownership and profiling |
| `/docs/testing` | Existing tests, dental goldens and verification commands |
| `/docs/api-reference` | Complete exported-symbol index |
| `/docs/integration` | Seven compiled reuse scenarios and dependency matrix |
| `/docs/troubleshooting` | Symptoms, diagnosis, source locations, fixes and verification |
| `/docs/glossary` | Application, graphics, dental and ownership terminology |
| `/docs/maintenance` | Content, navigation, diagrams, API and example maintenance |
| `/docs/api-reference/:symbol-id` | One page per exported symbol (49 IDs) |
| `/docs/source/:source-id` | Separately lazy-loaded full source snapshots (25 IDs) |
| Unknown documentation path | Helpful recovery view with overview/API links |

Examples of API paths: `/docs/api-reference/model-loader`, `/docs/api-reference/dental-service`,
`/docs/api-reference/camera-controller`, `/docs/api-reference/compute-tooth-bounds`, and
`/docs/api-reference/render-dental-colors`. Each API page links its actual defining source file.

## C. Documentation architecture

`docs.routes.ts` mounts the layout, a catalog-driven page renderer and a separate lazy source
component. `docs.models.ts` defines typed page/section/block contracts. `docs-content.ts` is the
single catalog for navigation, search, page resolution and previous/next links.

Curated guides are grouped in foundation, engine, dental, state, engineering and integration
content files. API pages combine generated AST declarations with curated behavior notes.
Source snapshots retain complete text, dependencies, paths, line references and content hashes.
Integration examples are checked independently, then embedded as text. All code is rendered
using Angular interpolation; source imports are never executed by the documentation.

`DocsLayoutComponent` owns navigation, theme, scroll/focus behavior and return-to-viewer UI.
`DocsPageComponent` resolves catalog pages and exposes semantic sections. Reusable block,
code, search and TOC components render the common UI. The source component imports the large
source corpus only on its route. All documentation styles are component-scoped.

## D. Coverage

All 49 discovered exported production symbols have generated reference pages:

- Components: `AppComponent`, `AnatomyPageComponent`, `OrganListComponent`,
  `OrganInfoComponent`, `OrganViewerComponent`.
- Services: `AnatomyService`, `DentalService`, `HotspotStorageService`,
  `OrganScreenshotService`, including public method signatures and curated method behavior.
- Helper classes: `ModelLoader`, `CameraController`, `PickingController`,
  `HotspotProjection`, `DentalTextureSampler`.
- Functions: `isRecord`, `isFiniteVector`, `isHexColor`, `createFirstHitRaycaster`,
  `subdivideGeometry`, `computeToothBounds`, `renderDentalColors`, `getDentalDiffuseImage`,
  `prepareModel`, `freezeModel`, `disposeModel`, `disposeMaterials`, `composeScreenshot`.
- Interfaces: `Organ`, `Hotspot`, `OrganScreenshot`, `ToothExtents`, `ToothState`,
  `ToothCatalogEntry`, `ToothData`, `DentalShadePreset`, `ToothEnamelBounds`,
  `DentalColorState`, `TextureSample`, `ModelLoadCallbacks`, `Hotspot2D`.
- Types: `DivisionMode`, `ToothQuadrant`, `CameraControlAction`, `TextureImage`.
- Constants/configuration: `TEETH_CATALOG`, `MODEL_TEETH`, `DENTAL_SHADE_PRESETS`,
  `appConfig`, `routes`.

Detailed guides cover each viewer helper and the Angular templates/state/lifecycle around them.
Dental coverage explicitly distinguishes 32 catalog entries from 28 physically present teeth,
arch groups from individual teeth, local from world coordinates, raw from transformed UV
sampling, actual persisted zone keys, and visual edits from successful storage.

Private members are listed by source location and their full implementation is browsable.
Unexported low-level helpers and scratch variables are not presented as independently reusable
public APIs. Test fixtures/golden data are explained in the testing guide rather than added to
the production API catalog. New docs UI internals are described by the maintenance guide.

## E. Integration scenarios

| Scenario | Dependencies and ownership |
| --- | --- |
| A. Model loader | Three.js example loaders and disposer; optional preparation/BVH policy; caller owns transferred trees |
| B. Camera | Three.js and supplied camera/controls; host owns events and render loop |
| C. Picking | Three.js; optional BVH; caller supplies viewport/filter and owns pointer listeners |
| D. Hotspots | Three.js, DOM, Hotspot type and picking helper; caller owns overlay nodes and coordinate policy |
| E. Capture | Browser Canvas 2D and Hotspot2D type; caller supplies fresh frame and storage/download decisions |
| F. Dental | Exact compatible asset, catalog/calibration, dental helpers, Three.js and preparation/BVH if used |
| G. Angular viewer | Standalone viewer/template/CSS, all helpers, core models/services, Angular Forms, Three.js/BVH and assets |

The examples in `docs/examples/integration.examples.ts` compile against the actual repository
constructors/functions. Generic extraction does not silently import Angular runtime into the
Three.js helpers: structural `Pick` contracts are explained. Supporting a new dental asset
requires topology, mesh, axis, UV, numbering and classification calibration.

## F. Files changed

Modified by this task:

```text
README.md
scripts/check-bundles.mjs
src/app/app.routes.ts
src/app/features/anatomy/anatomy-page/anatomy-page.component.ts
src/app/features/anatomy/anatomy-page/anatomy-page.component.html
src/app/features/anatomy/anatomy-page/anatomy-page.component.css
src/app/features/anatomy/anatomy-page/anatomy-page.component.spec.ts
src/app/features/anatomy/organ-list/organ-list.component.ts
src/app/features/anatomy/organ-list/organ-list.component.html
src/app/features/anatomy/organ-list/organ-list.component.css
src/app/features/anatomy/organ-list/organ-list.component.spec.ts
```

New files:

```text
docs/DEVELOPER_DOCUMENTATION.md
docs/PORTAL_REPORT.md
docs/examples/integration.examples.ts
docs/tsconfig.examples.json
scripts/check-docs.mjs
scripts/docs-browser-smoke.mjs
scripts/generate-docs-api.mjs
src/app/features/docs/docs.routes.ts
src/app/features/docs/docs.models.ts
src/app/features/docs/docs-content.ts
src/app/features/docs/docs-layout.component.ts
src/app/features/docs/docs-layout.component.html
src/app/features/docs/docs-layout.component.css
src/app/features/docs/docs-page.component.ts
src/app/features/docs/docs-page.component.html
src/app/features/docs/docs-page.component.css
src/app/features/docs/docs-source.component.ts
src/app/features/docs/docs.spec.ts
src/app/features/docs/ui/docs-block.component.ts
src/app/features/docs/ui/docs-block.component.css
src/app/features/docs/ui/docs-code-block.component.ts
src/app/features/docs/ui/docs-search.component.ts
src/app/features/docs/ui/docs-toc.component.ts
src/app/features/docs/content/foundation.pages.ts
src/app/features/docs/content/engine.pages.ts
src/app/features/docs/content/dental.pages.ts
src/app/features/docs/content/state.pages.ts
src/app/features/docs/content/engineering.pages.ts
src/app/features/docs/content/integration.page.ts
src/app/features/docs/content/api.pages.ts
src/app/features/docs/content/api.behavior.ts
src/app/features/docs/content/api.generated.ts
src/app/features/docs/content/sources.generated.ts
src/app/features/docs/content/examples.generated.ts
src/app/features/docs/content/version.generated.ts
```

`scene/model-loader.ts` remains separately modified by the pre-existing user change. Existing
assets, dependencies/lockfile, global CSS, historical reports and rendering algorithms were not
edited. The two existing component test setups gained router providers for the added links;
their original tests/assertions remain.

## G. Tests and checks

Baseline: **88 successful tests** before implementation. Final suite: **106 successful tests**,
including all original tests plus 18 documentation tests. No test was skipped or disabled.

| Command | Result |
| --- | --- |
| `npm test -- --watch=false --browsers=ChromeHeadless` | PASS, 106 tests |
| `npx tsc --noEmit -p tsconfig.app.json` | PASS |
| `npx tsc --noEmit -p tsconfig.spec.json` | PASS |
| `npx tsc --noEmit -p docs/tsconfig.examples.json` | PASS |
| `node scripts/check-docs.mjs` | PASS: 74 pages, 24 required topics, 49 symbols, 216 links, 22 diagrams |
| `node scripts/generate-docs-api.mjs --check` | PASS: 25 source files / 49 exports; also called by check-docs |
| `node scripts/check-assets.mjs` | PASS: 14 catalog paths, companion textures, quad layout and GLB metadata |
| `npm run build -- --configuration production --stats-json` | PASS |
| `node scripts/check-bundles.mjs` | PASS: initial/docs static dependency closures exclude engine |
| `node scripts/browser-smoke.mjs` | PASS: 29 assertions plus one mobile layout observation; no browser/HTTP failures |
| `node scripts/docs-browser-smoke.mjs` | PASS: 24 checks; no browser/HTTP failures |
| `git diff --check` | PASS; Git additionally notes existing LF/CRLF normalization settings |

New tests cover lazy route contracts/default redirect, docs without canvas initialization, all
conceptual routes, active navigation, API/source deep links, unknown pages, TOC fragments,
Ctrl/Cmd+K, arrows/Enter/Escape, empty search, mobile drawer close/navigation/focus, metadata,
internal references, content/API search, escaped code and clipboard success/failure.

## H. Production output and lazy boundaries

Final production output (`dist/anatomy-angular/browser`), raw decimal sizes:

| Output | Raw size | Estimated transfer |
| --- | --- | --- |
| Initial application total | 272.15 kB | 77.33 kB |
| Anatomy lazy feature | 884.00 kB | 189.03 kB |
| Docs routes/content/UI lazy feature | 208.30 kB | 58.15 kB |
| Docs shared declarations/code UI chunk | 62.19 kB | 11.36 kB |
| Source browser/snapshots additional lazy chunk | 128.46 kB | 26.67 kB |

The initial total includes the Angular/router shared runtime, polyfills and global styles.
The docs static import closure consists of its route chunk, documentation shared chunk and
Angular runtime; it contains no Three.js, anatomy feature or core application service inputs.
Source snapshots are behind an additional dynamic import. No production budget warning or
build error was reported. Bundle sizes are local build evidence, not runtime benchmarks.

## I. Browser verification

Used local headless Chrome 155 on Windows with the development server at
`http://127.0.0.1:4200`. The existing viewer suite used SwiftShader and remained unchanged.

Verified viewer behavior: initial redirect/real WebGL, pointer orbit and damping, wheel zoom,
organ filtering, all seven catalog selections/formats, all 28 physical dental bounds, dental
picking, all four division modes and color/grid persistence, camera actions/rotation/idle,
custom points and values, captures/list/download/delete, reload persistence, injected quota
failure, mobile organ selection and no overflow, resize, rapid replacement and destruction.

Verified docs behavior: fresh `/docs` without WebGL/canvas/anatomy; three-column desktop layout;
active sidebar navigation; TOC anchor scrolling; Ctrl+K → real keyboard result selection → API;
empty search/Escape; API → source and direct source reload; dental deep link; scoped theme and
reload persistence; direct loads of all 25 conceptual/index routes; unknown page recovery;
browser back/forward; 390px mobile layout/code overflow; mobile drawer/modal/inert state,
focus entry and Escape restoration; mobile route close; viewer/docs navigation both ways.
Network requests across documentation visits contained no model assets or engine modules.
WebGL context interception before first docs load recorded zero WebGL requests until anatomy.

Local artifacts retained outside the repository:

```text
Viewer: C:/Users/ABANOU~1/AppData/Local/Temp/anatomy-results-Wmi1lu/
Docs:   C:/Users/ABANOU~1/AppData/Local/Temp/anatomy-docs-results-FwIe1h/
Tests:  C:/Users/ABANOU~1/AppData/Local/Temp/anatomy-docs-tests.log
```

These directories include result JSON and representative screenshots where applicable.

## J. Remaining limitations

- Chrome headless was exercised. Firefox, Safari, real touch hardware and screen readers were
  not independently verified; semantics/keyboard behavior are implemented and tested as above.
- Direct reloads were verified under Angular's development server. A production hosting
  provider's SPA rewrite configuration was not deployed or tested.
- Syntax coloring uses a small tokenizer, not complete language grammars. Search is local
  all-word matching over the documentation catalog, without fuzzy ranking or highlighted hits.
- Explanations/behavior are curated; generated signatures and source freshness do not prove
  semantic prose remains correct. Version text records the generation baseline, while hashes
  identify snapshot content. Current HEAD equality is intentionally excluded from freshness
  checks so committing generated files does not invalidate the check.
- Engineering diagrams are maintainable HTML/CSS flows with descriptive conditions/messages,
  not a Mermaid runtime or interactive graph editor.
- Dental/model ownership, static transforms, UV/topology calibration, existing storage quotas
  and world-space custom point limitations remain documented behavior of the original app.
  Software fixtures and documentation are not clinical validation.

## K. Maintenance

See [DEVELOPER_DOCUMENTATION.md](DEVELOPER_DOCUMENTATION.md) and `/docs/maintenance` for the full
workflow. Add/update typed content, keep stable page/section IDs, regenerate API/source/example
snapshots after relevant source edits, review curated behavior/method notes, type-check the
integration examples, and run docs/unit/asset/bundle/browser checks. Navigation and search derive
from the same catalog. Preserve existing persistence keys and asset calibration assumptions
when changing source; document migrations explicitly if those contracts ever change.
