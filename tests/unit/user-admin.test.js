import { describe, it, expect } from 'vitest';
import { validateCreateAccount, checkRoleChange, joinUsersWithStaff, ROLE_LABELS, RECOVERED_MESSAGE } from '../../public/assets/js/lib/user-admin.js';

describe('validateCreateAccount', () => {
  const ok = { staffId: 's2', email: ' Teacher@Example.com ', password: 'abcdefgh', role: 'teacher' };
  it('accepts and normalises', () => {
    expect(validateCreateAccount(ok)).toEqual({ data: { staffId: 's2', email: 'teacher@example.com', password: 'abcdefgh', role: 'teacher' } });
  });
  it('requires staff', () => expect(validateCreateAccount({ ...ok, staffId: '' }).error).toBe('กรุณาเลือกบุคลากร'));
  it('rejects bad email', () => expect(validateCreateAccount({ ...ok, email: 'nope' }).error).toBe('อีเมลไม่ถูกต้อง'));
  it('rejects password under 8', () => expect(validateCreateAccount({ ...ok, password: '1234567' }).error).toBe('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'));
  it('accepts exactly 8', () => expect(validateCreateAccount({ ...ok, password: '12345678' }).data).toBeDefined());
  it('rejects unknown role', () => expect(validateCreateAccount({ ...ok, role: 'root' }).error).toBe('บทบาทไม่ถูกต้อง'));
});

describe('checkRoleChange', () => {
  it('blocks demoting yourself from admin', () => {
    expect(checkRoleChange({ callerUid: 'a', targetUid: 'a', currentRole: 'admin', role: 'teacher', prDepartments: [] }).error)
      .toBe('ไม่สามารถลดสิทธิ์ของตัวเองได้');
  });
  it('allows admin keeping admin on self (prDepartments edit)', () => {
    expect(checkRoleChange({ callerUid: 'a', targetUid: 'a', currentRole: 'admin', role: 'admin', prDepartments: ['math'] }).data)
      .toEqual({ role: 'admin', prDepartments: ['math'] });
  });
  it('allows changing others', () => {
    expect(checkRoleChange({ callerUid: 'a', targetUid: 'b', currentRole: 'admin', role: 'teacher', prDepartments: [] }).data)
      .toEqual({ role: 'teacher', prDepartments: [] });
  });
  it('rejects unknown role and dedupes departments', () => {
    expect(checkRoleChange({ callerUid: 'a', targetUid: 'b', currentRole: 'teacher', role: 'x', prDepartments: [] }).error).toBe('บทบาทไม่ถูกต้อง');
    expect(checkRoleChange({ callerUid: 'a', targetUid: 'b', currentRole: 'teacher', role: 'teacher', prDepartments: ['math', 'math', ''] }).data.prDepartments).toEqual(['math']);
  });
});

describe('joinUsersWithStaff', () => {
  it('joins by staffId and falls back to uid link, sorted by name', () => {
    const users = [{ uid: 'u1', staffId: 's1', email: 'b@x.th' }, { uid: 'u2', email: 'a@x.th' }, { uid: 'u3', staffId: 'gone', email: 'c@x.th' }];
    const staff = [{ id: 's1', prefix: 'นาย', name: 'สมชาย', uid: 'u1' }, { id: 's2', prefix: 'นาง', name: 'กนก', uid: 'u2' }];
    const rows = joinUsersWithStaff(users, staff);
    expect(rows.map((r) => r.uid)).toEqual(['u2', 'u1', 'u3']);
    expect(rows[0].staffName).toBe('นางกนก');
    expect(rows[1].staffName).toBe('นายสมชาย');
    expect(rows[2].staffName).toBe('');
  });
});

it('constants', () => {
  expect(ROLE_LABELS.admin).toBe('ผู้ดูแลระบบ');
  expect(RECOVERED_MESSAGE).toBe('กู้คืนบัญชีที่สร้างไม่สำเร็จก่อนหน้านี้เรียบร้อยแล้ว');
});
