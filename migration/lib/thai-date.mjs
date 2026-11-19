// parseThaiDate(text) -> Date (midnight Asia/Bangkok) | null. Finds the first date anywhere in the text.
const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';
const MONTHS = [
  ['มกราคม', 'มค'], ['กุมภาพันธ์', 'กพ'], ['มีนาคม', 'มีค'], ['เมษายน', 'เมย'],
  ['พฤษภาคม', 'พค'], ['มิถุนายน', 'มิย'], ['กรกฎาคม', 'กค'], ['สิงหาคม', 'สค'],
  ['กันยายน', 'กย'], ['ตุลาคม', 'ตค'], ['พฤศจิกายน', 'พย'], ['ธันวาคม', 'ธค'],
];
const NAME_TO_MONTH = new Map();
MONTHS.forEach((names, i) => names.forEach((n) => NAME_TO_MONTH.set(n, i + 1)));
// abbreviations may be written with dots (พ.ย.) or without (พย): allow an optional dot after every character
const dotted = (n) => [...n].map((ch) => `${ch}\\.?`).join('');
const NAME_ALT = [...NAME_TO_MONTH.keys()].sort((a, b) => b.length - a.length).map(dotted).join('|');
const TEXT_RE = new RegExp(`(?<!\\d)(\\d{1,2})\\s*(${NAME_ALT})\\s*(\\d{4})(?!\\d)`);
const NUM_RE = /(?<!\d)(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{4})(?!\d)/;

const toAsciiDigits = (s) => s.replace(/[๐-๙]/g, (c) => String(THAI_DIGITS.indexOf(c)));

function build(day, month, year) {
  let y = Number(year);
  if (y >= 2400) y -= 543; // Buddhist era
  else if (y < 1900 || y > 2200) return null;
  const d = Number(day);
  if (month < 1 || month > 12 || d < 1 || d > 31) return null;
  const iso = `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const date = new Date(`${iso}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return null;
  // reject overflow such as 31 Feb: Bangkok calendar day must round-trip
  const back = new Date(date.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  return back === iso ? date : null;
}

export function findThaiDate(text) {
  if (typeof text !== 'string' || !text) return null;
  const s = toAsciiDigits(text).normalize('NFC');
  const candidates = [];
  const t = TEXT_RE.exec(s);
  if (t) {
    const date = build(t[1], NAME_TO_MONTH.get(t[2].replace(/\./g, '')), t[3]);
    if (date) candidates.push({ index: t.index, date, text: t[0] });
  }
  const n = NUM_RE.exec(s);
  if (n) {
    const date = build(n[1], Number(n[2]), n[3]);
    if (date) candidates.push({ index: n.index, date, text: n[0] });
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.index - b.index);
  return candidates[0];
}

export function parseThaiDate(text) {
  const found = findThaiDate(text);
  return found ? found.date : null;
}
