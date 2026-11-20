// Admin layout (header + menu). Kept apart from ui.js, which is public-only.
import { menuFor } from './lib/permissions.js';
import { auth, authSdk } from './firebase.js';
import { esc } from './ui.js';

export const MENU_ITEMS = {
  profile: { label: 'ข้อมูลของฉัน', href: '/admin/profile.html' },
  news: { label: 'ข่าวประชาสัมพันธ์', href: '/admin/news.html' },
  staff: { label: 'บุคลากร', href: '/admin/staff.html' },
  departments: { label: 'กลุ่มสาระ/ฝ่ายงาน', href: '/admin/departments.html' },
  documents: { label: 'เอกสาร', href: '/admin/documents.html' },
  pages: { label: 'ข้อมูลสถานศึกษา', href: '/admin/pages.html' },
  users: { label: 'ผู้ใช้และสิทธิ์', href: '/admin/users.html' },
  settings: { label: 'ตั้งค่าเว็บไซต์', href: '/admin/settings.html' },
};

export function menuEntries(profile) {
  return menuFor(profile).filter((k) => MENU_ITEMS[k]).map((k) => ({ key: k, ...MENU_ITEMS[k] }));
}

// Later admin pages call this first. Returns true when allowed; otherwise redirects.
export function requireMenu(profile, key) {
  if (menuFor(profile).includes(key)) return true;
  location.replace('/admin/index.html');
  return false;
}

export function mountAdminLayout(profile, { active } = {}) {
  const header = document.getElementById('admin-header');
  if (header) {
    const items = menuEntries(profile);
    header.innerHTML = `<a class="skip-link" href="#main">ข้ามไปยังเนื้อหา</a>
<div class="admin-bar">
  <a class="admin-brand" href="/admin/index.html">หลังบ้าน</a>
  <span class="admin-user">${esc(profile.email || '')}</span>
  <button type="button" class="btn btn-outline" id="logout-btn">ออกจากระบบ</button>
</div>
<nav class="admin-nav" aria-label="เมนูหลังบ้าน"><ul>${items.map((i) =>
    `<li><a href="${i.href}"${active === i.key ? ' aria-current="page"' : ''}>${esc(i.label)}</a></li>`).join('')}</ul></nav>`;
    header.querySelector('#logout-btn').addEventListener('click', async () => {
      try { await authSdk.signOut(auth); } finally { location.replace('/admin/login.html'); }
    });
  }
}
