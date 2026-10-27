import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const stats = JSON.parse(fs.readFileSync(path.join(root, 'dist/anatomy-angular/stats.json'), 'utf8'));
const entries = Object.entries(stats.outputs);
const main = entries.find(([, output]) => output.entryPoint === 'src/main.ts');
assert(main, 'Main entry missing');
const initial = new Set();
function visit(name) {
  if (initial.has(name)) return;
  initial.add(name);
  for (const imported of stats.outputs[name]?.imports ?? []) {
    if (imported.kind !== 'dynamic-import' && !imported.external) visit(imported.path);
  }
}
const index = fs.readFileSync(path.join(root, 'dist/anatomy-angular/browser/index.html'), 'utf8');
for (const match of index.matchAll(/<script[^>]+src="([^"]+)"/g)) visit(match[1]);
const heavy = entries.filter(([, output]) => Object.keys(output.inputs).some(input =>
  /node_modules[\\/]three[\\/]|organ-viewer\.component|anatomy-page\.component/.test(input)));
assert(heavy.length > 0);
for (const [name] of heavy) assert(!initial.has(name), `Heavy code in initial chunk: ${name}`);
const docsEntries = entries.filter(([, output]) => /features[\\/]docs[\\/]docs\.routes\.ts$/.test(output.entryPoint ?? ''));
assert.equal(docsEntries.length, 1, 'Documentation lazy route entry missing');
const docsClosure = new Set();
function visitDocs(name) {
  if (docsClosure.has(name)) return;
  docsClosure.add(name);
  for (const imported of stats.outputs[name]?.imports ?? []) {
    if (imported.kind !== 'dynamic-import' && !imported.external) visitDocs(imported.path);
  }
}
visitDocs(docsEntries[0][0]);
for (const name of docsClosure) {
  assert(!initial.has(docsEntries[0][0]), 'Documentation is eagerly loaded');
  const inputs = Object.keys(stats.outputs[name]?.inputs ?? {});
  assert(!inputs.some(input => /node_modules[\\/]three(?:-mesh-bvh)?[\\/]|features[\\/]anatomy|core[\\/]services/.test(input)), `Engine dependency in docs closure: ${name}`);
}
const docsChunks = entries.filter(([, output]) => Object.keys(output.inputs).some(input => /features[\\/]docs[\\/]/.test(input)))
  .map(([name, output]) => ({ name, bytes: output.bytes }));
const viewerCss = entries.filter(([name]) => /organ-viewer\.component-.*\.css/.test(name)).map(([name, output]) => ({ name, bytes: output.bytes }));
console.log(JSON.stringify({ main: main[0], initialJavaScript: [...initial],
  heavyLazyChunks: heavy.map(([name, output]) => ({ name, bytes: output.bytes })), docsChunks, docsStaticClosure: [...docsClosure], viewerCss }, null, 2));
