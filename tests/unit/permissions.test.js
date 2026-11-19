import { describe, it, expect } from 'vitest';
import {
  isAdmin, isPrCentral, prDepts, canWriteNewsFor, canEditStaff,
  editableStaffFields, canEditDepartment, menuFor,
} from '../../public/assets/js/lib/permissions.js';

const admin = { uid: 'admin', role: 'admin', prDepartments: [], disabled: false };
const prc = { uid: 'prc', role: 'pr_central', prDepartments: [], disabled: false };
const prMath = { uid: 'prMath', role: 'teacher', prDepartments: ['math'], disabled: false };
const prMulti = { uid: 'prMulti', role: 'teacher', prDepartments: ['math', 'academic'], disabled: false };
const t1 = { uid: 't1', role: 'teacher', prDepartments: [], disabled: false, staffId: 's1' };
const off = { uid: 'off', role: 'admin', prDepartments: [], disabled: true };
const s1 = { uid: 't1', departmentIds: ['math', 'academic'], active: true };
const s2 = { uid: null, departmentIds: ['sci'], active: true };

describe('permissions', () => {
  it('role helpers', () => {
    expect(isAdmin(admin)).toBe(true);
    expect(isAdmin(off)).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isPrCentral(prc)).toBe(true);
    expect(isPrCentral({ ...prc, disabled: true })).toBe(false);
    expect(prDepts(prMath)).toEqual(['math']);
    expect(prDepts({ role: 'teacher' })).toEqual([]);
    expect(prDepts({ ...prMath, disabled: true })).toEqual([]);
  });

  it('canWriteNewsFor', () => {
    expect(canWriteNewsFor(prMulti, ['math', 'sci'])).toBe(false);
    expect(canWriteNewsFor(prMulti, ['math', 'academic'])).toBe(true);
    expect(canWriteNewsFor(prMath, [])).toBe(false);
    expect(canWriteNewsFor(prc, [])).toBe(true);
    expect(canWriteNewsFor(admin, ['sci'])).toBe(true);
    expect(canWriteNewsFor(t1, ['math'])).toBe(false);
    expect(canWriteNewsFor(off, [])).toBe(false);
    expect(canWriteNewsFor({ ...prMath, disabled: true }, ['math'])).toBe(false);
  });

  it('canEditStaff', () => {
    expect(canEditStaff(admin, s2)).toBe(true);
    expect(canEditStaff(t1, s1)).toBe(true);
    expect(canEditStaff(t1, s2)).toBe(false);
    expect(canEditStaff(prMath, s1)).toBe(true);
    expect(canEditStaff(prMath, s2)).toBe(false);
    expect(canEditStaff(prc, s1)).toBe(false);
    expect(canEditStaff(off, s1)).toBe(false);
  });

  it('editableStaffFields', () => {
    expect(editableStaffFields(t1, s1)).toEqual(['photoUrl', 'bio', 'education', 'email']);
    expect(editableStaffFields(prMath, s1)).toContain('position');
    expect(editableStaffFields(prMath, s1)).not.toContain('uid');
    expect(editableStaffFields(admin, s2)).toEqual([
      'prefix', 'name', 'position', 'photoUrl', 'bio', 'education', 'email',
      'departmentIds', 'uid', 'order', 'active']);
    expect(editableStaffFields(prMath, s2)).toEqual([]);
    expect(editableStaffFields(off, s1)).toEqual([]);
    const both = { uid: 't1', role: 'teacher', prDepartments: ['math'], disabled: false };
    expect(editableStaffFields(both, s1)).toEqual([
      'prefix', 'name', 'position', 'photoUrl', 'bio', 'education', 'email',
      'departmentIds', 'order', 'active']);
  });

  it('canEditDepartment', () => {
    expect(canEditDepartment(admin, 'sci')).toBe(true);
    expect(canEditDepartment(prMath, 'math')).toBe(true);
    expect(canEditDepartment(prMath, 'sci')).toBe(false);
    expect(canEditDepartment(prc, 'math')).toBe(false);
    expect(canEditDepartment(off, 'math')).toBe(false);
  });

  it('menuFor', () => {
    expect(menuFor(t1)).toEqual(['profile']);
    expect(menuFor(prMath)).toEqual(['profile', 'news', 'staff', 'departments', 'documents']);
    expect(menuFor(prc)).toEqual(['profile', 'news', 'documents']);
    expect(menuFor(admin)).toEqual(['profile', 'news', 'staff', 'departments', 'documents', 'users', 'settings']);
    expect(menuFor({ ...admin, disabled: true })).toEqual([]);
    expect(menuFor(null)).toEqual([]);
  });
});
