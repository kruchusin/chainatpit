import { describe, it, expect } from 'vitest';
import { buildSettingsPayload, SETTINGS_KEYS } from '../../public/assets/js/lib/settings-edit.js';

const sanitize = (h) => h.replace(/<script[\s\S]*?<\/script>/g, '');
const base = {
  schoolName: ' โรงเรียน ', logoUrl: 'https://x/logo.jpg', address: ' ที่อยู่ ', phone: '056', facebookUrl: 'https://facebook.com/x',
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
});
