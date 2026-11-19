import { describe, it, expect } from 'vitest';
import { splitThaiPrefix } from '../../migration/lib/thai-name.mjs';

describe('splitThaiPrefix', () => {
  it('นาย', () => expect(splitThaiPrefix('นายสมชาย ใจดี')).toEqual({ prefix: 'นาย', name: 'สมชาย ใจดี' }));
  it('นางสาว is not split as นาง + สาว', () =>
    expect(splitThaiPrefix('นางสาวสมศรี รักเรียน')).toEqual({ prefix: 'นางสาว', name: 'สมศรี รักเรียน' }));
  it('นาง with space', () => expect(splitThaiPrefix('นาง สมศรี ใจดี')).toEqual({ prefix: 'นาง', name: 'สมศรี ใจดี' }));
  it('ว่าที่ร้อยตรี', () =>
    expect(splitThaiPrefix('ว่าที่ร้อยตรีสมปอง ดีมาก')).toEqual({ prefix: 'ว่าที่ร้อยตรี', name: 'สมปอง ดีมาก' }));
  it('ดร.', () => expect(splitThaiPrefix('ดร.สมหมาย ใจดี')).toEqual({ prefix: 'ดร.', name: 'สมหมาย ใจดี' }));
  it('stacked prefixes', () =>
    expect(splitThaiPrefix('ว่าที่ร้อยตรี ดร.สมหมาย ใจดี')).toEqual({ prefix: 'ว่าที่ร้อยตรี ดร.', name: 'สมหมาย ใจดี' }));
  it('no prefix', () => expect(splitThaiPrefix('สมหมาย ใจดี')).toEqual({ prefix: '', name: 'สมหมาย ใจดี' }));
  it('trims and collapses whitespace; empty input', () => {
    expect(splitThaiPrefix('  นาย   สมชาย   ใจดี ')).toEqual({ prefix: 'นาย', name: 'สมชาย ใจดี' });
    expect(splitThaiPrefix('')).toEqual({ prefix: '', name: '' });
    expect(splitThaiPrefix(null)).toEqual({ prefix: '', name: '' });
  });
});
