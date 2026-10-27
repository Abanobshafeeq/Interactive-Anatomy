import { AfterViewInit, ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DocSection } from '../docs.models';

@Component({
  selector: 'app-docs-toc', standalone: true, imports: [RouterLink], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<details open><summary>On this page</summary><nav aria-label="On this page">@for (section of sections(); track section.id) {
    <a [routerLink]="[]" [fragment]="section.id" [class.current]="active() === section.id" [attr.aria-current]="active() === section.id ? 'location' : null">{{ section.title }}</a>
  }</nav></details>`,
  styles: [`:host{display:block;font-size:12px;line-height:1.6}summary{color:var(--docs-ink);font-weight:600;margin-bottom:16px;cursor:pointer}nav{display:flex;flex-direction:column;border-left:1px solid var(--docs-line)}a{text-decoration:none;color:var(--docs-muted);padding:7px 0 7px 16px;margin-left:-1px;border-left:2px solid transparent}a:hover,a.current{color:var(--docs-accent);border-color:var(--docs-accent)}a:focus-visible{outline:2px solid var(--docs-accent);outline-offset:2px}@media(max-width:1150px){details{border:1px solid var(--docs-line);border-radius:8px;padding:16px}nav{max-height:220px;overflow:auto}}`],
})
export class DocsTocComponent implements AfterViewInit {
  readonly sections = input.required<DocSection[]>();
  readonly active = signal('');
  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  ngAfterViewInit(): void {
    const root = this.element.nativeElement.closest('app-docs-page');
    if (!root || !('IntersectionObserver' in window)) return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
        else visible.delete(entry.target.id);
      }
      const headings = this.sections().filter(section => visible.has(section.id));
      if (headings.length) this.active.set(headings[0].id);
    }, { rootMargin: '-90px 0px -55% 0px', threshold: 0 });
    root.querySelectorAll<HTMLElement>('h2[id]').forEach(heading => observer.observe(heading));
    this.destroyRef.onDestroy(() => observer.disconnect());
  }
}
