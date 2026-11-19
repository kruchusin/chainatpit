import { describe, it, expect } from 'vitest';
import { mergeDepartmentIds, swapOrders, buildStaffPatch } from '../../public/assets/js/lib/staff-edit.js';
import { buildDeptPatch, DEPT_TYPES } from '../../public/assets/js/lib/dept-edit.js';

describe('mergeDepartmentIds', () => {
  it('keeps foreign ids untouched when PR unticks own dept', () => {
    expect(mergeDepartmentIds(['math', 'academic'], [], ['math'])).toEqual(['academic']);
  });
  it('adds a newly ticked own dept, keeps foreign', () => {
    expect(mergeDepartmentIds(['academic'], ['math'], ['math'])).toEqual(['academic', 'math']);
  });
  it('keeps original order of ids that stay', () => {
    expect(mergeDepartmentIds(['math', 'academic', 'sci'], ['math'], ['math', 'sci'])).toEqual(['math', 'academic']);
  });
  it('ignores a checked id that is not owned (cannot add foreign)', () => {
    expect(mergeDepartmentIds(['math'], ['math', 'sci'], ['math'])).toEqual(['math']);
  });
  it('never drops a foreign id even if it is not in checked list', () => {
    expect(mergeDepartmentIds(['academic', 'sci'], ['math'], ['math'])).toEqual(['academic', 'sci', 'math']);
  });
  it('dedupes and tolerates missing arrays', () => {
    expect(mergeDepartmentIds(undefined, ['math', 'math'], ['math'])).toEqual(['math']);
    expect(mergeDepartmentIds(['a', 'a'], [], [])).toEqual(['a']);
  });
});

describe('swapOrders', () => {
  it('swaps the two order values', () => {
    expect(swapOrders({ id: 'a', order: 1 }, { id: 'b', order: 3 })).toEqual([{ id: 'a', order: 3 }, { id: 'b', order: 1 }]);
  });
  it('breaks a tie so the second moves above the first', () => {
    const r = swapOrders({ id: 'a', order: 2 }, { id: 'b', order: 2 });
    expect(r[0]).toEqual({ id: 'a', order: 2 });
    expect(r[1].id).toBe('b');
    expect(r[1].order).toBeLessThan(2);
  });
  it('treats a missing order as 0', () => {
    expect(swapOrders({ id: 'a' }, { id: 'b', order: 5 })).toEqual([{ id: 'a', order: 5 }, { id: 'b', order: 0 }]);
  });
});

const old = { prefix: 'นาย', name: 'สมชาย', position: 'ครู', bio: '', education: '', email: 'a@b.co', photoUrl: '', departmentIds: ['math', 'academic'] };
const ALL = ['prefix', 'name', 'position', 'photoUrl', 'bio', 'education', 'email', 'departmentIds', 'order', 'active'];

