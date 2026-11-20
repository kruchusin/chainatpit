import { describe, it, expect } from 'vitest';
import { filterStyle } from '../../public/assets/js/lib/sanitize.js';

describe('filterStyle', () => {
  it('keeps colour, highlight and alignment', () => {
    expect(filterStyle('color: #5B2A86; background-color: rgb(255, 243, 205); text-align: center'))
      .toBe('color: #5b2a86; background-color: rgb(255, 243, 205); text-align: center');
    expect(filterStyle('color:red')).toBe('color: red');
  });
  it('drops everything else', () => {
    expect(filterStyle('position: fixed; top: 0; background-image: url(https://x/y.png)')).toBe('');
    expect(filterStyle('background: url(javascript:alert(1))')).toBe('');
    expect(filterStyle('color: expression(alert(1))')).toBe('');
    expect(filterStyle('color: var(--x)')).toBe('');
    expect(filterStyle('color: inherit')).toBe('');
    expect(filterStyle('text-align: url(x)')).toBe('');
    expect(filterStyle('')).toBe('');
    expect(filterStyle(null)).toBe('');
  });
});
