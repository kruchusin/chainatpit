import { describe, it, expect } from 'vitest';
import { safeEmail } from '../../public/assets/js/lib/email.js';

describe('safeEmail', () => {
  it('accepts ordinary addresses', () => {
    expect(safeEmail('a.b+c@school.ac.th')).toBe('a.b+c@school.ac.th');
  });
  it('rejects mailto header injection and url chars', () => {
    for (const bad of ['a@b.c?bcc=x', 'a@b.c&cc=x', 'a@b.c/x', 'a@b.c#x', 'a b@c.d', 'a@b', '', null, undefined, 'a@b.c,d@e.f']) {
      expect(safeEmail(bad)).toBe('');
    }
  });
});
