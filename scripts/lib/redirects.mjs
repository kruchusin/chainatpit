// Pure builder for public/_redirects (Cloudflare Pages). Used by scripts/gen-redirects.mjs and tests.
import { googleSitesSlug } from './slug.mjs';

// Menu titles of the old Google Sites. splat: also redirect sub-pages (e.g. year archives).
export const REDIRECT_TITLES = [
  { title: 'ข้อมูลสถานศึกษา', target: '/about.html' },
  { title: 'คณะผู้บริหารและบุคลากร', target: '/staff.html' },
  { title: 'ข่าวประชาสัมพันธ์', target: '/news.html', splat: true },
  { title: 'ภาพกิจกรรม', target: '/gallery.html', splat: true },
  { title: 'ITA', target: '/ita.html' },
];

// A title whose slug already equals the page's clean URL (e.g. ita) needs no rule.
export function isSelfMapped(title, target) {
  return '/' + googleSitesSlug(title) === target.replace(/\.html$/, '');
}

export function buildRedirects(titles = REDIRECT_TITLES) {
  const lines = [
    '# สร้างโดย scripts/gen-redirects.mjs (อย่าแก้ด้วยมือ ถ้าจะเพิ่มกฎ ให้แก้ REDIRECT_TITLES ใน scripts/lib/redirects.mjs แล้วรันใหม่)',
    '# URL เดิมของ Google Sites -> หน้าใหม่ (301) ทั้งแบบตัวอักษรไทยและแบบ percent-encoded',
  ];
  const seen = new Set();
  const add = (from, to) => {
    // Cloudflare Pages already serves /ita.html at /ita; a rule /ita -> /ita.html would loop forever.
    if (from === to.replace(/\.html$/, '')) return;
    if (seen.has(from)) return;
    seen.add(from);
    lines.push(`${from} ${to} 301`);
  };
  for (const { title, target, splat } of titles) {
    const slug = googleSitesSlug(title);
    for (const base of [`/${slug}`, `/${encodeURIComponent(slug)}`]) {
      add(base, target);
      if (splat) add(`${base}/*`, target);
    }
  }
  return lines.join('\n') + '\n';
}
