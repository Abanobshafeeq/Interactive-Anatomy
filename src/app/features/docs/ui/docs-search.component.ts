import { ChangeDetectionStrategy, Component, ElementRef, HostListener, ViewChild, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { docUrl, searchPages } from '../docs-content';

@Component({
  selector: 'app-docs-search', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button class="search-launch" type="button" (click)="open()"><span>⌕ &nbsp; Search documentation</span><kbd>Ctrl K</kbd></button>
    <dialog #dialog aria-labelledby="search-label" (close)="restoreFocus()" (click)="backdrop($event)">
      <div class="search-top"><label id="search-label" for="docs-search-input">Search documentation</label><button type="button" (click)="close()" aria-label="Close search">Esc</button></div>
      <input #searchInput id="docs-search-input" type="search" autocomplete="off" placeholder="Try tooth bounds, loader, quota…"
        [value]="query()" (input)="update($any($event.target).value)" (keydown)="key($event)"
        role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="docs-search-results"
        [attr.aria-activedescendant]="results().length ? 'result-' + selected() : null" />
      <p class="search-help" role="status">{{ results().length }} results · ↑ ↓ to choose · Enter to open</p>
      <div id="docs-search-results" role="listbox" aria-label="Documentation results">
        @for (result of results(); track result.id; let i = $index) {
          @if (i === 0 || results()[i - 1].category !== result.category) {<p class="category">{{ result.category }}</p>}
          <div role="option" [id]="'result-' + i" [attr.aria-selected]="selected() === i" [class.chosen]="selected() === i"
            (click)="navigate(i)" (pointermove)="selected.set(i)">
            <strong>{{ result.title }}</strong><span>{{ result.description }}</span>
          </div>
        } @empty {<p class="empty">No documentation matches “{{ query() }}”. Try a subsystem or API name.</p>}
      </div>
    </dialog>
  `,
  styles: [`
    :host{display:block}.search-launch{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:12px;border:1px solid var(--docs-line);border-radius:8px;background:var(--docs-surface);color:var(--docs-muted);cursor:pointer;font-size:12px;text-align:left}kbd{font-size:10px;white-space:nowrap;border:1px solid var(--docs-line);border-radius:4px;padding:2px 4px}
    dialog{width:min(680px,calc(100vw - 32px));max-height:80dvh;padding:22px;border:1px solid var(--docs-line);border-radius:16px;background:var(--docs-bg);color:var(--docs-ink);box-shadow:0 25px 100px #0004;overflow:auto}dialog::backdrop{background:#0f172a80;backdrop-filter:blur(4px)}
    .search-top{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px;font-weight:600}.search-top button{padding:8px 12px;border:1px solid var(--docs-line);border-radius:6px;background:var(--docs-surface);color:var(--docs-muted);cursor:pointer}
    input{width:100%;padding:14px;border:1px solid var(--docs-line);border-radius:8px;background:var(--docs-surface);color:var(--docs-ink);font-size:16px;box-sizing:border-box}.search-help,.category{color:var(--docs-muted);font-size:12px}.category{text-transform:uppercase;letter-spacing:.1em;margin:20px 8px 8px}
    [role=option]{padding:14px 12px;border-radius:8px;cursor:pointer;border:1px solid transparent}[role=option].chosen{background:var(--docs-accent-bg);border-color:var(--docs-accent)}strong,span{display:block}[role=option] span{font-size:12px;color:var(--docs-muted);margin-top:5px;line-height:1.6}.empty{padding:20px;line-height:1.8}button:focus-visible,input:focus-visible{outline:2px solid var(--docs-accent);outline-offset:3px}
  `],
})
export class DocsSearchComponent {
  @ViewChild('dialog', { static: true }) dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('searchInput', { static: true }) searchInput!: ElementRef<HTMLInputElement>;
  private readonly router = inject(Router);
  private previousFocus: HTMLElement | null = null;
  readonly query = signal('');
  readonly selected = signal(0);
  readonly results = computed(() => searchPages(this.query()));

  open(): void {
    if (this.dialog.nativeElement.open) return;
    this.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.dialog.nativeElement.showModal();
    this.searchInput.nativeElement.focus();
  }
  close(): void { this.dialog.nativeElement.close(); }
  restoreFocus(): void { this.previousFocus?.focus(); }
  update(value: string): void { this.query.set(value); this.selected.set(0); }
  navigate(index: number): void {
    const result = this.results()[index];
    if (!result) return;
    this.close();
    void this.router.navigateByUrl(docUrl(result.id));
  }
  key(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const count = this.results().length;
      if (count) this.selected.update(value => (value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count);
      this.dialog.nativeElement.querySelector('#result-' + this.selected())?.scrollIntoView({ block: 'nearest' });
    } else if (event.key === 'Enter') {
      event.preventDefault(); this.navigate(this.selected());
    }
  }
  backdrop(event: MouseEvent): void {
    if (event.target !== this.dialog.nativeElement) return;
    const rect = this.dialog.nativeElement.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) this.close();
  }
  @HostListener('document:keydown', ['$event']) shortcut(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); this.open(); }
    if (event.key === 'Escape' && this.dialog.nativeElement.open) { event.preventDefault(); this.close(); }
  }
}
