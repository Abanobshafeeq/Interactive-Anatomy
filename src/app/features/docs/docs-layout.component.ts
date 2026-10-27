import { AfterRenderRef, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, HostListener, Injector, ViewChild, afterNextRender, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { DOC_CATEGORIES, DOC_PAGES, docUrl } from './docs-content';
import { DOCS_VERSION } from './content/version.generated';
import { DocsSearchComponent } from './ui/docs-search.component';

@Component({
  selector: 'app-docs-layout', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, DocsSearchComponent],
  templateUrl: './docs-layout.component.html', styleUrl: './docs-layout.component.css',
  host: { '[class.dark]': 'dark()', '(window:resize)': 'resize()' },
})
export class DocsLayoutComponent {
  @ViewChild('sidebar', { static: true }) sidebar!: ElementRef<HTMLElement>;
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly titleService = inject(Title);
  private readonly previousTitle = this.titleService.getTitle();
  private returnFocus: HTMLElement | null = null;
  private scrollTimer?: ReturnType<typeof setTimeout>;
  private focusCallback?: AfterRenderRef;
  private previousPath = '';
  private readonly positions = new Map<number, number>();
  private entryId = 0;
  readonly dark = signal(this.readTheme());
  readonly drawerOpen = signal(false);
  readonly mobile = signal(window.innerWidth <= 850);
  readonly version = DOCS_VERSION;
  readonly groups = DOC_CATEGORIES.map(category => ({ category,
    pages: DOC_PAGES.filter(page => page.category === category && page.id && (!page.id.includes('/') ||
      ['api-reference/model-loader', 'api-reference/dental-service', 'api-reference/camera-controller'].includes(page.id))),
  }));
  readonly docUrl = docUrl;

  constructor() {
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), takeUntilDestroyed()).subscribe(event => {
      this.closeDrawer(false);
      const tree = this.router.parseUrl(event.urlAfterRedirects);
      const fragment = tree.fragment;
      tree.fragment = null;
      const path = this.router.serializeUrl(tree);
      const changed = this.previousPath !== path;
      this.positions.set(this.entryId, window.scrollY);
      this.entryId = window.history.state?.navigationId ?? event.id;
      const restored = this.positions.get(this.entryId);
      this.previousPath = path;
      if (this.scrollTimer) clearTimeout(this.scrollTimer);
      this.scrollTimer = setTimeout(() => {
        if (fragment) document.getElementById(fragment)?.scrollIntoView({ block: 'start' });
        else if (changed) window.scrollTo(0, restored ?? 0);
        if (changed) document.querySelector<HTMLElement>('app-docs-page h1, app-docs-source h1')?.focus({ preventScroll: true });
      });
    });
    this.destroyRef.onDestroy(() => {
      if (this.scrollTimer) clearTimeout(this.scrollTimer);
      this.focusCallback?.destroy();
      this.titleService.setTitle(this.previousTitle);
    });
  }
  readTheme(): boolean {
    try { return localStorage.getItem('anatomy_docs_theme') === 'dark'; } catch { return false; }
  }
  toggleTheme(): void {
    this.dark.update(value => !value);
    try { localStorage.setItem('anatomy_docs_theme', this.dark() ? 'dark' : 'light'); } catch { /* theme stays usable in memory */ }
  }
  openDrawer(): void {
    this.returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.drawerOpen.set(true);
    this.focusCallback?.destroy();
    this.focusCallback = afterNextRender(() => {
      if (this.drawerOpen()) this.sidebar.nativeElement.querySelector<HTMLElement>('button')?.focus();
    }, { injector: this.injector });
  }
  closeDrawer(restoreFocus = true): void {
    const wasOpen = this.drawerOpen();
    this.drawerOpen.set(false);
    this.focusCallback?.destroy();
    if (wasOpen && restoreFocus) {
      this.focusCallback = afterNextRender(() => { if (!this.drawerOpen()) this.returnFocus?.focus(); }, { injector: this.injector });
    }
  }
  resize(): void {
    this.mobile.set(window.innerWidth <= 850);
    if (!this.mobile()) this.closeDrawer(false);
  }
  @HostListener('document:keydown', ['$event']) key(event: KeyboardEvent): void {
    if (!this.mobile() || !this.drawerOpen() || document.querySelector('app-docs-search dialog[open]')) return;
    if (event.key === 'Escape') { event.preventDefault(); this.closeDrawer(); }
    if (event.key === 'Tab') {
      const items = Array.from(this.sidebar.nativeElement.querySelectorAll<HTMLElement>('button,a,summary,input')).filter(item => item.getClientRects().length);
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }
}
