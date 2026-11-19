import { mountLayout, renderNewsCard } from '../ui.js';
import { listNews } from '../data.js';

const { departments } = await mountLayout({ active: 'news' });
const list = document.getElementById('news-list');
const more = document.getElementById('load-more');
const select = document.getElementById('dept-filter');
let cursor = null;

select.append(new Option('ทุกหน่วยงาน', ''));
departments.forEach((d) => select.append(new Option(d.name, d.id)));

async function load(reset) {
  if (reset) { list.innerHTML = ''; cursor = null; }
  more.disabled = true;
  try {
    const { items, cursor: next } = await listNews({ departmentId: select.value || undefined, after: cursor || undefined });
    if (reset && !items.length) list.innerHTML = '<p class="muted">ไม่พบข่าวในหมวดนี้</p>';
    list.insertAdjacentHTML('beforeend', items.map(renderNewsCard).join(''));
    cursor = next;
  } catch (e) {
    console.error(e);
    list.insertAdjacentHTML('beforeend', '<p class="muted">ไม่สามารถโหลดข่าวได้ กรุณาลองใหม่อีกครั้ง</p>');
  }
  more.hidden = !cursor;
  more.disabled = false;
}

select.addEventListener('change', () => load(true));
more.addEventListener('click', () => load(false));
await load(true);
