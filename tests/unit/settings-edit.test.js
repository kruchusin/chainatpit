import { describe, it, expect } from 'vitest';
import { buildSettingsPayload, SETTINGS_KEYS } from '../../public/assets/js/lib/settings-edit.js';

const sanitize = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '');
const base = {
  schoolName: ' โรงเรียน ', logoUrl: 'https://x/logo.jpg', address: ' ที่อยู่ ', phone: '056', email: ' info@school.ac.th ', welcomeText: ' ยินดีต้อนรับ ', facebookUrl: 'https://facebook.com/x',
  aboutHtml: '<p>a</p><script>1</script>',
  banners: [{ imageUrl: 'https://x/b.jpg', linkUrl: '' }, { imageUrl: '', linkUrl: 'https://y' }],
  executives: [{ name: ' นายก ', position: 'ผอ.', photoUrl: 'https://x/e.jpg' }, { name: '', position: 'x', photoUrl: '' }],
};

describe('buildSettingsPayload', () => {
  it('keeps the public field names and sanitizes aboutHtml', () => {
    const { data } = buildSettingsPayload({ form: base, sanitize });
    expect(Object.keys(data).sort()).toEqual([...SETTINGS_KEYS].sort());
    expect(data.schoolName).toBe('โรงเรียน');
    expect(data.address).toBe('ที่อยู่');
    expect(data.aboutHtml).toBe('<p>a</p>');
  });
  it('drops empty banners and nameless executives; trims', () => {
    const { data } = buildSettingsPayload({ form: base, sanitize });
    expect(data.banners).toEqual([{ imageUrl: 'https://x/b.jpg', linkUrl: '' }]);
    expect(data.executives).toEqual([{ name: 'นายก', position: 'ผอ.', photoUrl: 'https://x/e.jpg' }]);
  });
  it('requires school name', () => {
    expect(buildSettingsPayload({ form: { ...base, schoolName: '  ' }, sanitize }).error).toBe('กรุณากรอกชื่อโรงเรียน');
  });
  it('rejects non-http facebook / banner link', () => {
    expect(buildSettingsPayload({ form: { ...base, facebookUrl: 'javascript:x' }, sanitize }).error).toBe('ลิงก์ Facebook ต้องขึ้นต้นด้วย http:// หรือ https://');
    expect(buildSettingsPayload({ form: { ...base, banners: [{ imageUrl: 'https://x/b.jpg', linkUrl: 'ftp://z' }] }, sanitize }).error)
      .toBe('ลิงก์แบนเนอร์ต้องขึ้นต้นด้วย http:// หรือ https://');
  });
  it('blank facebook allowed', () => {
    expect(buildSettingsPayload({ form: { ...base, facebookUrl: '' }, sanitize }).data.facebookUrl).toBe('');
  });
  it('trims email and welcomeText and includes them in the payload', () => {
    const { data } = buildSettingsPayload({ form: base, sanitize });
    expect(data.email).toBe('info@school.ac.th');
    expect(data.welcomeText).toBe('ยินดีต้อนรับ');
    expect(SETTINGS_KEYS).toContain('email');
    expect(SETTINGS_KEYS).toContain('welcomeText');
  });
  it('blank email and welcomeText allowed', () => {
    const { data } = buildSettingsPayload({ form: { ...base, email: '', welcomeText: '' }, sanitize });
    expect(data.email).toBe(''); expect(data.welcomeText).toBe('');
  });
  it('rejects an email unsafe for mailto:', () => {
    for (const email of ['not-an-email', 'a@b.co?bcc=x@y.z', 'a b@c.de']) {
      expect(buildSettingsPayload({ form: { ...base, email }, sanitize }).error).toBe('อีเมลไม่ถูกต้อง');
    }
  });
  it('caps welcomeText at 300 characters and strips newlines', () => {
    expect(buildSettingsPayload({ form: { ...base, welcomeText: 'ก'.repeat(301) }, sanitize }).error).toBe('ข้อความต้อนรับยาวเกินไป (ไม่เกิน 300 ตัวอักษร)');
    expect(buildSettingsPayload({ form: { ...base, welcomeText: 'a\nb' }, sanitize }).data.welcomeText).toBe('a b');
  });
});
