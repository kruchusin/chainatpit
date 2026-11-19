// One-time scraper for the old Google Sites website. Not part of the deployed site.
//   node migration/scrape-legacy.mjs --year 2569 --url <archive-url>   -> migration/out/news-2569.json
//   node migration/scrape-legacy.mjs --staff <url> --dept math         -> migration/out/staff-math.json
// Output is for HUMAN REVIEW (edit/delete entries) before scripts/import-legacy.mjs. See migration/README.md.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseNewsArchive, parseStaffPage } from './lib/blocks.mjs';
import { parseThaiDate } from './lib/thai-date.mjs';

export { parseNewsArchive, parseStaffPage, parseThaiDate };

const DEPTS = ['thai', 'math', 'sci', 'social', 'health', 'art', 'career', 'foreign',
  'academic', 'personnel', 'budget', 'general', 'executive', 'guidance', 'office', 'support'];

function arg(args, name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (school-site-migration)' } });
  if (!res.ok) throw new Error(`ดึงหน้าไม่สำเร็จ ${res.status} ${url}`);
  return res.text();
}

function writeOut(file, data) {
  const dir = fileURLToPath(new URL('./out/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  const path = `${dir}${file}`;
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  return path;
}

async function main(args) {
  const year = arg(args, '--year');
  const url = arg(args, '--url');
  const staffUrl = arg(args, '--staff');
  const dept = arg(args, '--dept');
  if (staffUrl) {
    if (!DEPTS.includes(dept)) throw new Error(`--dept ต้องเป็นหนึ่งใน: ${DEPTS.join(', ')}`);
    const people = parseStaffPage(await fetchHtml(staffUrl), dept);
    console.log(`พบบุคลากร ${people.length} คน -> ${writeOut(`staff-${dept}.json`, people)}`);
  } else if (year && url) {
    if (!/^\d{4}$/.test(year)) throw new Error('--year ต้องเป็นปี พ.ศ. 4 หลัก เช่น 2569');
    const items = parseNewsArchive(await fetchHtml(url));
    const undated = items.filter((i) => !i.dateText).length;
    console.log(`พบข่าว ${items.length} รายการ (ไม่พบวันที่ ${undated}) -> ${writeOut(`news-${year}.json`, items)}`);
  } else {
    throw new Error('การใช้งาน: --year 2569 --url <archive-url>   หรือ   --staff <url> --dept math');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((e) => { console.error(e.message); process.exit(1); });
}
