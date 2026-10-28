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

export type DocInline =
  | { kind: 'text' | 'code' | 'strong'; text: string }
  | { kind: 'link'; text: string; href: string; fragment?: string; external: boolean };

export type DocText = string | DocInline[];
export const plainText = (value: DocText): string => typeof value === 'string' ? value : value.map(part => part.text).join('');

export type DocBlock =
  | { kind: 'text'; text: DocText }
  | { kind: 'code'; code: string; language: string; filename?: string }
  | { kind: 'note'; title: string; text: string; tone: 'info' | 'warning' }
  | { kind: 'table'; columns: DocText[]; rows: DocText[][] }
  | { kind: 'heading'; id: string; title: string; level: 3 | 4 }
  | { kind: 'list'; ordered: boolean; items: { text: DocText; checked?: boolean }[] }
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
