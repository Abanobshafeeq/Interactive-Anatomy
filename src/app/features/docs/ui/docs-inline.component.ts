import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DocInline, DocText } from '../docs.models';

@Component({
  selector: 'app-docs-inline', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `@for (part of parts(); track $index) {
    @switch (part.kind) {
      @case ('text') {<ng-container>{{ part.text }}</ng-container>}
      @case ('strong') {<strong>{{ part.text }}</strong>}
      @case ('code') {<code>{{ part.text }}</code>}
      @case ('link') {
        @if (part.external) {<a [href]="part.href">{{ part.text }}</a>}
        @else {<a [routerLink]="part.href" [fragment]="part.fragment">{{ part.text }}</a>}
      }
    }
  }`,
  styles: [`
    :host{display:inline}strong{font-weight:650;color:var(--docs-ink)}
    code{font: .9em/1.8 ui-monospace,monospace;background:var(--docs-surface);border:1px solid var(--docs-line);border-radius:4px;padding:1px 4px;overflow-wrap:anywhere}
    a{color:var(--docs-accent);text-underline-offset:3px;overflow-wrap:anywhere}a:focus-visible{outline:2px solid var(--docs-accent);outline-offset:3px}
  `],
})
export class DocsInlineComponent {
  readonly text = input.required<DocText>();
  readonly parts = computed<DocInline[]>(() => {
    const text = this.text();
    return typeof text === 'string' ? [{ kind: 'text', text }] : text;
  });
}
