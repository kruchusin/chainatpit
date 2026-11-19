const MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const BANGKOK_OFFSET_MS = 7 * 3600 * 1000; // Asia/Bangkok has no DST

function toBangkok(value) {
  if (!value) return null;
  const d = typeof value.toDate === 'function' ? value.toDate() : value;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + BANGKOK_OFFSET_MS); // read with getUTC*
}

const pad = (n) => String(n).padStart(2, '0');

export function formatThaiDate(value) {
  const d = toBangkok(value);
  if (!d) return '';
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}

export function formatThaiDateTime(value) {
  const d = toBangkok(value);
  if (!d) return '';
  return `${formatThaiDate(value)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} น.`;
}
