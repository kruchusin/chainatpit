import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { googleSitesSlug } from '../../scripts/lib/slug.mjs';
import { REDIRECT_TITLES, buildRedirects, isSelfMapped } from '../../scripts/lib/redirects.mjs';

describe('googleSitesSlug', () => {
  it('strips Thai combining marks', () => {
    expect(googleSitesSlug('ข่าวประชาสัมพันธ์')).toBe('ขาวประชาสมพนธ');
    expect(googleSitesSlug('ข้อมูลสถานศึกษา')).toBe('ขอมลสถานศกษา');
    expect(googleSitesSlug('คณะผู้บริหารและบุคลากร')).toBe('คณะผบรหารและบคลากร');
    expect(googleSitesSlug('ภาพกิจกรรม')).toBe('ภาพกจกรรม');
  });
  it('turns spaces into hyphens', () => {
    expect(googleSitesSlug('ปีการศึกษา 2569')).toBe('ปการศกษา-2569');
  });
  it('keeps ASCII titles (lowercased)', () => {
    expect(googleSitesSlug('ITA')).toBe('ita');
  });
});

describe('public/_redirects', () => {
  const text = readFileSync(new URL('../../public/_redirects', import.meta.url), 'utf8');
  const rules = text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => {
    const [from, to, status] = l.split(/\s+/);
    return { from, to, status };
  });

  it('matches the generator output', () => {
    expect(text).toBe(buildRedirects());
  });
  it('has a 301 rule for every known title, raw and percent-encoded', () => {
    for (const { title, target, splat } of REDIRECT_TITLES) {
      if (isSelfMapped(title, target)) {
        // Pages serves /ita.html at /ita already; a rule would loop.
        expect(rules.find((x) => x.from === '/' + googleSitesSlug(title))).toBeUndefined();
        expect(existsSync(new URL('../../public' + target, import.meta.url))).toBe(true);
        continue;
      }
      const raw = '/' + googleSitesSlug(title);
      const enc = '/' + encodeURIComponent(googleSitesSlug(title));
      const forms = splat ? [raw, raw + '/*', enc, enc + '/*'] : [raw, enc];
      for (const from of forms) {
        const r = rules.find((x) => x.from === from);
        expect(r).toBeDefined();
        expect(r.to).toBe(target);
        expect(r.status).toBe('301');
      }
    }
  });
  it('every target is an existing file in public/', () => {
    expect(rules.length).toBeGreaterThan(0);
    for (const r of rules) {
      expect(r.status).toBe('301');
      expect(existsSync(new URL('../../public' + r.to, import.meta.url))).toBe(true);
    }
  });
});