describe('buildStaffPatch', () => {
  const form = { ...old, checkedDeptIds: ['math', 'academic'] };
  it('returns only changed fields', () => {
    const r = buildStaffPatch({ old, form: { ...form, position: 'ครูชำนาญการ' }, editable: ALL, ownIds: ['math'] });
    expect(r.error).toBeUndefined();
    expect(r.data).toEqual({ position: 'ครูชำนาญการ' });
  });
  it('drops fields not in the editable set', () => {
    const r = buildStaffPatch({ old, form: { ...form, position: 'x', bio: 'b' }, editable: ['bio'], ownIds: [] });
    expect(r.data).toEqual({ bio: 'b' });
  });
  it('merges departmentIds with foreign kept', () => {
    const r = buildStaffPatch({ old, form: { ...form, checkedDeptIds: [] }, editable: ALL, ownIds: ['math'] });
    expect(r.data).toEqual({ departmentIds: ['academic'] });
  });
  it('omits departmentIds when unchanged', () => {
    const r = buildStaffPatch({ old, form, editable: ALL, ownIds: ['math'] });
    expect(r.data).toEqual({});
  });
  it('rejects an invalid email', () => {
    const r = buildStaffPatch({ old, form: { ...form, email: 'bad@x' }, editable: ALL, ownIds: [] });
    expect(r.error).toBe('รูปแบบอีเมลไม่ถูกต้อง');
  });
  it('rejects a mailto-injection email', () => {
    const r = buildStaffPatch({ old, form: { ...form, email: 'a@b.co?bcc=x@y.zz' }, editable: ALL, ownIds: [] });
    expect(r.error).toBe('รูปแบบอีเมลไม่ถูกต้อง');
  });
  it('allows clearing the email', () => {
    const r = buildStaffPatch({ old, form: { ...form, email: '' }, editable: ALL, ownIds: [] });
    expect(r.data).toEqual({ email: '' });
  });
  it('requires a name when name is editable', () => {
    const r = buildStaffPatch({ old, form: { ...form, name: '  ' }, editable: ALL, ownIds: [] });
    expect(r.error).toBe('กรุณากรอกชื่อ-สกุล');
  });
  it('does not require name when name is not editable', () => {
    const r = buildStaffPatch({ old: { ...old, name: '' }, form: { ...form, name: '' }, editable: ['bio'], ownIds: [] });
    expect(r.error).toBeUndefined();
  });
  it('trims text fields', () => {
    const r = buildStaffPatch({ old, form: { ...form, position: '  ครู  ' }, editable: ALL, ownIds: [] });
    expect(r.data).toEqual({});
  });
  it('never emits uid, phone or other keys', () => {
    const r = buildStaffPatch({ old, form: { ...form, uid: 'x', phone: '081' }, editable: ALL, ownIds: [] });
    expect(r.data).toEqual({});
  });
});

describe('buildDeptPatch', () => {
  const o = { name: 'คณิต', type: 'subject', description: '', externalUrl: '', coverUrl: '' };
  it('exposes the three types', () => {
    expect(DEPT_TYPES).toEqual(['subject', 'division', 'unit']);
  });
  it('admin changes name/type/description/externalUrl only when different', () => {
    const r = buildDeptPatch({ old: o, form: { ...o, name: 'คณิตศาสตร์', externalUrl: 'https://x.org/a' }, admin: true });
    expect(r.data).toEqual({ name: 'คณิตศาสตร์', externalUrl: 'https://x.org/a' });
  });
  it('rejects non-http(s) externalUrl', () => {
    for (const u of ['javascript:alert(1)', 'ftp://x.org', '/relative', 'data:text/html,x']) {
      expect(buildDeptPatch({ old: o, form: { ...o, externalUrl: u }, admin: true }).error).toBe('ลิงก์ภายนอกต้องขึ้นต้นด้วย http:// หรือ https://');
    }
  });
  it('rejects empty name and bad type for admin', () => {
    expect(buildDeptPatch({ old: o, form: { ...o, name: ' ' }, admin: true }).error).toBe('กรุณากรอกชื่อหน่วยงาน');
    expect(buildDeptPatch({ old: o, form: { ...o, type: 'zzz' }, admin: true }).error).toBe('ประเภทหน่วยงานไม่ถูกต้อง');
  });
  it('PR can only change description/coverUrl', () => {
    const r = buildDeptPatch({ old: o, form: { ...o, name: 'x', type: 'unit', externalUrl: 'https://x.org', description: 'd', coverUrl: 'https://c.org/i.jpg' }, admin: false });
    expect(r.data).toEqual({ description: 'd', coverUrl: 'https://c.org/i.jpg' });
  });
  it('create mode (old null) requires name and type, keeps empty optional fields', () => {
    const r = buildDeptPatch({ old: null, form: { name: 'หน่วย', type: 'unit', description: '', externalUrl: '' }, admin: true });
    expect(r.data).toEqual({ name: 'หน่วย', type: 'unit', description: '', externalUrl: '' });
  });
});
