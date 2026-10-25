import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

const root = path.resolve(import.meta.dirname, '..');
const publicDir = path.join(root, 'public');
const catalog = fs.readFileSync(path.join(root, 'src/app/core/services/anatomy.service.ts'), 'utf8');
const paths = [...catalog.matchAll(/^\s*(?:image|model):\s*'([^']+)'/gm)].map(match => match[1]);
function checkCase(asset) {
  let current = publicDir;
  for (const part of asset.replace(/^\//, '').split('/')) {
    assert(fs.readdirSync(current).includes(part), `Missing or wrong-case asset: ${asset}`);
    current = path.join(current, part);
  }
}
paths.forEach(checkCase);
const mtl = fs.readFileSync(path.join(publicDir, 'models/teeth.mtl'), 'utf8');
for (const match of mtl.matchAll(/^\s*map_\S+\s+(?:-bm\s+\S+\s+)?(.+)$/gm)) {
  checkCase(`/models/${match[1].trim()}`);
}
const obj = new OBJLoader().parse(fs.readFileSync(path.join(publicDir, 'models/teeth.OBJ'), 'utf8'));
const meshes = [];
const glbMetadata = fs.readdirSync(path.join(publicDir, 'models')).filter(file => /\.glb$/i.test(file)).map(file => {
  const buffer = fs.readFileSync(path.join(publicDir, 'models', file));
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + buffer.readUInt32LE(12)));
  return { file, meshes: json.meshes?.length ?? 0, animations: json.animations?.length ?? 0,
    skins: json.skins?.length ?? 0, extensions: json.extensionsUsed ?? [] };
});
obj.traverse(mesh => {
  if (!mesh.isMesh) return;
  const { position, normal, uv } = mesh.geometry.attributes;
  assert(position && normal && uv);
  const dental = ['Group1014', 'Group1059'].includes(mesh.name);
  if (dental) assert.equal(position.count % 6, 0, 'Dental faces must form paired triangles');
  for (let i = 0; dental && i < position.count; i += 6) {
    for (const attr of [position, normal, uv]) {
      for (let axis = 0; axis < attr.itemSize; axis++) {
        assert.equal(attr.array[i * attr.itemSize + axis], attr.array[(i + 3) * attr.itemSize + axis], `${mesh.name} quad ${i / 6} ${attr === position ? 'position' : attr === normal ? 'normal' : 'uv'} A`);
        assert.equal(attr.array[(i + 2) * attr.itemSize + axis], attr.array[(i + 4) * attr.itemSize + axis], `${mesh.name} quad ${i / 6} ${attr === position ? 'position' : attr === normal ? 'normal' : 'uv'} C`);
      }
    }
  }
  mesh.geometry.computeBoundingBox();
  meshes.push({ name: mesh.name, vertices: position.count, attributes: Object.keys(mesh.geometry.attributes),
    groups: mesh.geometry.groups, bounds: mesh.geometry.boundingBox });
});
assert.equal(meshes.filter(mesh => ['Group1014', 'Group1059'].includes(mesh.name)).length, 2);
console.log(JSON.stringify({ catalogPathsChecked: paths.length, dentalMeshes: meshes, glbMetadata,
  unusedModels: fs.readdirSync(path.join(publicDir, 'models')).filter(file => /\.glb$/i.test(file) && !paths.includes(`/models/${file}`)) }, null, 2));
