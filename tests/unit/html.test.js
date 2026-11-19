import { describe, it, expect } from 'vitest';
import { esc, safeUrl } from '../../public/assets/js/lib/html.js';

describe('esc', () => {
  it('escapes & < > " \' and tolerates null', () => {
    expect(esc(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
  });
});

describe('safeUrl', () => {
  it('allows http(s) and root-relative URLs', () => {
    for (const u of ['https://a.b/c', 'HTTP://a.b', '/news/1', '/']) expect(safeUrl(u)).toBe(u);
  });
  it('rejects protocol-relative, backslash-host, javascript:, data:, empty', () => {
    for (const u of ['//evil.com', '/\\evil.com', '/\\/evil.com', 'javascript:alert(1)', 'data:text/html,x', '', null, undefined, 'ftp://x']) {
      expect(safeUrl(u)).toBe('');
    }
  });
});
