export interface ApiMember {
  name: string;
  signature: string;
  visibility: string;
  line: number;
}

export interface ApiSymbol {
  id: string;
  name: string;
  kind: string;
  sourceId: string;
  path: string;
  line: number;
  signature: string;
  comment: string;
  members: ApiMember[];
}

export interface SourceSnapshot {
  id: string;
  path: string;
  text: string;
  dependencies: string[];
  hash: string;
}

export type DocBlock =
  | { kind: 'text'; text: string }
  | { kind: 'code'; code: string; language: string; filename?: string }
  | { kind: 'note'; title: string; text: string; tone: 'info' | 'warning' }
  | { kind: 'table'; columns: string[]; rows: string[][] }
  | { kind: 'diagram'; title: string; description: string; nodes: string[] }
  | { kind: 'links'; links: { label: string; page: string }[] }
  | { kind: 'api'; symbol: string };

export interface DocSection {
  id: string;
  title: string;
  blocks: DocBlock[];
}

export interface DocPage {
  id: string;
  title: string;
  category: string;
  description: string;
  sections: DocSection[];
  sources: string[];
}
