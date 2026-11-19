// Pure helpers for the staff editor (no URL imports: testable in Node).
import { safeEmail } from './email.js';

// A dept PR may only add/remove ids they own. Foreign ids in oldIds are always kept.
// oldIds: stored ids; checkedOwnIds: ticked boxes; ownIds: ids this user may change.
export function mergeDepartmentIds(oldIds, checkedOwnIds, ownIds) {
  const old = Array.isArray(oldIds) ? oldIds : [];
  const own = new Set(Array.isArray(ownIds) ? ownIds : []);
  const checked = new Set((Array.isArray(checkedOwnIds) ? checkedOwnIds : []).filter((id) => own.has(id)));
  const out = [];
  for (const id of old) {
    if ((!own.has(id) || checked.has(id)) && !out.includes(id)) out.push(id);
  }
  for (const id of checked) if (!out.includes(id)) out.push(id);
  return out;
}

// `first` is shown above `second`; returns the two writes that move `second` above `first`.
export function swapOrders(first, second) {
  const a = first.order ?? 0;
  const b = second.order ?? 0;
  if (a === b) return [{ id: first.id, order: a }, { id: second.id, order: a - 1 }];
  return [{ id: first.id, order: b }, { id: second.id, order: a }];
}

const TEXT_KEYS = ['prefix', 'name', 'position', 'bio', 'education'];

// form: {prefix,name,position,bio,education,email, checkedDeptIds}. photoUrl is added by the page after upload.
// Returns {data} with only changed, editable fields, or {error} (Thai).
export function buildStaffPatch({ old, form, editable, ownIds }) {
  const can = (k) => editable.includes(k);
  const data = {};
  for (const k of TEXT_KEYS) {
    if (!can(k) || form[k] === undefined) continue;
    const v = String(form[k]).trim();
    if (k === 'name' && !v) return { error: 'กรุณากรอกชื่อ-สกุล' };
    if (v !== String(old[k] ?? '')) data[k] = v;
  }
  if (can('email') && form.email !== undefined) {
    const v = String(form.email).trim();
    if (v && !safeEmail(v)) return { error: 'รูปแบบอีเมลไม่ถูกต้อง' };
    if (v !== String(old.email ?? '')) data.email = v;
  }
  // ownIds = only the ids that actually have a checkbox; with none, departmentIds is left out entirely
  if (can('departmentIds') && Array.isArray(form.checkedDeptIds) && Array.isArray(ownIds) && ownIds.length) {
    const oldIds = Array.isArray(old.departmentIds) ? old.departmentIds : [];
    const next = mergeDepartmentIds(oldIds, form.checkedDeptIds, ownIds);
    const same = next.length === oldIds.length && next.every((id) => oldIds.includes(id));
    if (!same) data.departmentIds = next;
  }
  if (can('active') && typeof form.active === 'boolean' && form.active !== (old.active === true)) data.active = form.active;
  if (can('photoUrl') && form.photoUrl && form.photoUrl !== old.photoUrl) data.photoUrl = form.photoUrl;
  return { data };
}
