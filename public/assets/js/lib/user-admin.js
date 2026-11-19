// Pure helpers for the users admin page.
export const ROLES = ['admin', 'pr_central', 'teacher'];
export const ROLE_LABELS = { admin: 'ผู้ดูแลระบบ', pr_central: 'ผู้ประชาสัมพันธ์ส่วนกลาง', teacher: 'ครู/บุคลากร' };
export const RECOVERED_MESSAGE = 'กู้คืนบัญชีที่สร้างไม่สำเร็จก่อนหน้านี้เรียบร้อยแล้ว';
export const SELF_DEMOTE_MESSAGE = 'ไม่สามารถลดสิทธิ์ของตัวเองได้';
export const MIN_PASSWORD = 8;
export const PASSWORD_MESSAGE = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// -> {data:{staffId,email,password,role}} | {error}
export function validateCreateAccount({ staffId, email, password, role }) {
  if (!staffId) return { error: 'กรุณาเลือกบุคลากร' };
  const mail = String(email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(mail)) return { error: 'อีเมลไม่ถูกต้อง' };
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return { error: PASSWORD_MESSAGE };
  if (!ROLES.includes(role)) return { error: 'บทบาทไม่ถูกต้อง' };
  return { data: { staffId, email: mail, password, role } };
}

// -> {data:{role,prDepartments}} | {error}
export function checkRoleChange({ callerUid, targetUid, currentRole, role, prDepartments }) {
  if (!ROLES.includes(role)) return { error: 'บทบาทไม่ถูกต้อง' };
  if (callerUid === targetUid && currentRole === 'admin' && role !== 'admin') return { error: SELF_DEMOTE_MESSAGE };
  const depts = [...new Set((Array.isArray(prDepartments) ? prDepartments : []).filter((d) => typeof d === 'string' && d))];
  return { data: { role, prDepartments: depts } };
}

// Rows for the table: users joined with staff names (by staffId, else by staff.uid), sorted by name then email.
export function joinUsersWithStaff(users, staff) {
  const byId = new Map(staff.map((s) => [s.id, s]));
  const byUid = new Map(staff.filter((s) => s.uid).map((s) => [s.uid, s]));
  return users.map((u) => {
    const s = (u.staffId && byId.get(u.staffId)) || byUid.get(u.uid);
    return { ...u, staffName: s ? [s.prefix, s.name].filter(Boolean).join('') : '' };
  }).sort((a, b) => (a.staffName || '￿').localeCompare(b.staffName || '￿', 'th')
    || String(a.email).localeCompare(String(b.email)));
}
