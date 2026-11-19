// UI-only mirror of firestore.rules. Never rely on this for security.
// p = { uid, role, prDepartments, disabled, staffId }

export const STAFF_FIELDS = [
  'prefix', 'name', 'position', 'photoUrl', 'bio', 'education', 'email',
  'departmentIds', 'uid', 'order', 'active',
];
const SELF_FIELDS = ['photoUrl', 'bio', 'education', 'email'];

const active = (p) => !!p && p.disabled !== true;

export function isAdmin(p) {
  return active(p) && p.role === 'admin';
}

export function isPrCentral(p) {
  return active(p) && p.role === 'pr_central';
}

export function prDepts(p) {
  return active(p) && Array.isArray(p.prDepartments) ? p.prDepartments : [];
}

const isCentral = (p) => isAdmin(p) || isPrCentral(p);

export function canWriteNewsFor(p, departmentIds) {
  if (!active(p)) return false;
  if (isCentral(p)) return true;
  const ids = Array.isArray(departmentIds) ? departmentIds : [];
  const mine = prDepts(p);
  return ids.length > 0 && ids.every((id) => mine.includes(id));
}

function isStaffSelf(p, staff) {
  return active(p) && !!p.uid && !!staff && staff.uid === p.uid;
}

function isStaffPr(p, staff) {
  const mine = prDepts(p);
  const ids = staff && Array.isArray(staff.departmentIds) ? staff.departmentIds : [];
  return ids.some((id) => mine.includes(id));
}

export function canEditStaff(p, staff) {
  return isAdmin(p) || isStaffSelf(p, staff) || isStaffPr(p, staff);
}

export function editableStaffFields(p, staff) {
  if (isAdmin(p)) return [...STAFF_FIELDS];
  const allowed = new Set();
  if (isStaffPr(p, staff)) STAFF_FIELDS.forEach((f) => f !== 'uid' && allowed.add(f));
  if (isStaffSelf(p, staff)) SELF_FIELDS.forEach((f) => allowed.add(f));
  return STAFF_FIELDS.filter((f) => allowed.has(f));
}

export function canEditDepartment(p, deptId) {
  return isAdmin(p) || prDepts(p).includes(deptId);
}

export function menuFor(p) {
  if (!active(p)) return [];
  const menu = ['profile'];
  if (isCentral(p) || prDepts(p).length > 0) menu.push('news');
  if (isAdmin(p) || prDepts(p).length > 0) menu.push('staff', 'departments');
  if (isCentral(p) || prDepts(p).length > 0) menu.push('documents');
  if (isAdmin(p)) menu.push('users', 'settings');
  return menu;
}
