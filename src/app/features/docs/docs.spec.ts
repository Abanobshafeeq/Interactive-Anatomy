import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { DOC_PAGES, DOC_CATEGORIES, findPage, searchPages, searchableText } from './docs-content';
import { API_SYMBOLS } from './content/api.generated';
import { DocsLayoutComponent } from './docs-layout.component';
import { DocsSearchComponent } from './ui/docs-search.component';
import { DocsCodeBlockComponent } from './ui/docs-code-block.component';

describe('Documentation portal', () => {
  let harness: RouterTestingHarness;
  beforeEach(async () => {
    await TestBed.configureTestingModule({ providers: [provideRouter(routes)] }).compileComponents();
    harness = await RouterTestingHarness.create();
  });
  const content = (): string => harness.routeNativeElement?.textContent ?? '';

  it('keeps docs and anatomy lazy and preserves the default redirect', () => {
    expect(routes.find(route => route.path === 'docs')?.loadChildren).toBeDefined();
    expect(routes.find(route => route.path === 'docs')?.component).toBeUndefined();
    expect(routes.find(route => route.path === 'anatomy')?.loadComponent).toBeDefined();
    expect(routes.find(route => route.path === '')?.redirectTo).toBe('anatomy');
  });

  it('renders /docs without requesting a canvas context or mounting anatomy', async () => {
    const context = spyOn(HTMLCanvasElement.prototype, 'getContext').and.callThrough();
    await harness.navigateByUrl('/docs');
    expect(content()).toContain('Anatomy Angular Developer Documentation');
    expect(harness.routeNativeElement?.querySelector('app-organ-viewer')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('canvas')).toBeNull();
    expect(context).not.toHaveBeenCalled();
  });

  it('opens a technical deep link and updates the active sidebar item', async () => {
    await harness.navigateByUrl('/docs/dental-algorithms');
    const active = harness.routeNativeElement?.querySelector('nav[aria-label="Documentation sections"] a[aria-current="page"]');
    expect(active?.textContent).toContain('Dental algorithms');
    expect(content()).toContain('computeToothBounds');
    expect(harness.routeNativeElement?.querySelector('h2#bounds')).toBeTruthy();
  });

  it('renders every required conceptual page through routing', async () => {
    for (const page of DOC_PAGES.filter(page => !page.id.includes('/'))) {
      await harness.navigateByUrl(page.id ? '/docs/' + page.id : '/docs');
      expect(harness.routeNativeElement?.querySelector('h1')?.textContent).withContext(page.id).toBe(page.title);
    }
  });

  it('renders actual API declarations and source links', async () => {
    await harness.navigateByUrl('/docs/api-reference/model-loader');
    expect(content()).toContain('load(path: string, callbacks: ModelLoadCallbacks): void');
    expect(content()).toContain('Side effects / ownership');
    expect(harness.routeNativeElement?.querySelector('a[href*="/docs/source/"]')).toBeTruthy();
  });

  it('renders a lazy source snapshot as text', async () => {
    const symbol = API_SYMBOLS.find(symbol => symbol.name === 'CameraController')!;
    await harness.navigateByUrl('/docs/source/' + symbol.sourceId);
    expect(content()).toContain('SOURCE SNAPSHOT');
    expect(content()).toContain('export class CameraController');
    expect(harness.routeNativeElement?.querySelector('canvas')).toBeNull();
  });

  it('handles unknown content and source deep links helpfully', async () => {
    await harness.navigateByUrl('/docs/unknown/nested-page');
    expect(content()).toContain('Page not found');
    expect(content()).toContain('Documentation overview');
    await harness.navigateByUrl('/docs/source/missing');
    expect(content()).toContain('Source file not found');
  });

  it('generates TOC fragment links to real headings', async () => {
    await harness.navigateByUrl('/docs/model-loading');
    const toc = harness.routeNativeElement?.querySelector('app-docs-toc');
    const link = toc?.querySelector<HTMLAnchorElement>('a[href$="#sequence"]');
    expect(link).toBeTruthy();
    link?.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/docs/model-loading#sequence');
    expect(harness.routeNativeElement?.querySelector('#sequence')?.textContent).toContain('Selection-to-render');
  });

  it('opens search with Ctrl+K, navigates results with arrows and closes with Escape', async () => {
    await harness.navigateByUrl('/docs');
    const search = harness.routeDebugElement!.query(By.directive(DocsSearchComponent)).componentInstance as DocsSearchComponent;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true, cancelable: true }));
    harness.detectChanges();
    expect(search.dialog.nativeElement.open).toBeTrue();
    const input = search.searchInput.nativeElement;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    harness.detectChanges();
    expect(search.selected()).toBe(1);
    expect(input.getAttribute('aria-activedescendant')).toBe('result-1');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(search.dialog.nativeElement.open).toBeFalse();
  });

  it('supports Cmd+K and Enter opening a selected API result', async () => {
    await harness.navigateByUrl('/docs');
    const search = harness.routeDebugElement!.query(By.directive(DocsSearchComponent)).componentInstance as DocsSearchComponent;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true }));
    search.update('ModelLoader');
    search.selected.set(search.results().findIndex(page => page.id === 'api-reference/model-loader'));
    harness.detectChanges();
    search.searchInput.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/docs/api-reference/model-loader');
    expect(search.dialog.nativeElement.open).toBeFalse();
  });

  it('shows a useful empty search state without losing the current page', async () => {
    await harness.navigateByUrl('/docs/geometry');
    const search = harness.routeDebugElement!.query(By.directive(DocsSearchComponent)).componentInstance as DocsSearchComponent;
    search.open(); search.update('zzzz-no-matching-guide'); harness.detectChanges();
    expect(content()).toContain('No documentation matches');
    search.key(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(TestBed.inject(Router).url).toBe('/docs/geometry');
    search.close();
  });

  it('opens/closes mobile navigation with Escape and makes the background inert', async () => {
    await harness.navigateByUrl('/docs');
    const layout = harness.routeDebugElement!.componentInstance as DocsLayoutComponent;
    layout.mobile.set(true); layout.openDrawer(); harness.detectChanges();
    expect(layout.drawerOpen()).toBeTrue();
    expect(layout.sidebar.nativeElement.getAttribute('aria-modal')).toBe('true');
    expect(harness.routeNativeElement?.querySelector('main')?.hasAttribute('inert')).toBeTrue();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    harness.detectChanges();
    expect(layout.drawerOpen()).toBeFalse();
  });

  it('closes mobile navigation after selecting a route', async () => {
    await harness.navigateByUrl('/docs');
    const layout = harness.routeDebugElement!.componentInstance as DocsLayoutComponent;
    layout.mobile.set(true); layout.openDrawer(); harness.detectChanges();
    await harness.navigateByUrl('/docs/architecture');
    expect(layout.drawerOpen()).toBeFalse();
    expect(content()).toContain('Application architecture');
  });

  it('moves focus into the mobile drawer and restores it after removing inert', async () => {
    await harness.navigateByUrl('/docs');
    const layout = harness.routeDebugElement!.componentInstance as DocsLayoutComponent;
    const trigger = harness.routeNativeElement!.querySelector<HTMLElement>('button[aria-label="Open documentation navigation"]')!;
    // Keep the mobile controls visible even when Karma's actual viewport is desktop-sized.
    layout.sidebar.nativeElement.querySelector<HTMLElement>('button')!.style.display = 'block';
    trigger.style.display = 'block'; trigger.focus();
    layout.mobile.set(true); layout.openDrawer(); harness.detectChanges();
    await harness.fixture.whenStable();
    expect(document.activeElement).toBe(layout.sidebar.nativeElement.querySelector('button'));
    layout.closeDrawer(); harness.detectChanges();
    await harness.fixture.whenStable();
    expect(document.activeElement).toBe(trigger);
  });

  it('keeps semantic page metadata and API references complete', () => {
    expect(new Set(DOC_PAGES.map(page => page.id)).size).toBe(DOC_PAGES.length);
    for (const page of DOC_PAGES) {
      expect(page.title && page.description && DOC_CATEGORIES.includes(page.category)).withContext(page.id).toBeTruthy();
      expect(new Set(page.sections.map(section => section.id)).size).toBe(page.sections.length);
      expect(searchableText(page)).toContain(page.title.toLowerCase());
      for (const section of page.sections) for (const block of section.blocks) {
        if (block.kind === 'api') expect(API_SYMBOLS.some(symbol => symbol.name === block.symbol)).withContext(block.symbol).toBeTrue();
        if (block.kind === 'links') for (const link of block.links) expect(findPage(link.page.split('#')[0])).withContext(link.page).toBeDefined();
      }
    }
  });

  it('searches headings, detailed content and exported API symbols', () => {
    expect(searchPages('Meshopt').some(page => page.id === 'model-loading')).toBeTrue();
    expect(searchPages('isNearBoundary').some(page => page.id === 'api-reference/dental-service')).toBeTrue();
    expect(searchPages('zzzz-no-matching-guide')).toEqual([]);
    expect(searchPages('  ')).not.toEqual([]);
  });

  it('renders code and HTML as escaped text', () => {
    const fixture = TestBed.createComponent(DocsCodeBlockComponent);
    fixture.componentRef.setInput('code', '<img src=x onerror="alert(1)">');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('img')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('<img src=x');
  });

  it('copies the original code and reports unavailable clipboard honestly', async () => {
    const fixture = TestBed.createComponent(DocsCodeBlockComponent);
    fixture.componentRef.setInput('code', 'const example = 1;'); fixture.detectChanges();
    const clipboard = spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
    await fixture.componentInstance.copy();
    expect(clipboard).toHaveBeenCalledWith('const example = 1;');
    expect(fixture.componentInstance.copied()).toBe('Copied');
    clipboard.and.returnValue(Promise.reject(new Error('unavailable')));
    await fixture.componentInstance.copy();
    expect(fixture.componentInstance.message()).toContain('Clipboard unavailable');
    expect(fixture.componentInstance.copied()).toBe('Copy');
  });
});
