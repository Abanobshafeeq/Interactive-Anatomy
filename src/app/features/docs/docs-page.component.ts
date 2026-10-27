import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DOC_PAGES, docUrl, findPage } from './docs-content';
import { API_SYMBOLS } from './content/api.generated';
import { DocsBlockComponent } from './ui/docs-block.component';
import { DocsTocComponent } from './ui/docs-toc.component';

@Component({
  selector: 'app-docs-page', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DocsBlockComponent, DocsTocComponent],
  templateUrl: './docs-page.component.html', styleUrl: './docs-page.component.css',
})
export class DocsPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  readonly pageId = signal('');
  readonly page = computed(() => findPage(this.pageId()));
  readonly docUrl = docUrl;
  readonly relatedPages = computed(() => DOC_PAGES.filter(page => page.id !== this.pageId() && page.category === this.page()?.category && !page.id.includes('/')).slice(0, 5));
  readonly neighbors = computed(() => {
    const pages = DOC_PAGES.filter(page => !page.id.includes('/'));
    const index = pages.findIndex(page => page.id === this.pageId());
    return { previous: pages[index - 1], next: pages[index + 1] };
  });
  readonly sourceLinks = computed(() => (this.page()?.sources ?? []).map(path => ({ path,
    id: API_SYMBOLS.find(symbol => symbol.path === path)?.sourceId ?? path.replace(/^src\//, '').replace(/\.ts$/, '').replaceAll('/', '--'),
  })));
  constructor() {
    this.route.url.pipe(takeUntilDestroyed()).subscribe(segments => {
      this.pageId.set(segments.map(segment => segment.path).join('/'));
      this.title.setTitle((this.page()?.title ?? 'Page not found') + ' · Anatomy Docs');
    });
  }
}
