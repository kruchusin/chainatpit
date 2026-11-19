import { mountLayout, esc, renderStaffCard, renderError } from '../ui.js';
import { listStaff } from '../data.js';

const { departments } = await mountLayout({ active: 'staff' });
const box = document.getElementById('staff-groups');
const tabs = [...document.querySelectorAll('.tab')];
let staff = [];

function render(type) {
  // departments arrive sorted by order; staff by order. A member in several departments shows in each.
  const groups = departments.filter((d) => d.type === type).map((d) => ({
    dept: d, members: staff.filter((s) => (s.departmentIds || []).includes(d.id)),
  })).filter((g) => g.members.length);
  box.innerHTML = groups.length ? groups.map((g) => `<section class="staff-group" aria-labelledby="g-${esc(g.dept.id)}">
<h2 id="g-${esc(g.dept.id)}"><a href="/department.html?id=${encodeURIComponent(g.dept.id)}">${esc(g.dept.name)}</a></h2>
<div class="staff-grid">${g.members.map(renderStaffCard).join('')}</div></section>`).join('')
    : '<p class="muted">ไม่พบข้อมูล</p>';
}

tabs.forEach((t) => t.addEventListener('click', () => {
  tabs.forEach((x) => x.setAttribute('aria-pressed', String(x === t)));
  render(t.dataset.type);
}));

try {
  staff = await listStaff();
  render('subject');
} catch (e) { renderError(box, e); }
