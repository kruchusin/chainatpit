// splitThaiPrefix('นางสาวสมศรี รักเรียน') -> { prefix: 'นางสาว', name: 'สมศรี รักเรียน' }
// Longest prefixes first so 'นางสาว' is not read as 'นาง' + 'สาว'. Stacked prefixes are joined with a space.
const PREFIXES = [
  'ว่าที่ร้อยตรีหญิง', 'ว่าที่ร้อยตรี', 'ว่าที่ ร.ต.หญิง', 'ว่าที่ ร.ต.', 'ว่าที่ร.ต.',
  'ผู้ช่วยศาสตราจารย์', 'รองศาสตราจารย์', 'ศาสตราจารย์',
  'ผศ.', 'รศ.', 'ศ.', 'นางสาว', 'นาง', 'นาย', 'น.ส.', 'ดร.', 'ด.ช.', 'ด.ญ.',
  'จ.ส.ต.', 'ส.ต.ต.', 'ร.ต.อ.', 'พ.ต.อ.',
].sort((a, b) => b.length - a.length);

export function splitThaiPrefix(fullName) {
  let rest = String(fullName ?? '').replace(/\s+/g, ' ').trim();
  const found = [];
  for (;;) {
    const p = PREFIXES.find((x) => rest.startsWith(x));
    if (!p) break;
    found.push(p);
    rest = rest.slice(p.length).trim();
  }
  return { prefix: found.join(' '), name: rest };
}
