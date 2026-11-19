import { mountLayout, renderDocumentList, renderError } from '../ui.js';
import { listDocuments } from '../data.js';

await mountLayout({ active: 'documents' });
const list = document.getElementById('doc-list');
const select = document.getElementById('cat-filter');
try {
  // ITA documents have their own page
  const docs = (await listDocuments()).filter((d) => d.category !== 'ITA');
  const cats = [...new Set(docs.map((d) => d.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'th'));
  select.append(new Option('ทุกหมวดหมู่', ''));
  cats.forEach((c) => select.append(new Option(c, c)));
  const render = () => { list.innerHTML = renderDocumentList(select.value ? docs.filter((d) => d.category === select.value) : docs); };
  select.addEventListener('change', render);
  render();
} catch (e) { renderError(list, e); }
