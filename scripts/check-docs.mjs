import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
// Only the documentation content graph is evaluated. No Angular or engine modules are loaded.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const { DOC_PAGES, DOC_CATEGORIES, searchableText, searchPages } = require('../src/app/features/docs/docs-content.ts');
const { API_SYMBOLS } = require('../src/app/features/docs/content/api.generated.ts');
const { API_BEHAVIOR, METHOD_NOTES } = require('../src/app/features/docs/content/api.behavior.ts');
const required = ['','getting-started','architecture','project-structure','angular-foundation','data-models','services','organ-viewer','threejs-engine','model-loading','geometry','dental-system','dental-algorithms','hotspots','raycasting','camera-controls','screenshots','persistence','performance','testing','api-reference','integration','troubleshooting','glossary'];
const pages = new Map(DOC_PAGES.map(page => [page.id, page]));
assert.equal(pages.size, DOC_PAGES.length, 'Duplicate documentation route IDs');
for (const id of required) assert(pages.has(id), `Missing required page: ${id}`);
assert.equal(new Set(API_SYMBOLS.map(symbol => symbol.id)).size, API_SYMBOLS.length, 'Duplicate API IDs');
const names = new Set(API_SYMBOLS.map(symbol => symbol.name));
let links = 0;
let diagrams = 0;
for (const page of DOC_PAGES) {
  assert(page.title.trim() && page.description.trim() && DOC_CATEGORIES.includes(page.category), `Missing metadata: ${page.id}`);
  assert(page.sections.length, `No sections: ${page.id}`);
  const ids = new Set(page.sections.map(section => section.id));
  assert.equal(ids.size, page.sections.length, `Duplicate headings: ${page.id}`);
  assert(searchableText(page).includes(page.title.toLowerCase()), `Missing search index: ${page.id}`);
  for (const source of page.sources) assert(fs.existsSync(path.join(root, source)), `Unresolved source ${source}`);
  for (const section of page.sections) {
    assert(section.id && section.title && section.blocks.length, `Empty section: ${page.id}`);
    for (const block of section.blocks) {
      if (block.kind === 'api') assert(names.has(block.symbol), `Missing API symbol ${block.symbol}`);
      if (block.kind === 'diagram') { assert(block.nodes.length && block.description, `Empty diagram in ${page.id}`); diagrams++; }
      if (block.kind === 'links') for (const link of block.links) {
        const [id, fragment] = link.page.split('#');
        const target = pages.get(id);
        assert(target, `Broken docs link ${page.id} → ${link.page}`);
        if (fragment) assert(target.sections.some(section => section.id === fragment), `Broken fragment: ${link.page}`);
        links++;
      }
    }
  }
}
for (const symbol of API_SYMBOLS) {
  assert(fs.existsSync(path.join(root, symbol.path)), `Missing API source ${symbol.path}`);
  assert(pages.has(`api-reference/${symbol.id}`), `No API page for ${symbol.name}`);
  if (symbol.kind === 'function' || symbol.kind === 'class' && !symbol.name.endsWith('Component')) {
    assert(API_BEHAVIOR[symbol.name], `Missing curated API behavior for ${symbol.name}`);
  }
  for (const member of symbol.members.filter(member => member.visibility === 'public' && member.name !== 'constructor' && /^[\s\S]*\)\s*:\s*[^=]+$/.test(member.signature))) {
    assert(METHOD_NOTES[`${symbol.name}.${member.name}`], `Missing method explanation: ${symbol.name}.${member.name}`);
  }
}
assert(searchPages('zzzz-no-matching-guide').length === 0, 'Empty search result broken');
assert(searchPages('Meshopt').some(page => page.id === 'model-loading'), 'Content search missing');
assert(searchPages('ModelLoader').some(page => page.id === 'api-reference/model-loader'), 'API search missing');
execFileSync(process.execPath, [path.join(root, 'scripts/generate-docs-api.mjs'), '--check'], { cwd: root, stdio: 'inherit' });
console.log(JSON.stringify({ pages: pages.size, requiredTopics: required.length, exportedSymbols: names.size, checkedLinks: links, diagrams, categories: DOC_CATEGORIES.length }, null, 2));
