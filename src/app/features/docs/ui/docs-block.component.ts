import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DocBlock } from '../docs.models';
import { API_SYMBOLS } from '../content/api.generated';
import { docUrl } from '../docs-content';
import { DocsCodeBlockComponent } from './docs-code-block.component';

@Component({
  selector: 'app-docs-block', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, DocsCodeBlockComponent],
  template: `
    @let item = block();
    @switch (item.kind) {
      @case ('text') {<p>{{ item.text }}</p>}
      @case ('code') {<app-docs-code-block [code]="item.code" [language]="item.language" [filename]="item.filename" />}
      @case ('note') {<aside class="callout" [class.warning]="item.tone === 'warning'"><strong>{{ item.title }}</strong><p>{{ item.text }}</p></aside>}
      @case ('table') {<div class="table-wrap" tabindex="0" role="region" [attr.aria-label]="item.columns.join(' / ') + ' table'"><table><thead><tr>@for (column of item.columns; track $index) {<th scope="col">{{ column }}</th>}</tr></thead><tbody>@for (row of item.rows; track $index) {<tr>@for (cell of row; track $index) {<td>{{ cell }}</td>}</tr>}</tbody></table></div>}
      @case ('diagram') {<figure class="diagram" [attr.aria-label]="item.title"><figcaption><strong>{{ item.title }}</strong><p>{{ item.description }}</p></figcaption><ol>@for (node of item.nodes; track $index) {<li><span class="node-index">{{ $index + 1 }}</span><span>{{ node }}</span></li>}</ol></figure>}
      @case ('links') {<div class="link-cards">@for (link of item.links; track link.page) {<a [routerLink]="docUrl(link.page.split('#')[0])" [fragment]="link.page.split('#')[1]">{{ link.label }}<span aria-hidden="true">↗</span></a>}</div>}
      @case ('api') {@if (symbol(); as entry) {<details class="api-preview"><summary><span class="api-kind">{{ entry.kind }}</span> {{ entry.name }} <span class="api-expand">declaration ⌄</span></summary><app-docs-code-block [code]="entry.signature" [filename]="entry.path + ':' + entry.line" /><a [routerLink]="'/docs/api-reference/' + entry.id">Full API and source →</a></details>}}
    }
  `,
  styleUrl: './docs-block.component.css',
})
export class DocsBlockComponent {
  readonly block = input.required<DocBlock>();
  readonly docUrl = docUrl;
  readonly symbol = computed(() => {
    const block = this.block();
    return block.kind === 'api' ? API_SYMBOLS.find(symbol => symbol.name === block.symbol) : undefined;
  });
}
