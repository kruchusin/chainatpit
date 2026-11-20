// Pure helpers for the "ข้อมูลสถานศึกษา" sub-pages (collection `pages`). No URL imports: testable in Node.

export const DEFAULT_PAGE_TITLES = [
  'ประวัติโรงเรียน', 'อัตลักษณ์', 'พันธกิจ วิสัยทัศน์ เป้าหมาย', 'เพลงประจำโรงเรียน',
  'โครงสร้างบริหารงานโรงเรียน', 'คณะกรรมการสถานศึกษาขั้นพื้นฐาน', 'ทำเนียบผู้บริหารโรงเรียน',
  'แผนผังโรงเรียน', 'จำนวนผู้บริหาร ครูและบุคลากร', 'จำนวนนักเรียน',
];

// Must match the keys allowed by firestore.rules (match /pages/{id}).
export const PAGE_KEYS = ['title', 'bodyHtml', 'order', 'published'];
export const TITLE_MAX = 100;
export const BODY_MAX = 500000; // Firestore docs are capped at 1 MiB

const EMPTY_BODY = /^(\s|<p>(\s|<br\s*\/?>)*<\/p>)*$/i;

// form: {title, bodyHtml, order, published}. Returns {data} (exactly PAGE_KEYS) or {error} (Thai).
export function buildPagePayload(form, sanitize) {
  const title = String(form.title ?? '').trim();
  if (!title) return { error: 'กรุณากรอกชื่อหัวข้อ' };
  if (title.length > TITLE_MAX) return { error: `ชื่อหัวข้อต้องยาวไม่เกิน ${TITLE_MAX} ตัวอักษร` };
  let bodyHtml = sanitize(String(form.bodyHtml ?? ''));
  if (EMPTY_BODY.test(bodyHtml)) bodyHtml = '';
  if (bodyHtml.length > BODY_MAX) return { error: 'เนื้อหายาวเกินไป กรุณาแบ่งเป็นหลายหัวข้อ' };
  const order = Number.isFinite(Number(form.order)) ? Math.trunc(Number(form.order)) : 0;
  return { data: { title, bodyHtml, order, published: !!form.published } };
}

export function sortPages(pages) {
  return [...pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)
    || String(a.title ?? '').localeCompare(String(b.title ?? ''), 'th'));
}
