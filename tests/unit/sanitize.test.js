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
  // UNVERIFIED in sandbox (needs jsdom)
  it('keeps same-origin /media/ images', () => {
    expect(s('<img src="/media/news/n1/a.jpg">')).toBe('<img src="/media/news/n1/a.jpg">');
  });
  it('drops protocol-relative, backslash, data:, javascript: and other relative image srcs', () => {
    expect(s('<img src="//evil.com/a.jpg">')).toBe('');
    expect(s('<img src="/\\evil.com/a.jpg">')).toBe('');
    expect(s('<img src="data:image/png;base64,AAAA">')).toBe('');
    expect(s('<img src="javascript:alert(1)">')).toBe('');
    expect(s('<img src="/other/a.jpg">')).toBe('');
    expect(s('<img src="a.jpg">')).toBe('');
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
  it('keeps Quill tables and colour, strips handlers in cells', () => {
    expect(s('<table><tbody><tr><td data-row="r1" onclick="x()" style="color:red">a</td></tr></tbody></table>'))
      .toBe('<table><tbody><tr><td data-row="r1" style="color: red">a</td></tr></tbody></table>');
  });
  it('keeps only colour/highlight/align styles', () => {
    expect(s('<p style="text-align: center; position: fixed">a <span style="color: #5b2a86; background-color: rgb(255, 243, 205); background-image: url(https://x)">b</span></p>'))
      .toBe('<p style="text-align: center">a <span style="color: #5b2a86; background-color: rgb(255, 243, 205)">b</span></p>');
    expect(s('<span style="background: url(javascript:alert(1))">x</span>')).toBe('<span>x</span>');
  });
});
