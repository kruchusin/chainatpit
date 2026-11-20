import { describe, it, expect } from 'vitest';
import { parseMediaPath, parseMediaPrefix, targetDocPath, canWriteMedia } from '../../functions/_lib/media-auth.js';

const P = parseMediaPath;
const admin = { role: 'admin' };
const prc = { role: 'pr_central' };
const prMath = { prDepartments: ['math'] };
const t1 = { role: 'teacher' };
const off = { role: 'admin', disabled: true };

describe('parseMediaPath', () => {
  it('parses allowed shapes', () => {
    expect(P('news/n1/a.jpg')).toEqual({ kind: 'news', id: 'n1', file: 'a.jpg' });
    expect(P('site/logo.jpg')).toEqual({ kind: 'site', id: null, file: 'logo.jpg' });
    expect(P('staff/s1/photo.jpg')).toEqual({ kind: 'staff', id: 's1', file: 'photo.jpg' });
    expect(P('departments/math/cover.png')).toEqual({ kind: 'departments', id: 'math', file: 'cover.png' });
  });
  it('rejects other staff file names', () => {
    expect(P('staff/s1/other.jpg')).toBeNull();
  });
  it('rejects traversal and bad names', () => {
    ['news/x/../site/logo.jpg', 'news//a.jpg', 'news/x/..', 'news/x/.', 'news/x/a b.jpg', 'foo/x/a.jpg',
      'news/x%2Fy/a.jpg', '', 'site/..', 'site/.', 'site/a/b.jpg', 'news/x', 'news/x/a.jpg/'].forEach((p) => expect(P(p)).toBeNull());
    expect(P(undefined)).toBeNull();
    expect(P(null)).toBeNull();
  });
  it('rejects over-long id and file', () => {
    expect(P(`news/${'a'.repeat(129)}/a.jpg`)).toBeNull();
    expect(P(`news/${'a'.repeat(128)}/a.jpg`)).not.toBeNull();
    expect(P(`site/${'a'.repeat(101)}`)).toBeNull();
    expect(P(`site/${'a'.repeat(100)}`)).not.toBeNull();
  });
});

describe('parseMediaPrefix', () => {
  it('accepts news and departments prefixes only', () => {
    expect(parseMediaPrefix('news/n1/')).toEqual({ kind: 'news', id: 'n1' });
    expect(parseMediaPrefix('departments/math/')).toEqual({ kind: 'departments', id: 'math' });
    ['site/', 'staff/s1/', 'news/n1', 'news//', 'news/../', 'news/a/b/', '', 'news/a%2F/'].forEach((p) => expect(parseMediaPrefix(p)).toBeNull());
  });
});

describe('targetDocPath', () => {
  it('maps kinds to Firestore docs', () => {
    expect(targetDocPath(P('news/n1/a.jpg'))).toBe('news/n1');
    expect(targetDocPath(P('staff/s1/photo.jpg'))).toBe('staff/s1');
    expect(targetDocPath(P('departments/math/c.jpg'))).toBe('departments/math');
    expect(targetDocPath(P('site/logo.jpg'))).toBeNull();
  });
});

describe('canWriteMedia', () => {
  it('news: PR needs doc departments all within own', () => {
    expect(canWriteMedia(prMath, P('news/n1/a.jpg'), { departmentIds: ['math'] }, 'prMath')).toBe(true);
    expect(canWriteMedia(prMath, P('news/n1/a.jpg'), { departmentIds: ['math', 'sci'] }, 'prMath')).toBe(false);
    expect(canWriteMedia(prMath, P('news/n1/a.jpg'), { departmentIds: [] }, 'prMath')).toBe(false);
    expect(canWriteMedia(prMath, P('news/n1/a.jpg'), {}, 'prMath')).toBe(false);
    expect(canWriteMedia(t1, P('news/n1/a.jpg'), { departmentIds: ['math'] }, 't1')).toBe(false);
  });
  it('news: admin and pr_central always', () => {
    expect(canWriteMedia(prc, P('news/n1/a.jpg'), { departmentIds: [] }, 'prc')).toBe(true);
    expect(canWriteMedia(admin, P('news/n1/a.jpg'), { departmentIds: ['x'] }, 'admin')).toBe(true);
  });
  it('staff rules', () => {
    expect(canWriteMedia(t1, P('staff/s1/photo.jpg'), { uid: 't1', departmentIds: ['math'] }, 't1')).toBe(true);
    expect(canWriteMedia(t1, P('staff/s2/photo.jpg'), { uid: null, departmentIds: ['sci'] }, 't1')).toBe(false);
    expect(canWriteMedia(prMath, P('staff/s1/photo.jpg'), { uid: 't1', departmentIds: ['math', 'academic'] }, 'prMath')).toBe(true);
    expect(canWriteMedia(prc, P('staff/s1/photo.jpg'), { uid: 't1', departmentIds: ['math'] }, 'prc')).toBe(false);
    expect(canWriteMedia(admin, P('staff/s1/photo.jpg'), { uid: 't1' }, 'admin')).toBe(true);
    expect(canWriteMedia(prMath, P('staff/s1/photo.jpg'), null, 'prMath')).toBe(false);
  });
  it('departments rules', () => {
    expect(canWriteMedia(prMath, P('departments/math/cover.jpg'), {}, 'prMath')).toBe(true);
    expect(canWriteMedia(prMath, P('departments/sci/cover.jpg'), {}, 'prMath')).toBe(false);
    expect(canWriteMedia(admin, P('departments/sci/cover.jpg'), {}, 'admin')).toBe(true);
    expect(canWriteMedia(prc, P('departments/sci/cover.jpg'), {}, 'prc')).toBe(false);
  });
  it('site: admin only', () => {
    expect(canWriteMedia(prc, P('site/logo.jpg'), null, 'prc')).toBe(false);
    expect(canWriteMedia(admin, P('site/logo.jpg'), null, 'admin')).toBe(true);
  });
  it('disabled user denied', () => {
    expect(canWriteMedia(off, P('site/logo.jpg'), null, 'off')).toBe(false);
    expect(canWriteMedia(null, P('site/logo.jpg'), null, 'x')).toBe(false);
    expect(canWriteMedia({ role: 'pr_central', disabled: true }, P('news/n1/a.jpg'), {}, 'x')).toBe(false);
  });
  it('missing target doc: news write denied for PR', () => {
    expect(canWriteMedia(prMath, P('news/n9/a.jpg'), null, 'prMath')).toBe(false);
  });
  it('delete news prefix without doc: central allowed, PR denied', () => {
    const pre = { kind: 'news', id: 'n9', file: null };
    expect(canWriteMedia(prc, pre, null, 'prc', { forDelete: true })).toBe(true);
    expect(canWriteMedia(admin, pre, null, 'admin', { forDelete: true })).toBe(true);
    expect(canWriteMedia(prMath, pre, null, 'prMath', { forDelete: true })).toBe(false);
  });
});
