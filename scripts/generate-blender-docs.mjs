import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sourcePath = 'docs/DEVELOPER_DOCUMENTATION.md';
const heading = '# Extracting 3D Model Data Using Blender';
const slug = text => text.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-');

// Deliberately limited to the canonical tutorial's Markdown conventions. Conversion happens
// at generation time: the portal never fetches Markdown, evaluates code, or inserts raw HTML.
export function generateBlenderPage(root) {
  const source = fs.readFileSync(path.join(root, sourcePath), 'utf8').replaceAll('\r\n', '\n');
  assert.equal(source.split(heading).length, 2, 'Expected exactly one Blender tutorial heading');
  const lines = source.slice(source.indexOf(heading) + heading.length).trim().split('\n');
  const ids = new Set();
  const makeId = title => {
    const id = slug(title);
    assert(id && !ids.has(id), `Duplicate Blender heading: ${title}`);
    ids.add(id);
    return id;
  };
  const linkTarget = href => {
    if (/^https:\/\//.test(href)) return { href, external: true };
    if (href.startsWith('#')) return { href: '/docs/blender-data-extraction', fragment: href.slice(1), external: false };
    const [file, fragment] = href.split('#');
    const absolute = path.resolve(root, 'docs', file);
    const relative = path.relative(root, absolute).replaceAll('\\', '/');
    assert(relative.startsWith('src/app/') && relative.endsWith('.ts') && fs.existsSync(absolute), `Unsupported tutorial link: ${href}`);
    const id = relative.replace(/^src\//, '').replace(/\.ts$/, '').replaceAll('/', '--');
    return { href: `/docs/source/${id}`, ...(fragment ? { fragment } : {}), external: false };
  };
  const inline = text => {
    const result = [];
    const expression = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^\s)]+)\)/g;
    let start = 0;
    for (const match of text.matchAll(expression)) {
      if (match.index > start) result.push({ kind: 'text', text: text.slice(start, match.index) });
      if (match[1] !== undefined) result.push({ kind: 'code', text: match[1] });
      else if (match[2] !== undefined) result.push({ kind: 'strong', text: match[2] });
      else result.push({ kind: 'link', text: match[3], ...linkTarget(match[4]) });
      start = match.index + match[0].length;
    }
    if (start < text.length) result.push({ kind: 'text', text: text.slice(start) });
    return result;
  };
  const diagram = code => {
    const lines = code.trim().split('\n');
    assert.equal(lines.shift(), 'flowchart TD', 'Unsupported tutorial Mermaid graph');
    const labels = new Map();
    for (const line of lines) for (const match of line.matchAll(/(\w+)(?:\[([^\]]+)\]|\{([^}]+)\})/g)) labels.set(match[1], match[2] ?? match[3]);
    const nodes = lines.filter(line => line.trim()).map(line => {
      const edge = line.replace(/(\w+)(?:\[[^\]]+\]|\{[^}]+\})/g, '$1').trim().match(/^(\w+)\s+(?:--\s+(.+?)\s+)?-->\s+(\w+)$/);
      assert(edge && labels.has(edge[1]) && labels.has(edge[3]), `Unsupported tutorial Mermaid edge: ${line}`);
      return `${labels.get(edge[1])}${edge[2] ? ` — ${edge[2]}` : ''} → ${labels.get(edge[3])}`;
    });
    return { kind: 'diagram', title: 'Blender extraction and annotation workflow',
      description: 'The canonical Mermaid flowchart rendered as accessible transitions. Yes/No branches preserve the import compatibility decision and retry path.', nodes };
  };
  const sections = [{ id: makeId('Tutorial overview'), title: 'Extracting 3D Model Data Using Blender', blocks: [] }];
  const blocks = () => sections.at(-1).blocks;
  const listItem = line => line.match(/^(\d+\.|-)\s+(.*)$/);
  const isBoundary = line => !line.trim() || /^(#{2,4} |```|\|)/.test(line) || listItem(line);
  let description = '';
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (!description) { description = line.replace(/^\*\*|\*\*$/g, ''); i++; continue; }
    const heading = line.match(/^(#{2,4}) (.+)$/);
    if (heading) {
      const title = heading[2];
      const id = makeId(title);
      if (heading[1].length === 2) sections.push({ id, title, blocks: [] });
      else blocks().push({ kind: 'heading', id, title, level: heading[1].length });
      i++; continue;
    }
    if (line.startsWith('```')) {
      const language = line.slice(3).trim();
      const code = [];
      i++;
      while (i < lines.length && lines[i] !== '```') code.push(lines[i++]);
      assert(i < lines.length, 'Unclosed tutorial code fence');
      i++;
      blocks().push(language === 'mermaid' ? diagram(code.join('\n')) : { kind: 'code', code: code.join('\n'), language: language === 'ts' ? 'typescript' : language });
      continue;
    }
    if (line.startsWith('|')) {
      const cells = value => value.trim().slice(1, -1).split('|').map(cell => inline(cell.trim()));
      const columns = cells(line);
      assert(/^\|(?:\s*:?-+:?\s*\|)+$/.test(lines[i + 1]), 'Missing tutorial table separator');
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const row = cells(lines[i++]);
        assert.equal(row.length, columns.length, 'Inconsistent tutorial table width');
        rows.push(row);
      }
      blocks().push({ kind: 'table', columns, rows });
      continue;
    }
    if (listItem(line)) {
      const ordered = listItem(line)[1] !== '-';
      const items = [];
      while (i < lines.length) {
        const match = listItem(lines[i]);
        if (!match || (match[1] !== '-') !== ordered) break;
        let text = match[2];
        i++;
        while (i < lines.length && /^\s+\S/.test(lines[i])) text += ' ' + lines[i++].trim();
        const check = text.match(/^\[([ xX])\] (.*)$/);
        items.push({ text: inline(check ? check[2] : text), ...(check ? { checked: check[1] !== ' ' } : {}) });
      }
      blocks().push({ kind: 'list', ordered, items });
      continue;
    }
    const paragraph = [line];
    i++;
    while (i < lines.length && !isBoundary(lines[i])) paragraph.push(lines[i++]);
    blocks().push({ kind: 'text', text: inline(paragraph.join(' ')) });
  }
  assert(sections.every(section => section.blocks.length), 'Empty generated tutorial section');
  const page = { id: 'blender-data-extraction', title: 'Blender & 3D Data Extraction', category: 'Three.js engine', description,
    sources: [
      'src/app/core/services/anatomy.service.ts',
      'src/app/features/anatomy/organ-viewer/organ-viewer.component.ts',
      'src/app/features/anatomy/organ-viewer/scene/model-loader.ts',
      'src/app/features/anatomy/organ-viewer/scene/model-preparation.ts',
      'src/app/features/anatomy/organ-viewer/hotspots/hotspot-projection.ts',
      'src/app/features/anatomy/organ-viewer/interactions/picking-controller.ts',
    ], sections };
  return `// Generated by node scripts/generate-docs-api.mjs from ${sourcePath}. Do not edit.\nimport type { DocPage } from '../docs.models';\nexport const BLENDER_PAGE: DocPage = ${JSON.stringify(page, null, 2)};\n`;
}
