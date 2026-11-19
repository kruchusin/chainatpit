import { describe, it, expect } from 'vitest';
import { buildDocPayload, canManageDoc, thaiYearNow, DOC_KEYS } from '../../public/assets/js/lib/doc-edit.js';

const admin = { uid: 'a', role: 'admin', prDepartments: [] };
const prc = { uid: 'c', role: 'pr_central', prDepartments: [] };
const prMath = { uid: 'm', role: 'teacher', prDepartments: ['math'] };
const form = { title: ' แผน ', url: 'https://drive.google.com/x', category: ' ITA ', departmentId: '', year: '2569', order: '3' };

describe('doc-edit', () => {
  it('keys match the rules allow-list exactly', () => {
    expect([...DOC_KEYS].sort()).toEqual(['category', 'departmentId', 'order', 'title', 'url', 'year']);
  });
  it('thaiYearNow adds 543', () => expect(thaiYearNow(new Date('2026-11-19'))).toBe(2569));
  it('central builds payload with null department', () => {
    const { data } = buildDocPayload({ profile: admin, form });
    expect(data).toEqual({ title: 'แผน', url: 'https://drive.google.com/x', category: 'ITA', departmentId: null, year: 2569, order: 3 });
    expect(Object.keys(data).sort()).toEqual([...DOC_KEYS].sort());
  });
  it('pr_central may pick a department', () => {
    expect(buildDocPayload({ profile: prc, form: { ...form, departmentId: 'sci' } }).data.departmentId).toBe('sci');
  });
  it('dept PR must choose a department of theirs', () => {
    expect(buildDocPayload({ profile: prMath, form }).error).toBe('กรุณาเลือกฝ่าย/กลุ่มสาระ');
    expect(buildDocPayload({ profile: prMath, form: { ...form, departmentId: 'sci' } }).error).toBe('คุณจัดการเอกสารของฝ่ายนี้ไม่ได้');
    expect(buildDocPayload({ profile: prMath, form: { ...form, departmentId: 'math' } }).data.departmentId).toBe('math');
  });
  it('validates title, url, year, order', () => {
    expect(buildDocPayload({ profile: admin, form: { ...form, title: ' ' } }).error).toBe('กรุณากรอกชื่อเอกสาร');
    expect(buildDocPayload({ profile: admin, form: { ...form, url: 'javascript:alert(1)' } }).error).toBe('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://');
    expect(buildDocPayload({ profile: admin, form: { ...form, url: '' } }).error).toBe('ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://');
    expect(buildDocPayload({ profile: admin, form: { ...form, year: '25x9' } }).error).toBe('ปี พ.ศ. ไม่ถูกต้อง');
    expect(buildDocPayload({ profile: admin, form: { ...form, year: '1999' } }).error).toBe('ปี พ.ศ. ไม่ถูกต้อง');
    expect(buildDocPayload({ profile: admin, form: { ...form, order: 'abc' } }).error).toBe('ลำดับต้องเป็นตัวเลข');
  });
  it('blank order defaults to 0, blank category allowed', () => {
    const { data } = buildDocPayload({ profile: admin, form: { ...form, order: '', category: '' } });
    expect(data.order).toBe(0);
    expect(data.category).toBe('');
  });
  it('canManageDoc mirrors canUpdateScoped', () => {
    expect(canManageDoc(admin, { departmentId: null })).toBe(true);
    expect(canManageDoc(prc, { departmentId: 'sci' })).toBe(true);
    expect(canManageDoc(prMath, { departmentId: 'math' })).toBe(true);
    expect(canManageDoc(prMath, { departmentId: 'sci' })).toBe(false);
    expect(canManageDoc(prMath, { departmentId: null })).toBe(false);
    expect(canManageDoc({ ...admin, disabled: true }, {})).toBe(false);
  });
});
