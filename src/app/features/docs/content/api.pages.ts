import type { ApiSymbol, DocPage } from '../docs.models';
import { API_SYMBOLS } from './api.generated';
import { API_BEHAVIOR, METHOD_NOTES } from './api.behavior';
import { code, links, note, page, section, table, text } from './foundation.pages';

function guideFor(symbol: ApiSymbol): string {
  if (symbol.kind === 'interface' || symbol.kind === 'type' || symbol.path.includes('/models/dental.model')) return 'data-models';
  if (symbol.path.includes('organ-viewer.component')) return 'organ-viewer';
  if (symbol.name.endsWith('Component') || symbol.name === 'routes' || symbol.name === 'appConfig') return 'angular-foundation';
  return 'architecture';
}

function buildPage(symbol: ApiSymbol): DocPage {
  const behavior = API_BEHAVIOR[symbol.name];
  const guide = behavior?.guide ?? guideFor(symbol);
  const publicMembers = symbol.members.filter(member => member.visibility === 'public');
  const privateMembers = symbol.members.filter(member => member.visibility === 'private');
  return page(`api-reference/${symbol.id}`, symbol.name, 'Reference', behavior?.summary ??
    `${symbol.kind[0].toUpperCase() + symbol.kind.slice(1)} declaration from ${symbol.path}; ${symbol.name.endsWith('Component') ? 'Angular UI contract and public state.' : 'exact source-backed structure and related implementation guide.'}`,
    [symbol.path],
    section('declaration', 'Declaration and source',
      text(`${symbol.kind} · ${symbol.path}:${symbol.line}. This declaration is generated from the TypeScript AST; it is source syntax, including defaults/inferred field initializers, rather than a separately published .d.ts contract. Private members remain implementation details.`),
      code(symbol.signature, 'typescript', `${symbol.path}:${symbol.line}`),
      ...(symbol.comment ? [note('Source comment', symbol.comment)] : [])),
    section('contract', 'Behavior, parameters and ownership',
      ...(behavior ? [table(['Contract', 'Details'], [
        ['Parameters', behavior.parameters], ['Return / callbacks', behavior.result], ['Side effects / ownership', behavior.effects],
        ['Failures / exceptions', behavior.failures], ['Reuse boundary', behavior.reuse],
      ])] : [text(symbol.kind === 'interface' || symbol.kind === 'type'
        ? 'The declaration above defines every required/optional field, literal union, callback and referenced type. This is a compile-time contract, with no runtime validation, exceptions, ownership or side effects by itself. The data-model guide explains producers, consumers, field meanings and storage rules; runtime validation remains the responsibility of storage/services.'
        : symbol.kind === 'constant'
          ? symbol.name === 'TEETH_CATALOG' ? '32 Universal entries; wisdom teeth have no centers. Records are shared and physical centers/extents can be calibrated by DentalService. This catalog is specific to teeth.OBJ.'
            : symbol.name === 'MODEL_TEETH' ? '28 shared records filtered from TEETH_CATALOG by center presence, retaining identity with catalog values. Four wisdom IDs are absent from physical lookup.'
              : symbol.name === 'DENTAL_SHADE_PRESETS' ? 'Configured UI name/code/hex palette. Values describe application display behavior and include vivid highlights; they are not verified clinical shade measurements.'
                : 'Configuration value consumed by Angular bootstrap or routing. See Angular foundation for providers, lazy import behavior and initial redirect semantics.'
          : 'Standalone Angular component. Inputs, outputs, public signals and methods are listed below. Angular creates it through the injector and manages lifecycle. Refer to the component guide for state ownership, templates and error handling; new Component() outside DI is not a supported integration pattern.')]),
      links(['Conceptual guide and field semantics', guide], ['Integration handbook', 'integration'])),
    ...(publicMembers.length ? [section('public-api', 'Public members',
      text('Signatures are copied from the implementation. Methods accept the parameters shown; state fields retain their actual signal/input/output initializers. Constructor parameter properties retain visibility in the source declaration.'),
      ...publicMembers.flatMap(member => [
        code(member.signature, 'typescript', `${symbol.path}:${member.line}`),
        ...(METHOD_NOTES[`${symbol.name}.${member.name}`] ? [text(METHOD_NOTES[`${symbol.name}.${member.name}`])]
          : member.name === 'constructor' ? [text(behavior?.parameters ?? 'Angular injection context is required for injected dependencies; lifecycle remains managed by the host.')]
          : []),
      ]))] : []),
    ...(behavior ? [section('example', 'Usage example', code(behavior.example),
      text('This focused example assumes host objects and imports from the linked implementation. Complete parameterized functions and all imports are in the integration handbook; those examples are checked by the repository’s examples TypeScript configuration.'))] : []),
    ...(privateMembers.length ? [section('internals', 'Private implementation boundaries',
      table(['Private member', 'Source location'], privateMembers.map(member => [member.name, `${symbol.path}:${member.line}`])),
      text('These names are included for maintenance and debugging. Their signatures and full bodies are available through the source browser. They are not a reusable public API and should be adapted at a module boundary rather than accessed through casts.'))] : []),
  );
}

const index: DocPage = page('api-reference', 'API reference', 'Reference',
  'Generated declarations for every exported production application symbol, with curated behavior and links to complete source snapshots.', [],
  section('about', 'Generated signatures, curated explanations',
    text('node scripts/generate-docs-api.mjs walks production TypeScript under src/app (excluding docs, tests and test fixtures) plus main.ts. It indexes exported classes, functions, interfaces, type aliases and constants. Type re-exports CameraControlAction and Hotspot2D are documented at their defining modules and remain available from OrganViewer. It does not execute or import source modules. Each source snapshot has a SHA256 fingerprint.'),
    note('Maintenance contract', 'Source signatures and file snapshots are generated; behavioral notes and guides are curated. Regeneration is not a substitute for reviewing semantic changes. check-docs validates freshness, route IDs, references and public method notes.'),
    links(['Maintain the documentation', 'maintenance'], ['Integration dependency matrix', 'integration'])),
  ...['class', 'function', 'interface', 'type', 'constant'].map(kind => section(kind + 's', kind[0].toUpperCase() + kind.slice(1) + ' declarations',
    links(...API_SYMBOLS.filter(symbol => symbol.kind === kind).map(symbol => [symbol.name, `api-reference/${symbol.id}`] as [string, string])))),
);

export const API_PAGES: DocPage[] = [index, ...API_SYMBOLS.map(buildPage)];
