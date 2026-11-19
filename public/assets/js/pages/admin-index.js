import { requireLogin } from '../auth-guard.js';
import { mountAdminLayout, menuEntries } from '../admin-ui.js';
import { esc } from '../ui.js';

const { profile, staff } = await requireLogin();
mountAdminLayout(profile, { active: 'home' });

const name = staff ? [staff.prefix, staff.name].filter(Boolean).join('') : profile.email;
document.getElementById('greeting').textContent = `สวัสดี ${name || ''}`.trim();
document.getElementById('menu-cards').innerHTML = menuEntries(profile)
  .map((i) => `<li><a href="${i.href}">${esc(i.label)}</a></li>`).join('');
