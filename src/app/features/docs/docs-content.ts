import { DocPage, plainText } from './docs.models';
import { FOUNDATION_PAGES } from './content/foundation.pages';
import { ENGINE_PAGES } from './content/engine.pages';
import { DENTAL_PAGES } from './content/dental.pages';
import { STATE_PAGES } from './content/state.pages';
import { ENGINEERING_PAGES } from './content/engineering.pages';
import { INTEGRATION_PAGE } from './content/integration.page';
import { API_PAGES } from './content/api.pages';

export const DOC_PAGES: DocPage[] = [
  ...FOUNDATION_PAGES, ...ENGINE_PAGES, ...DENTAL_PAGES, ...STATE_PAGES,
  ...ENGINEERING_PAGES, INTEGRATION_PAGE, ...API_PAGES,
];
export const DOC_CATEGORIES = ['Start here', 'Angular application', 'Three.js engine', 'Dental system', 'State and persistence', 'Reference', 'Integration', 'Engineering'];
export const docUrl = (id: string): string => id ? `/docs/${id}` : '/docs';
export const findPage = (id: string): DocPage | undefined => DOC_PAGES.find(page => page.id === id);

export function searchableText(page: DocPage): string {
  return [page.title, page.description, ...page.sections.flatMap(section => [section.title,
    ...section.blocks.map(block => {
      switch (block.kind) {
        case 'text': return plainText(block.text);
        case 'heading': return block.title;
        case 'list': return block.items.map(item => plainText(item.text)).join(' ');
        case 'code': return block.code;
        case 'note': return block.title + ' ' + block.text;
        case 'table': return block.columns.concat(block.rows.flat()).map(plainText).join(' ');
        case 'diagram': return block.title + ' ' + block.description + ' ' + block.nodes.join(' ');
        case 'links': return block.links.map(link => link.label).join(' ');
        case 'api': return block.symbol;
      }
    }),
  ])].join(' ').toLowerCase();
}

const SEARCH_INDEX = DOC_PAGES.map(page => ({ page, text: searchableText(page) }));
export function searchPages(query: string): DocPage[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return DOC_PAGES.filter(page => !page.id.includes('/')).slice(0, 8);
  return SEARCH_INDEX.filter(entry => words.every(word => entry.text.includes(word)))
    .sort((a, b) => DOC_CATEGORIES.indexOf(a.page.category) - DOC_CATEGORIES.indexOf(b.page.category)
      || Number(b.page.title.toLowerCase().includes(query.toLowerCase())) - Number(a.page.title.toLowerCase().includes(query.toLowerCase())))
    .map(entry => entry.page).slice(0, 40);
}
