# Documentation maintenance

The application serves its developer documentation at `/docs`. `/` still redirects to `/anatomy`.
The existing viewer links to docs from the desktop list and compact mobile selector; the docs
header links back to the viewer. No hosting registration or deployment is part of this change.

## Content and routing

`src/app/app.routes.ts` dynamically imports `features/docs/docs.routes.ts`. That route collection
mounts `DocsLayoutComponent`, resolves known page IDs through `DocsPageComponent`, and lazily
loads `DocsSourceComponent` for `/docs/source/:sourceId`. Unknown pages have a recovery view.

`docs.models.ts` defines typed pages, sections and block variants. Curated content lives in:

- `content/foundation.pages.ts`: home, setup, architecture, tree, Angular, data and services.
- `content/engine.pages.ts`: viewer, Three.js, loading, geometry, rays and camera.
- `content/dental.pages.ts`: calibrated model behavior and detailed algorithms.
- `content/state.pages.ts`: hotspots, capture, storage and performance.
- `content/engineering.pages.ts`: testing, diagnosis, glossary and maintenance.
- `content/integration.page.ts`: seven scenarios and compiled source examples.
- `content/api.pages.ts`: API pages built from declarations and curated behavior.

Add a `page(id, title, category, description, sourcePaths, ...sections)` to the appropriate array.
If introducing a new content file, import its array in `docs-content.ts`. Sidebar, search,
breadcrumbs and previous/next navigation derive from that catalog. `DOC_CATEGORIES` determines
category ordering. The sidebar shows top-level pages and three explicit nested API shortcuts;
the API index links every exported symbol.

Use stable section IDs. `links([label, pageId])` targets pages; `pageId#sectionId` also supports a
fragment. `code()` supports a language and optional filename. `diagram()` uses accessible local
HTML/CSS steps with descriptive captions; branch conditions and messages remain maintainable
text. The renderer uses Angular interpolation and never inserts unsanitized HTML.

## Generated references

```sh
node scripts/generate-docs-api.mjs
node scripts/generate-docs-api.mjs --check
node scripts/check-docs.mjs
```

Generation scans production TypeScript under `src/app` plus `main.ts`, excluding docs, tests
and fixtures. It emits exact AST-based declarations and class members, paths/lines, full
source snapshots, import metadata and SHA256 fingerprints. It never evaluates source modules.
The source corpus is a separate lazy chunk. API declarations are strings and cannot initialize
WebGL. Type re-exports are documented at their defining modules.

Generated files are `api.generated.ts`, `sources.generated.ts`, `examples.generated.ts` and
`version.generated.ts`. Commit them with the relevant source/content updates. Version metadata
records the local HEAD baseline at generation; file fingerprints capture working-tree content.
Freshness checks deliberately do not compare the informational baseline to current HEAD,
so committing generated files does not invalidate the check. Regeneration refreshes the label.
No Git commit is created by the generator.

Add or update `API_BEHAVIOR` in `api.behavior.ts` for significant classes/functions. Describe
parameters, results, failure behavior, mutation/ownership, dependencies, reuse boundary and a
usage example. Add `METHOD_NOTES` for public methods. Interfaces and constants need semantic
updates in the data-model/conceptual guides. Private members remain browsable implementation
details, not documented reusable contracts. Regeneration cannot replace semantic review.

## Verified integration examples

Edit `docs/examples/integration.examples.ts`, then run:

```sh
npx tsc --noEmit -p docs/tsconfig.examples.json
node scripts/generate-docs-api.mjs
```

These parameterized examples use actual constructors/functions and imports. Their extracted
text appears in the portal without executing the imported viewer/Three.js code there. Adapt
paths when copying files to a host project. Every scenario explains dependencies/assets,
initialization, cleanup and model-specific limits. Do not call the prepared dental pipeline
twice on an already subdivided model, or present its calibration as a generic tooth detector.

## Validation

```sh
npm test -- --watch=false --browsers=ChromeHeadless
npx tsc --noEmit -p tsconfig.app.json
npx tsc --noEmit -p tsconfig.spec.json
npx tsc --noEmit -p docs/tsconfig.examples.json
node scripts/check-docs.mjs
node scripts/check-assets.mjs
npm run build -- --configuration production --stats-json
node scripts/check-bundles.mjs
```

With `npm start` running separately:

```sh
node scripts/browser-smoke.mjs
node scripts/docs-browser-smoke.mjs
```

Both CDP browser scripts use Node's global `WebSocket`/`fetch`, installed Chrome, isolated
temporary profiles and local result directories. `CHROME_BIN` overrides Chrome's Windows
default path and `ANATOMY_URL` overrides `http://127.0.0.1:4200`. The viewer script requires a
development build because it inspects Angular components. Docs checks instrument canvas
contexts and network requests before loading the first page, then cover direct routes,
search/keyboard, TOC, source reload, theme, history, mobile drawer and viewer transitions.

Integrity checks enforce required topics, unique page/heading/API IDs, metadata, content links,
source paths, API existence, method notes, search coverage and snapshot freshness. Bundle
checks reject engine inputs in either the initial or documentation static import closure.
Keep source references and curated prose under review as behavior changes.

## Hosting and limits

Use an SPA navigation fallback to `index.html` for direct docs routes. Static assets must retain
their normal lookup behavior. Root-absolute catalog `/models` and `/anatomy` paths require
extra configuration/adaptation for subpath hosting; base href alone does not fix them.

The portal has no external search service, runtime Markdown engine, diagram CDN or additional
UI dependency. Token coloring is intentionally lightweight. HTML diagrams describe engineering
steps and conditions without a layout library. Browser validation in this change uses Chrome
headless; verify other browsers, assistive technologies and deployment rewrite rules in their
actual target environments.
