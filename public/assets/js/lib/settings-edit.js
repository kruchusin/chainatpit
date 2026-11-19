// Pure helper for the site settings page. Field names are the ones the public pages read
// (ui.js: schoolName/logoUrl/address/phone; contact.js: facebookUrl; about.js: aboutHtml/executives).
// email: safe mailto address or ''; welcomeText: plain text shown in the home hero (index.js).
// banners: [{imageUrl, linkUrl}] (no public page reads it yet).
import { safeEmail } from './email.js';

export const SETTINGS_KEYS = ['schoolName', 'logoUrl', 'banners', 'address', 'phone', 'email', 'welcomeText', 'facebookUrl', 'aboutHtml', 'executives'];
const HTTP = /^https?:\/\/\S+$/i;
const WELCOME_MAX = 300;
const t = (v) => String(v ?? '').trim();

// -> {data} | {error}. `sanitize` is injected (DOMPurify lives on window).
export function buildSettingsPayload({ form, sanitize }) {
  const schoolName = t(form.schoolName);
  if (!schoolName) return { error: 'กรุณากรอกชื่อโรงเรียน' };
  const facebookUrl = t(form.facebookUrl);
  if (facebookUrl && !HTTP.test(facebookUrl)) return { error: 'ลิงก์ Facebook ต้องขึ้นต้นด้วย http:// หรือ https://' };
  const email = t(form.email);
  if (email && !safeEmail(email)) return { error: 'อีเมลไม่ถูกต้อง' };
  const welcomeText = t(form.welcomeText).replace(/\s*[\r\n]+\s*/g, ' ');
  if (welcomeText.length > WELCOME_MAX) return { error: `ข้อความต้อนรับยาวเกินไป (ไม่เกิน ${WELCOME_MAX} ตัวอักษร)` };
  const banners = [];
  for (const b of Array.isArray(form.banners) ? form.banners : []) {
    const imageUrl = t(b.imageUrl);
    if (!imageUrl) continue;
    const linkUrl = t(b.linkUrl);
    if (linkUrl && !HTTP.test(linkUrl)) return { error: 'ลิงก์แบนเนอร์ต้องขึ้นต้นด้วย http:// หรือ https://' };
    banners.push({ imageUrl, linkUrl });
  }
  const executives = (Array.isArray(form.executives) ? form.executives : [])
    .map((x) => ({ name: t(x.name), position: t(x.position), photoUrl: t(x.photoUrl) }))
    .filter((x) => x.name);
  return {
    data: {
      schoolName, logoUrl: t(form.logoUrl), banners, address: t(form.address), phone: t(form.phone), email, welcomeText,
      facebookUrl, aboutHtml: sanitize(String(form.aboutHtml ?? '')), executives,
    },
  };
}
