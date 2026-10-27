import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SimpleMarkdown } from './SimpleMarkdown';

const html = (text: string) => renderToStaticMarkup(<SimpleMarkdown text={text} />);

describe('SimpleMarkdown (PR #110 follow-up)', () => {
  it('renders bold, italics and inline code as elements', () => {
    expect(html('WAL is **faster** and *safer*, see `PRAGMA journal_mode`.')).toBe(
      '<div class="space-y-2"><p>WAL is <strong>faster</strong> and <em>safer</em>, see ' +
        '<code class="px-1 py-0.5 rounded rag-well font-mono text-[0.9em]">PRAGMA journal_mode</code>.</p></div>',
    );
    expect(html('_one_ and **bold with *italic* inside**')).toContain('<strong>bold with <em>italic</em> inside</strong>');
  });

  it('leaves snake_case, arithmetic and a lone star alone', () => {
    const out = html('use journal_mode_wal; 2*3*4 = 24; a * b');
    expect(out).not.toContain('<em>');
    expect(out).toContain('journal_mode_wal');
  });

  it('renders bullet and numbered lists, keeping the starting number', () => {
    expect(html('Steps:\n- one\n- **two**')).toBe(
      '<div class="space-y-2"><p>Steps:</p><ul class="list-disc pl-5 space-y-1"><li>one</li><li><strong>two</strong></li></ul></div>',
    );
    expect(html('3. three\n4. four')).toContain('<ol start="3" class="list-decimal pl-5 space-y-1"><li>three</li><li>four</li></ol>');
  });

  it('keeps single newlines as line breaks and blank lines as paragraphs', () => {
    expect(html('a\nb\n\nc')).toBe('<div class="space-y-2"><p>a<br/>b</p><p>c</p></div>');
  });

  it('never turns text into HTML', () => {
    const out = html('<img src=x onerror=alert(1)> **<b>x</b>**');
    expect(out).not.toContain('<img');
    expect(out).not.toContain('<b>');
    expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });
});
