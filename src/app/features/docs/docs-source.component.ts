import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { API_SYMBOLS } from './content/api.generated';
import { SOURCE_SNAPSHOTS } from './content/sources.generated';
import { DocsCodeBlockComponent } from './ui/docs-code-block.component';

@Component({
  selector: 'app-docs-source', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DocsCodeBlockComponent],
  template: `<div class="source-page"><a routerLink="/docs/api-reference">← API reference</a>
    @if (source(); as file) {
      <p class="eyebrow">SOURCE SNAPSHOT · SHA256 {{ file.hash }}</p><h1 tabindex="-1">{{ file.path }}</h1>
      <p>This is generated source text, never executed by the documentation. Refresh it with node scripts/generate-docs-api.mjs when the implementation changes.</p>
      <nav aria-label="Exported symbols">@for (symbol of symbols(); track symbol.id) {<a [routerLink]="'/docs/api-reference/' + symbol.id">{{ symbol.name }}</a>}</nav>
      <app-docs-code-block [code]="file.text" [filename]="file.path" />
      <details><summary>Imported dependencies</summary><ul>@for (dependency of file.dependencies; track dependency) {<li>{{ dependency }}</li>}</ul></details>
    } @else {<h1 tabindex="-1">Source file not found</h1><p>Use the API index or a guide’s implementation links to open a known source snapshot.</p>}
  </div>`,
  styles: [`:host{display:block}.source-page{max-width:1050px;margin:auto;padding:46px;min-width:0}a{color:var(--docs-accent);text-decoration:none;font-size:12px}h1{font:600 22px/1.7 ui-monospace,monospace;overflow-wrap:anywhere;outline:none}p{color:var(--docs-muted);line-height:1.9;font-size:13px}.eyebrow{font-size:10px;margin-top:36px;letter-spacing:.08em;color:var(--docs-accent)}nav{display:flex;flex-wrap:wrap;gap:10px}nav a{padding:5px 10px;background:var(--docs-accent-bg);border-radius:5px;font:11px/1.8 ui-monospace,monospace}details{color:var(--docs-muted);font-size:12px;margin:24px 0}summary{cursor:pointer}a:focus-visible,summary:focus-visible{outline:2px solid var(--docs-accent);outline-offset:3px}@media(max-width:540px){.source-page{padding:24px 22px}h1{font-size:17px}}`],
})
export class DocsSourceComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly title = inject(Title);
  readonly sourceId = signal('');
  readonly source = computed(() => SOURCE_SNAPSHOTS.find(source => source.id === this.sourceId()));
  readonly symbols = computed(() => API_SYMBOLS.filter(symbol => symbol.sourceId === this.sourceId()));
  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.sourceId.set(params.get('sourceId') ?? '');
      this.title.setTitle((this.source()?.path ?? 'Source not found') + ' · Anatomy Docs');
    });
  }
}
