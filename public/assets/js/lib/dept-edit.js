// Pure helpers for the departments editor.
export const DEPT_TYPES = ['subject', 'division', 'unit'];
export const DEPT_TYPE_LABELS = { subject: 'กลุ่มสาระ', division: 'ฝ่ายงาน', unit: 'หน่วยงาน' };
const HTTP = /^https?:\/\/\S+$/i;

// admin: name/type/description/externalUrl (+coverUrl); PR: description/coverUrl only.
// old === null means create. Returns {data} (changed fields; everything on create) or {error}.
export function buildDeptPatch({ old, form, admin }) {
  const o = old || {};
  const data = {};
  const put = (k, v) => { if (!old || v !== String(o[k] ?? '')) data[k] = v; };
  if (admin) {
    const name = String(form.name ?? '').trim();
    if (!name) return { error: 'กรุณากรอกชื่อหน่วยงาน' };
    if (!DEPT_TYPES.includes(form.type)) return { error: 'ประเภทหน่วยงานไม่ถูกต้อง' };
    const url = String(form.externalUrl ?? '').trim();
    if (url && !HTTP.test(url)) return { error: 'ลิงก์ภายนอกต้องขึ้นต้นด้วย http:// หรือ https://' };
    put('name', name);
    put('type', form.type);
    put('externalUrl', url);
  }
  if (form.description !== undefined) put('description', String(form.description).trim());
  if (form.coverUrl !== undefined && (old ? form.coverUrl !== String(o.coverUrl ?? '') : form.coverUrl)) data.coverUrl = form.coverUrl;
  return { data };
}
