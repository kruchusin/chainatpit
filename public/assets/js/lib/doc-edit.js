// Pure helpers for the documents admin page. Keys mirror firestore.rules docKeysOk().
export const DOC_KEYS = ['title', 'url', 'category', 'departmentId', 'year', 'order'];
const HTTP = /^https?:\/\/\S+$/i;
const URL_MESSAGE = 'ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://';

const active = (p) => !!p && p.disabled !== true;
const central = (p) => active(p) && (p.role === 'admin' || p.role === 'pr_central');
const mine = (p) => (active(p) && Array.isArray(p.prDepartments) ? p.prDepartments : []);

export const thaiYearNow = (d = new Date()) => d.getFullYear() + 543;

// Mirrors canUpdateScoped/canDeleteScoped for a stored document.
export function canManageDoc(p, doc) {
  if (!active(p)) return false;
  if (central(p)) return true;
  const id = doc && doc.departmentId;
  return !!id && mine(p).includes(id);
}

// form values are strings. -> {data} (exactly DOC_KEYS) | {error}
export function buildDocPayload({ profile, form }) {
  const title = String(form.title ?? '').trim();
  if (!title) return { error: 'กรุณากรอกชื่อเอกสาร' };
  const url = String(form.url ?? '').trim();
  if (!HTTP.test(url)) return { error: URL_MESSAGE };
  const yearStr = String(form.year ?? '').trim();
  const year = Number(yearStr);
  if (!/^\d{4}$/.test(yearStr) || year < 2400 || year > 2700) return { error: 'ปี พ.ศ. ไม่ถูกต้อง' };
  const orderStr = String(form.order ?? '').trim();
  if (orderStr && !/^-?\d+$/.test(orderStr)) return { error: 'ลำดับต้องเป็นตัวเลข' };
  const departmentId = String(form.departmentId ?? '').trim() || null;
  if (!central(profile)) {
    if (!departmentId) return { error: 'กรุณาเลือกฝ่าย/กลุ่มสาระ' };
    if (!mine(profile).includes(departmentId)) return { error: 'คุณจัดการเอกสารของฝ่ายนี้ไม่ได้' };
  }
  return { data: { title, url, category: String(form.category ?? '').trim(), departmentId, year, order: orderStr ? Number(orderStr) : 0 } };
}
