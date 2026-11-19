import { mountLayout, renderDocumentList, renderError } from '../ui.js';
import { listDocuments } from '../data.js';

await mountLayout({ active: 'ita' });
const list = document.getElementById('doc-list');
try {
  const docs = (await listDocuments({ category: 'ITA' })).sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  list.innerHTML = renderDocumentList(docs);
} catch (e) { renderError(list, e); }
