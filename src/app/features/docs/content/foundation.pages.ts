import type { DocBlock, DocPage, DocSection } from '../docs.models';

export const text = (value: string): DocBlock => ({ kind: 'text', text: value });
export const code = (value: string, language = 'typescript', filename?: string): DocBlock => ({ kind: 'code', code: value.trim(), language, filename });
export const note = (title: string, value: string, tone: 'info' | 'warning' = 'info'): DocBlock => ({ kind: 'note', title, text: value, tone });
export const table = (columns: string[], rows: string[][]): DocBlock => ({ kind: 'table', columns, rows });
export const diagram = (title: string, description: string, nodes: string[]): DocBlock => ({ kind: 'diagram', title, description, nodes });
export const links = (...entries: [string, string][]): DocBlock => ({ kind: 'links', links: entries.map(([label, page]) => ({ label, page })) });
export const api = (symbol: string): DocBlock => ({ kind: 'api', symbol });
export const section = (id: string, title: string, ...blocks: DocBlock[]): DocSection => ({ id, title, blocks });
export const page = (id: string, title: string, category: string, description: string, sources: string[], ...sections: DocSection[]): DocPage => ({ id, title, category, description, sources, sections });

export const FOUNDATION_PAGES: DocPage[] = [
  page('', 'Anatomy Angular Developer Documentation', 'Start here',
    'A source-based engineering handbook for the Angular application, its Three.js engine, and the calibrated dental restoration pipeline.',
    ['src/main.ts', 'src/app/app.routes.ts', 'src/app/features/anatomy/organ-viewer/organ-viewer.component.ts'],
    section('overview', 'Explore the application',
      text('Anatomy Angular displays seven catalog entries: brain, heart, lungs, liver, two skeleton formats, and a 28-tooth dental model. Developers can inspect surfaces, create custom points, edit restoration zones, control the camera, and save annotated captures. The documentation explains software behavior and model calibration; it does not establish clinical accuracy.'),
      links(['Getting started', 'getting-started'], ['Architecture', 'architecture'], ['Three.js engine', 'threejs-engine'], ['Dental system', 'dental-system'], ['API reference', 'api-reference'], ['Integration handbook', 'integration'], ['Testing and troubleshooting', 'testing'])),
    section('stack', 'The current technology stack',
      table(['Package / tool', 'Declared version', 'Role'], [
        ['Angular standalone components', '^18.2.0', 'Router, dependency injection, signals, templates'],
        ['Angular CLI / build-angular', '^18.2.21', 'Development server, esbuild application builder, Karma'],
        ['TypeScript', '~5.5.2', 'Strict templates, strict types, ES2022'],
        ['Three.js / @types/three', '^0.185.1 / ^0.185.4', 'Scene graph, materials, loaders, WebGL'],
        ['three-mesh-bvh', '^0.9.15', 'Bounds trees and accelerated raycasting'],
        ['meshoptimizer', '^1.2.0', 'Declared dependency; ModelLoader imports the decoder bundled in Three.js'],
        ['RxJS / zone.js', '~7.8.0 / ~0.14.10', 'Angular runtime dependencies'],
        ['Tailwind / PostCSS', '^3.4.17 / ^8.5.26', 'Existing styling toolchain; docs use scoped CSS'],
      ]), text('These are package.json ranges, not a claim about the latest upstream releases. package-lock.json determines the installed dependency graph. No UI or search framework is needed by the documentation.')),
    section('quick-start', 'Run it locally', code('npm ci\nnpm start', 'shell'),
      text('Open /anatomy for the viewer and /docs for this handbook on the development server, normally http://localhost:4200. Open the source browser from any page to inspect a versioned snapshot of the actual implementation.')),
    section('system-map', 'System map',
      diagram('Two independent lazy features', 'The shell routes to either the anatomy feature or the documentation feature. Only anatomy imports rendering code.', ['main.ts → appConfig → AppComponent', 'Angular Router', '/anatomy → page → list / viewer / info → Three.js', '/docs → layout → curated pages / generated API / source snapshots']),
      text('Start with the architecture and component flow, then follow the engine or dental guides. API entries expose exact signatures and public members. Integration scenarios specify dependencies and cleanup so modules can be copied deliberately. Search indexes titles, descriptions, headings, tables, code examples, and API symbols.')),
    section('reuse-map', 'Choose a reuse boundary',
      table(['Boundary', 'Good entry point', 'What travels with it'], [
        ['Standalone Three.js logic', 'CameraController, PickingController', 'Three.js runtime; caller owns events and render loop'],
        ['Loading and ownership', 'ModelLoader + resource-disposer', 'Three.js example loaders; explicit owner of transferred objects'],
        ['Browser canvas', 'composeScreenshot', 'Canvas 2D environment; Hotspot2D as a type only'],
        ['Calibrated dental pipeline', 'dental-geometry + dental-color-renderer', 'Exact OBJ/MTL/textures, catalog, thresholds, domain adapter'],
        ['Full Angular UI', 'OrganViewerComponent', 'Core services/models, viewer modules, template, CSS, assets'],
      ])),
  ),
  page('getting-started', 'Getting started', 'Start here', 'Install the locked dependencies, run the existing scripts, and understand the verification environment.', ['src/main.ts'],
    section('prerequisites', 'Prerequisites and versions',
      text('Use npm with the committed package-lock.json. The installed Angular CLI declares Node ^18.19.1 || ^20.11.1 || >=22.0.0, and npm ^6.11.0 || ^7.5.6 || >=8.0.0 in node_modules/@angular/cli/package.json. This is the installed tool’s declared engine range; consult your organization’s supported Node policy separately. This checkout was inspected with Node v24.22.1. Chrome is needed for ChromeHeadless and the repository’s CDP smoke script.'),
      code('node --version\nnpm --version\nnpm ci\nnpm start', 'shell'),
      note('Installation', 'npm ci replaces node_modules with the lockfile graph. Stop running builds first. No environment file, API key, backend, or database is required for the existing viewer.')),
    section('commands', 'Actual project commands',
      table(['Command', 'Purpose / requirement'], [
        ['npm start', 'ng serve; normally http://localhost:4200; / redirects to /anatomy'],
        ['npm run build -- --configuration production', 'Production output in dist/anatomy-angular/browser'],
        ['npm run watch', 'Development build in watch mode'],
        ['npm test -- --watch=false --browsers=ChromeHeadless', 'Karma/Jasmine in installed Chrome'],
        ['npx tsc --noEmit -p tsconfig.app.json', 'Application TypeScript check'],
        ['npx tsc --noEmit -p tsconfig.spec.json', 'Test TypeScript check'],
        ['node scripts/check-assets.mjs', 'Case-sensitive catalog paths, MTL textures, OBJ layout, GLB metadata'],
        ['npm run build -- --configuration production --stats-json', 'Emit esbuild stats for the bundle check'],
        ['node scripts/check-bundles.mjs', 'Check initial and docs dependency closures exclude the engine'],
        ['node scripts/browser-smoke.mjs', 'Real viewer interactions; run development server separately'],
        ['node scripts/docs-browser-smoke.mjs', 'Documentation routing, search, mobile and WebGL isolation'],
        ['node scripts/generate-docs-api.mjs', 'Refresh API declarations and browsable source snapshots'],
        ['node scripts/check-docs.mjs', 'Check content links, navigation, API references and generated freshness'],
      ]), text('Only ng, start, build, watch, and test are npm scripts. The node commands invoke repository files directly; they are not npm scripts.')),
    section('browser-environment', 'Browser verification environment',
      code("$env:CHROME_BIN = 'C:/Program Files/Google/Chrome/Application/chrome.exe'\n$env:ANATOMY_URL = 'http://127.0.0.1:4200'\nnode scripts/browser-smoke.mjs\nnode scripts/docs-browser-smoke.mjs", 'shell'),
      text('The smoke scripts use Node’s built-in WebSocket and fetch APIs plus Chrome’s DevTools protocol, without Playwright. Use a Node version exposing these globals. CHROME_BIN overrides the executable; ANATOMY_URL overrides the server URL. The existing viewer script launches headless Chrome with SwiftShader, uses Angular debug APIs, and therefore needs a development build. Both scripts create isolated temporary profiles and retain result artifacts.')),
    section('hosting', 'Deep links and assets',
      text('Serve the application as an SPA: unknown navigation URLs such as /docs/model-loading must fall back to index.html. Actual assets and missing asset paths must retain normal static-file behavior. For nginx, use try_files $uri $uri/ /index.html in the application location. The Angular development server supplies the history fallback. The catalog uses root-absolute /models and /anatomy paths, so hosting under a subpath requires explicit asset-path adaptation; changing base href alone is insufficient.'),
      note('Connection refused', 'Start npm start in a separate terminal and use the printed Local URL. A closed port is a server problem, while an HTTP 404 for /models/teeth.OBJ is an asset-path problem.', 'warning')),
    section('next', 'First source files to read', links(['Architecture', 'architecture'], ['Angular foundation', 'angular-foundation'], ['Project structure', 'project-structure'], ['Troubleshooting', 'troubleshooting'])),
  ),
  page('architecture', 'Application architecture', 'Start here', 'Trace browser startup, state ownership, rendering, and teardown across the actual module boundaries.',
    ['src/main.ts', 'src/app/app.config.ts', 'src/app/app.routes.ts', 'src/app/features/anatomy/anatomy-page/anatomy-page.component.ts', 'src/app/features/anatomy/organ-viewer/organ-viewer.component.ts'],
    section('startup', 'Startup and lazy routing',
      diagram('Browser startup', 'bootstrapApplication creates the standalone shell and providers. Route loading selects the active feature.', ['main.ts', 'bootstrapApplication(AppComponent, appConfig)', 'provideZoneChangeDetection({eventCoalescing: true}) + provideRouter(routes)', 'AppComponent → router-outlet', '/anatomy lazy component OR /docs lazy route collection']),
      text('main.ts logs bootstrap failures. AppComponent holds a title field and a router outlet; it owns no scene. app.config.ts provides event-coalesced zone change detection and the router. The empty path redirects to anatomy with pathMatch full. The anatomy route lazily imports AnatomyPageComponent; docs uses loadChildren. The documentation has no runtime import from anatomy, core services, Three.js, or loaders.')),
    section('components', 'Component inputs and outputs',
      diagram('Selection and presentation', 'The page owns selectedOrgan. The list emits selection; the viewer and info receive the same Organ object.', ['AnatomyService.getOrgans() → AnatomyPageComponent.organs', 'OrganList [selectedOrgan] → organSelected(Organ)', 'AnatomyPage.selectOrgan() → selectedOrgan signal', 'OrganViewer [organ] → effect → loadModel', 'OrganInfo [organ] + screenshot service signal → metadata and captures']),
      text('The selected organ is an object reference, not a copied immutable DTO. getOrgans returns the service array. The viewer merges custom hotspots into organ.hotspots and edits point values; OrganInfo reads this shared object. Moving selection into the loader would couple scene resources to Angular state and make list/info synchronization harder.')),
    section('rendering', 'Rendering orchestration',
      diagram('A single frame owner', 'Only OrganViewer schedules frames. Helpers are called synchronously or report loader callbacks.', ['View init → scene / camera / renderer / controls', 'ModelLoader → prepareModel → scene.add → freezeModel', 'Camera / pointer / texture / color update → requestRender', 'scheduleFrame → animate → controls.update → renderer.render', 'updateHotspots → cached projection → DOM overlay']),
      text('Scene creation, canvas ownership, ResizeObserver, effects, state editing, persistence feedback and frame scheduling remain in OrganViewer. Scene helpers never start their own animation loop. NgZone.runOutsideAngular keeps frequent rendering work outside zone-driven application checks; state updates that require UI changes use signals and, for pointer selection, ngZone.run.')),
    section('ownership', 'Ownership and dependency direction',
      table(['Owner', 'Owned state / resource', 'Release or handoff'], [
        ['Root services', 'Catalog, calibrated tooth data, stored screenshot signal', 'Angular injector lifetime; storage persists beyond route changes'],
        ['ModelLoader', 'Request generation, in-flight result validity, untransferred materials', 'Current loaded callback transfers object; stale objects are disposed'],
        ['OrganViewer', 'Attached model, renderer, controls, listeners, RAF and timers', 'Model replacement / ngOnDestroy'],
        ['HotspotProjection', 'World anchors, occlusion and DOM caches', 'remove or clear'],
        ['DentalTextureSampler', 'WeakMap image-to-CPU sample cache', 'Image-key reachability; no WebGL resource ownership'],
        ['Caller of subdivideGeometry', 'Input and returned final geometry', 'Dispose original when replaced and final on teardown'],
      ]), diagram('Resource handoff', 'A result is owned either by the loader before transfer or by the viewer afterwards.', ['Network / parsers → ModelLoader owns pending work', 'Stale success → disposeModel(result)', 'Current success → viewer owns model', 'Replacement → scene.remove → disposeModel', 'Destroy → loader.dispose → controls.dispose → model / renderer release'])),
    section('cleanup', 'Cleanup order matters',
      text('ngOnDestroy marks the viewer destroyed, cancels RAF and pending pointer work, clears screenshot timers, invalidates loader generations, disconnects ResizeObserver, removes pointer and controls listeners, disposes controls and the attached model, clears projection caches, disposes the renderer, forces context loss, and removes its canvas. Ignoring late callbacks prevents dead views being mutated. It does not abort HTTP transfers.'),
      links(['Model loading and ownership', 'model-loading'], ['Performance and memory', 'performance'], ['Integration boundaries', 'integration'])),
  ),
  page('project-structure', 'Project structure', 'Start here', 'A map of the current refactored source tree and its dependency direction.',
    ['src/app/app.routes.ts', 'src/app/features/anatomy/organ-viewer/organ-viewer.component.ts'],
    section('tree', 'Repository map', code(`src/
  main.ts
  styles.css                       # existing global tokens
  app/
    app.component.{ts,html,css}     # router shell
    app.config.ts / app.routes.ts
    core/
      models/                      # organ, dental, storage guards
      services/                    # catalog, dental, hotspots, captures
    features/
      anatomy/
        anatomy-page/ organ-list/ organ-info/
        organ-viewer/
          camera/camera-controller.ts
          interactions/picking-controller.ts
          scene/model-loader.ts
          scene/model-preparation.ts
          scene/resource-disposer.ts
          dental/dental-geometry.ts
          dental/dental-color-renderer.ts
          dental/dental-texture.ts
          hotspots/hotspot-projection.ts
          screenshots/screenshot-capture.ts
          testing/                 # actual-asset fixtures and golden hashes
      docs/                        # lazy layout, content, API and source browser
public/models/                     # GLB, OBJ, MTL, 3DS and Texture/
public/anatomy/                    # catalog thumbnails
scripts/                           # assets, bundles, browser and docs checks
docs/                              # historical audits and maintenance guide`, 'text')),
    section('responsibilities', 'Folder ownership and reuse',
      table(['Folder', 'Owns', 'Dependencies and reuse'], [
        ['core/models', 'Domain contracts and storage guards', 'TypeScript; dental constants are calibrated to the bundled asset'],
        ['core/services', 'Catalog, classification, browser persistence', 'Angular injection and model contracts; storage guards reusable independently'],
        ['anatomy-page / organ-list / organ-info', 'Selection, navigation, catalog and capture UI', 'Angular; services and models; no scene lifetime ownership'],
        ['organ-viewer', 'Scene lifetime and user interaction', 'Angular, Three.js, all viewer helper directories, core services'],
        ['scene', 'Format loading, preparation and GPU cleanup', 'Three.js, BVH, dental subdivision; independent of Angular runtime'],
        ['camera / interactions', 'Camera math and surface intersections', 'Three.js; arbitrary compatible scenes'],
        ['dental', 'Quad subdivision, enamel bounds, texture masking, colors', 'Three.js; type-only DentalService references; exact model conventions'],
        ['hotspots', 'World-to-screen projection and marker caches', 'Three.js, browser DOM; type-only Hotspot import'],
        ['screenshots', 'Canvas composition', 'Browser canvas; type-only Hotspot2D import'],
        ['features/docs', 'Curated documentation, generated declarations and source snapshots', 'Angular Router and browser UI; no engine initialization'],
        ['public', 'Models, textures, thumbnails', 'Copied unchanged by Angular assets configuration'],
        ['scripts / docs', 'Verification and engineering evidence', 'Node/TypeScript for checks; Markdown reports are historical'],
      ])),
    section('direction', 'Dependency direction',
      diagram('No reverse scene ownership', 'UI orchestrates services and helper modules. Helpers receive data and callbacks rather than injecting Angular.', ['App shell → lazy features', 'Anatomy UI → core services → core models', 'OrganViewer → Three.js helpers → Three.js / browser', 'Dental helpers → structural Pick<DentalService, ...> types', 'Docs UI → content and generated strings only']),
      note('Type-only imports', 'Dental helpers name DentalService in Pick types, but import type erases that dependency at runtime. A plain object implementing those exact methods can satisfy the contract in a non-Angular application.')),
  ),
  page('angular-foundation', 'Angular foundation', 'Angular application', 'Standalone components, signals, input/output contracts, effects, and lifecycle ownership in this application.',
    ['src/app/app.component.ts', 'src/app/app.config.ts', 'src/app/app.routes.ts', 'src/app/features/anatomy/anatomy-page/anatomy-page.component.ts', 'src/app/features/anatomy/organ-list/organ-list.component.ts', 'src/app/features/anatomy/organ-info/organ-info.component.ts'],
    section('shell', 'AppComponent, configuration and routes',
      text('AppComponent imports RouterOutlet and renders only <router-outlet />. Its title is anatomy-angular; there are no inputs, outputs, injected services, computed values, effects or lifecycle hooks. appConfig is an ApplicationConfig with zone event coalescing and provideRouter(routes). These are shell responsibilities: importing OrganViewer here would pull scene code into the initial graph.'), api('AppComponent'), api('appConfig'), api('routes')),
    section('page', 'AnatomyPageComponent',
      text('The standalone page injects AnatomyService, exposes organs = getOrgans(), and initializes selectedOrgan to organs[0]. selectOrgan(organ: Organ): void writes the signal; selectOrganById(id: string): void finds a catalog item and ignores unknown IDs. No inputs, outputs, computed values, effects, or lifecycle hooks are declared. Its template binds list output and passes the selected reference to viewer and info; a mobile select calls selectOrganById. The nonempty built-in catalog is an assumption of initialization.'), api('AnatomyPageComponent')),
    section('list', 'OrganListComponent',
      text('The list injects AnatomyService and reads the catalog. selectedOrgan = input.required<Organ>() is a required input signal. organSelected = output<Organ>() emits from selectOrgan. searchTerm starts empty; updateSearchTerm writes it. filteredOrgans is computed: trim, lowercase, return the catalog for an empty query, otherwise match organ.name only. The template renders thumbnails, active selection and an empty-result message. No lifecycle hooks or effects exist; selection ownership stays in the parent.'),
      code(`<app-organ-list
  [selectedOrgan]="selectedOrgan()"
  (organSelected)="selectOrgan($event)"
/>
<app-organ-viewer [organ]="selectedOrgan()" />
<app-organ-info [organ]="selectedOrgan()" />`, 'html', 'anatomy-page.component.html'), api('OrganListComponent')),
    section('info', 'OrganInfoComponent',
      text('The info component injects OrganScreenshotService and imports DatePipe. organ is required; screenshotError is a nullable string signal. organScreenshots is computed from both service.screenshots() and organ().id. hasNoRecordedData checks optional hotspot values; downloadScreenshot creates an anchor with WebP/PNG extension; deleteScreenshot sets an error when persistence fails. There are no outputs, effects or lifecycle hooks. The template owns overview, recorded values, formatted capture time, download and delete controls. The service read-only signal makes successful capture/deletion reactive.'), api('OrganInfoComponent')),
    section('signals', 'Reactive data and DI boundaries',
      text('input.required prevents accidental unbound contracts at compile time but does not validate external JSON. computed derives list and screenshot data; it is not used in OrganViewer. effect in the viewer observes organ changes and auto-rotation interactions; untracked wraps loading to avoid subscribing to unrelated editing signals. Services use providedIn root. NgZone is injected for rendering boundaries. Creating DentalService with new outside an injection context fails because its field initializer calls inject(PLATFORM_ID).'),
      note('Mutable records', 'Replace Maps and Sets when updating their signals, as the viewer does for toothColors and selectedParts. Merely mutating a Map entry does not notify signal consumers. Shared Organ.hotspots is deliberately mutated by the current UI, so changing that ownership requires coordinating OrganInfo too.', 'warning')),
    section('viewer-contract', 'OrganViewer contract', links(['Viewer component and lifecycle', 'organ-viewer'], ['All component declarations', 'api-reference'], ['Embedding the viewer', 'integration'])),
  ),
  page('data-models', 'Core data models', 'Angular application', 'Exact source declarations, field meanings, producers, consumers, defaults, and persistence contracts.',
    ['src/app/core/models/organ.model.ts', 'src/app/core/models/dental.model.ts', 'src/app/core/services/dental.service.ts', 'src/app/features/anatomy/organ-viewer/dental/dental-color-renderer.ts', 'src/app/features/anatomy/organ-viewer/dental/dental-texture.ts', 'src/app/features/anatomy/organ-viewer/scene/model-loader.ts'],
    section('organ', 'Organ and Hotspot', api('Organ'), api('Hotspot'),
      table(['Field', 'Meaning / constraints', 'Producer → consumer'], [
        ['Organ.id / name / description / function', 'Required strings; id is the storage and selection identity', 'AnatomyService → page, list, viewer, info'],
        ['Organ.image / model', 'Required URL strings; root-absolute catalog paths preserve case', 'Catalog → thumbnail / ModelLoader'],
        ['Organ.hotspots?', 'Optional array; viewer defaults to [] and merges stored custom points', 'Catalog + storage → projection and info'],
        ['Organ.clickableMeshes?', 'Optional names; nonempty becomes a Set, absent/empty means no filter', 'Catalog → picking'],
        ['Hotspot.id / name / description', 'Required; persistence requires nonempty id/name, description string', 'Catalog or placement form → DOM markers / storage'],
        ['Hotspot.position', 'Required finite xyz; built-in = model local, custom = world space', 'Author or surface hit → projection'],
        ['Hotspot.normal?', 'Optional finite nonzero xyz for storage; fallback outward normal in projection', 'Author or transformed face normal → facing test'],
        ['Hotspot.value?', 'Optional finite numeric recorded value; legacy null normalized to undefined', 'Form → recorded data; custom values persist'],
        ['Hotspot.isCustom?', 'Only literal true is persisted by hotspot storage', 'Placement → save/load and world-space branch'],
      ]), code(`const point: Hotspot = {
  id: 'custom-example', name: 'Surface point', description: 'Developer annotation',
  position: { x: 0, y: 0.4, z: 0.8 }, normal: { x: 0, y: 0, z: 1 },
  isCustom: true, value: 42,
};`, 'typescript')),
    section('screenshot', 'OrganScreenshot', api('OrganScreenshot'),
      text('id is generated by the service; organId and organName identify the capture context; imageDataUrl holds base64 WebP or PNG; capturedAt is an ISO timestamp; focusedPart is optional descriptive text. camera.position and camera.target are required finite xyz records, rounded to three decimals by the viewer. They are metadata, not an implemented camera restore command. Stored records are validated on load and rendered by OrganInfo.'),
      code(`const capture: Omit<OrganScreenshot, 'id' | 'capturedAt'> = {
  organId: 'brain', organName: 'Brain',
  imageDataUrl: canvas.toDataURL('image/png'),
  camera: { position: { x: 0, y: 0, z: 4 }, target: { x: 0, y: 0, z: 0 } },
};`)),
    section('tooth', 'Dental catalog, states and shades', api('DivisionMode'), api('ToothQuadrant'), api('ToothExtents'), api('ToothCatalogEntry'), api('ToothData'), api('ToothState'), api('DentalShadePreset'),
      table(['Type / field', 'Meaning and defaults'], [
        ['DivisionMode', 'Numeric union 1 | 2 | 3 | 4; viewer starts at 4; missing persisted mode defaults to 4'],
        ['ToothQuadrant', 'q1, q2, q3, q4; geometric top-left, top-right, bottom-left, bottom-right'],
        ['ToothExtents.width / height / depth?', 'Width and height required, optional depth; calibrated width uses arch-tangent bounds'],
        ['ToothCatalogEntry.number / name / isUpper / type', 'Required identity; type is Incisor, Canine, Premolar or Molar'],
        ['ToothCatalogEntry.center? / extents?', 'Optional model-local geometry; absent wisdom centers exclude them from MODEL_TEETH'],
        ['ToothData.center', 'Required xyz; produced by filtering catalog, then calibrated by measured enamel bounds'],
        ['ToothState.divisionMode / zones', 'Required numeric mode and string color record; persisted allowed keys are q1..q4, top, middle, bottom'],
        ['DentalShadePreset.name / code / hex', 'All required strings; display labels and configured colors, not a clinical colorimetry standard'],
      ]),
      text('TEETH_CATALOG contains 32 Universal entries. MODEL_TEETH filters entries with centers and contains 28; #1, #16, #17, #32 have no geometry. DENTAL_SHADE_PRESETS is the actual UI palette: some colors are intentional vivid highlights (A1 is #31fe08 and Crown is #ff0000). Preserve those configured values when documenting behavior.'),
      code(`const state: ToothState = {
  divisionMode: 3,
  zones: { top: '#4A9CFF', middle: '#EFEAD8', bottom: '#FAF9F5' },
};`)),
    section('bounds', 'ToothEnamelBounds', api('ToothEnamelBounds'),
      text('All fields are required. toothNumber associates the measurement. minX/maxX, minY/maxY, minZ/maxZ bound accepted quad centers in original mesh coordinates. midX and midZ are bbox midpoints; midY blends bbox midpoint and sample mean. minH/maxH/midH describe the arch-tangent horizontal projection, with the same midpoint/mean blend. minU/maxU/midU describe sampled UV u, with finite fallbacks 0 and 1. archTangent is a unit xz vector from DentalService. anchor is {x: midX, y: midY, z: midZ}. computeToothBounds produces these values; segmentation and component calibration consume them. Bounds are recomputed, not persisted.')),
    section('viewer-types', 'Viewer contracts', api('ModelLoadCallbacks'), api('CameraControlAction'), api('Hotspot2D'), api('TextureSample'), api('TextureImage'), api('DentalColorState'),
      text('ModelLoadCallbacks separates geometry transfer, texture readiness, error and unsupported format handling. CameraControlAction enumerates up/down/left/right/zoomIn/zoomOut. Hotspot2D wraps a Hotspot with CSS-pixel x/y and visibility. TextureSample stores RGBA bytes and dimensions; TextureImage intersects CanvasImageSource with dimensions. DentalColorState receives a nullable sample, read-only tooth state/bounds maps, nullable selected tooth, grid preference and active mode. These are transient rendering contracts; none is a localStorage record. CameraControls and HotspotAnchor are deliberately private helper types, visible in source browsing.')),
    section('validation', 'Compile-time types and runtime validation',
      text('Interfaces disappear at runtime. JSON.parse returns untrusted values, so storage-validation guards check object shape, finite vectors and #RGB/#RRGGBB strings. Service validators reject malformed data, deduplicate IDs on load, and return safe empty/default state on errors. Rendering functions assume compatible geometry and do not perform general-purpose schema validation.'), links(['Persistence validation', 'persistence'], ['Generated type reference', 'api-reference'])),
  ),
  page('services', 'Core services', 'Angular application', 'State ownership, public methods, storage behavior, calculations, and integration constraints for all four root services.',
    ['src/app/core/services/anatomy.service.ts', 'src/app/core/services/dental.service.ts', 'src/app/core/services/hotspot-storage.service.ts', 'src/app/core/services/organ-screenshot.service.ts', 'src/app/core/models/storage-validation.ts'],
    section('catalog', 'AnatomyService', api('AnatomyService'),
      text('providedIn root. getOrgans(): Organ[] returns the same private seven-entry catalog array, including relative metadata and root-absolute asset paths. No HTTP request, cloning, persistence, error fallback or reactive signal is involved. The page assumes at least one entry. Reusing the catalog means copying public assets with exact names and case.')),
    section('dental', 'DentalService calculation API', api('DentalService'),
      table(['Method family', 'Behavior, units and failure handling'], [
        ['isGumPixel / isEnamelPixel', '8-bit RGB classification: (r-g)>=38 and (r-b)>=48; enamel is the inverse'],
        ['identifyTooth', 'Local xyz, upper flag and optional raw UV u → a physical ToothData, with central fallback'],
        ['getArchTangent / projectHorizontal', 'Unit arch axis in xz and scalar projection; bounds tangent takes precedence'],
        ['calibrateToothCenter', 'Mutates a known physical tooth center and optional width/height; unknown number is ignored'],
        ['getQuadrant / getThird', 'q1..q4 or top/middle/bottom; use dynamic bounds when supplied'],
        ['isNearBoundary', 'Grid predicate; default geometric epsilon 0.14, UV span-based threshold when available'],
        ['getTooth / getAllTeeth', 'Lookup may return undefined; list contains only physical teeth and exposes mutable records'],
        ['hexToRgb', 'Normalized [r,g,b], expands #RGB, invalid color → [1,1,1]'],
        ['saveToothStates / loadToothStates', 'Validated numeric-key record ↔ Map; save boolean, load empty on failure'],
        ['saveGridLinesPreference / loadGridLinesPreference', 'Boolean persistence; missing/invalid/SSR value defaults true'],
      ]), text('The service injects PLATFORM_ID for storage guards. Its geometric methods are synchronous and use model-specific crease constants. getTooth and getAllTeeth return the same objects that calibration mutates; cloning or sharing across differently calibrated viewers needs deliberate ownership. The structural Pick dependencies in the dental helper signatures allow a plain adapter without importing Angular at runtime.')),
    section('hotspots', 'HotspotStorageService', api('HotspotStorageService'),
      text('providedIn root. saveCustomHotspots(organId, hotspots) filters isCustom, validates every retained record, JSON serializes under anatomy_custom_hotspots_<organId>, and returns false for SSR, blank organId, malformed custom records or write failure. loadCustomHotspots returns valid records, preserves the first duplicate ID and normalizes legacy null values; errors yield []. clearCustomHotspots removes one key and logs exceptions; it returns void, so it does not provide positive write confirmation. Built-in values are not persisted by this service.')),
    section('screenshots', 'OrganScreenshotService', api('OrganScreenshotService'),
      text('providedIn root. A private writable signal initializes from storage; screenshots is its read-only projection. STORAGE_KEY is exactly ORIGAN-INFO. saveScreenshot takes Omit<OrganScreenshot, id | capturedAt>, creates those two fields, prepends, caps the next write at 12, persists first, and returns the record or null. getScreenshotsByOrgan filters current memory. deleteScreenshot and clearScreenshots return booleans and only update memory after successful persistence. Empty lists remove the key. Loading accepts an old single valid object or a valid-record array and deduplicates IDs. Save callers are typed but saveScreenshot does not itself validate the entry at runtime.')),
    section('guards', 'Shared storage guards', api('isRecord'), api('isFiniteVector'), api('isHexColor'),
      text('isRecord excludes null and arrays. isFiniteVector requires numeric finite x/y/z, rejecting NaN and Infinity. isHexColor accepts only #RGB or #RRGGBB, case-insensitive. These guards are framework-independent TypeScript. They do not certify domain correctness, normalize vectors, verify base64 decoding or validate clinical measurements.'), links(['Detailed persistence rules', 'persistence'], ['Dental algorithms', 'dental-algorithms'])),
  ),
];
