import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DocBlock, plainText } from '../docs.models';
import { API_SYMBOLS } from '../content/api.generated';
import { docUrl } from '../docs-content';
import { DocsCodeBlockComponent } from './docs-code-block.component';
import { DocsInlineComponent } from './docs-inline.component';

@Component({
  selector: 'app-docs-block', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgTemplateOutlet, DocsCodeBlockComponent, DocsInlineComponent],
  template: `
    @let item = block();
    @switch (item.kind) {
      @case ('text') {<p><app-docs-inline [text]="item.text" /></p>}
      @case ('code') {<app-docs-code-block [code]="item.code" [language]="item.language" [filename]="item.filename" />}
      @case ('note') {<aside class="callout" [class.warning]="item.tone === 'warning'"><strong>{{ item.title }}</strong><p>{{ item.text }}</p></aside>}
      @case ('table') {<div class="table-wrap" tabindex="0" role="region" [attr.aria-label]="tableLabel()"><table><thead><tr>@for (column of item.columns; track $index) {<th scope="col"><app-docs-inline [text]="column" /></th>}</tr></thead><tbody>@for (row of item.rows; track $index) {<tr>@for (cell of row; track $index) {<td><app-docs-inline [text]="cell" /></td>}</tr>}</tbody></table></div>}
      @case ('heading') {
        @if (item.level === 3) {<h3 [id]="item.id" class="subheading"><a [routerLink]="[]" [fragment]="item.id">{{ item.title }}</a></h3>}
        @else {<h4 [id]="item.id" class="subheading"><a [routerLink]="[]" [fragment]="item.id">{{ item.title }}</a></h4>}
      }
      @case ('list') {
        <ng-template #items>@for (entry of item.items; track $index) {<li>@if (entry.checked !== undefined) {<span class="check-state" role="img" [attr.aria-label]="entry.checked ? 'Checked' : 'Unchecked'">{{ entry.checked ? '☑' : '☐' }}</span>}<app-docs-inline [text]="entry.text" /></li>}</ng-template>
        @if (item.ordered) {<ol class="prose-list"><ng-container [ngTemplateOutlet]="items" /></ol>}
        @else {<ul class="prose-list"><ng-container [ngTemplateOutlet]="items" /></ul>}
      }
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
  readonly tableLabel = computed(() => {
    const block = this.block();
    return block.kind === 'table' ? block.columns.map(plainText).join(' / ') + ' table' : '';
  });
  readonly symbol = computed(() => {
    const block = this.block();
    return block.kind === 'api' ? API_SYMBOLS.find(symbol => symbol.name === block.symbol) : undefined;
  });
}
