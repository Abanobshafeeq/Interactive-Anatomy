import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

@Component({
  selector: 'app-docs-code-block', standalone: true, changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="code-head"><span>{{ filename() || language() }}</span>
      <button type="button" (click)="copy()" aria-label="Copy code">{{ copied() }}</button>
    </div>
    <pre tabindex="0" [attr.aria-label]="(filename() || language()) + ' code example'"><code>@for (token of tokens(); track $index) {<span [class]="token.kind">{{ token.value }}</span>}</code></pre>
    <span class="copy-status" role="status">{{ message() }}</span>
  `,
  styles: [`
    :host{display:block;min-width:0;margin:1.4rem 0;border:1px solid var(--docs-code-line,#334155);border-radius:12px;overflow:hidden;background:#101b2a;color:#e2e8f0}
    .code-head{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.65rem 1rem;background:#172437;color:#b7c9dd;font:12px ui-monospace,monospace;overflow-wrap:anywhere}
    button{background:transparent;border:1px solid #53657b;color:#e2e8f0;padding:7px 12px;min-height:34px;border-radius:6px;cursor:pointer}button:focus-visible,pre:focus-visible{outline:2px solid #7dd3fc;outline-offset:-3px}
    pre{margin:0;padding:1.25rem;overflow:auto;max-height:650px;tab-size:2;line-height:1.8;font:12.5px/1.8 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre}code{font:inherit}.string{color:#b2e1b5}.keyword{color:#c4b5fd}.comment{color:#91a6be}.number{color:#fbcfa0}
    .copy-status{display:block;font-size:12px;padding:0 1rem}.copy-status:empty{display:none}@media print{pre{max-height:none;white-space:pre-wrap;overflow-wrap:anywhere}.code-head button{display:none}}
  `],
})
export class DocsCodeBlockComponent {
  readonly code = input.required<string>();
  readonly language = input('typescript');
  readonly filename = input<string>();
  readonly copied = signal('Copy');
  readonly message = signal('');
  readonly tokens = computed(() => {
    const expression = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"|`(?:\\.|[^`\\])*`|\b(?:export|import|from|class|interface|type|const|let|new|return|if|else|void|private|readonly|true|false|null|undefined|function|async|await|throw|implements|extends)\b|\b\d+(?:\.\d+)?\b)/g;
    return this.code().split(expression).filter(Boolean).map(value => ({ value,
      kind: /^(\/\/|\/\*)/.test(value) ? 'comment' : /^["'`]/.test(value) ? 'string'
        : /^\d/.test(value) ? 'number' : /^(?:export|import|from|class|interface|type|const|let|new|return|if|else|void|private|readonly|true|false|null|undefined|function|async|await|throw|implements|extends)$/.test(value) ? 'keyword' : 'plain',
    }));
  });

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.code());
      this.copied.set('Copied');
      this.message.set('Code copied to clipboard.');
    } catch {
      this.copied.set('Copy');
      this.message.set('Clipboard unavailable. Select the code and copy it manually.');
    }
  }
}
