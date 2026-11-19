// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import { createSanitizer } from '../../public/assets/js/lib/sanitize.js';

const s = createSanitizer(createDOMPurify(new JSDOM('').window));

describe('sanitize', () => {
  it('strips handlers and scripts', () => {
    expect(s('<p onclick="x()">a</p><script>alert(1)</script>')).toBe('<p>a</p>');
  });
  it('strips onerror', () => {
    // relative/data image sources are removed — only http(s) images allowed
    expect(s('<img src=x onerror=alert(1)>')).toBe('');
    expect(s('<img src="https://x/y.jpg" onerror="alert(1)">')).toBe('<img src="https://x/y.jpg">');
  });
  it('removes data: images even with > inside another attribute', () => {
    expect(s('<img alt="a>b" src="data:image/png;base64,AAAA">')).toBe('');
    expect(s('<img src=" DATA:image/png;base64,AAAA">')).toBe('');
  });
  it('keeps http(s) images', () => {
    expect(s('<img src="https://x/y.jpg">')).toBe('<img src="https://x/y.jpg">');
  });
  it('strips javascript: links', () => {
    expect(s('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
  });
  it('allows youtube embed iframe', () => {
    expect(s('<iframe src="https://www.youtube.com/embed/abc"></iframe>')).toContain('youtube.com/embed/abc');
  });
  it('removes other iframes', () => {
    expect(s('<iframe src="https://evil.com/x"></iframe>')).toBe('');
  });
  it('unwraps Word junk', () => {
    expect(s('<span style="font-family:Calibri" class="MsoNormal">ก</span>')).toBe('ก');
  });
  it('forces rel=noopener when target is set', () => {
    const out = s('<a href="https://a.com" target="_blank">x</a>');
    expect(out).toContain('rel="noopener"');
  });
});
