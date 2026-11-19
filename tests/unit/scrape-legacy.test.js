import { describe, it, expect } from 'vitest';
import { groupNewsBlocks, groupStaff, collectEvents } from '../../migration/lib/blocks.mjs';
import { parseNewsArchive, parseStaffPage, parseThaiDate } from '../../migration/scrape-legacy.mjs';

// ---- tiny fake DOM implementing the minimal interface the parser uses ----
const T = (text) => ({ nodeType: 3, textContent: text, childNodes: [] });
function E(tag, attrs, ...kids) {
  if (typeof attrs !== 'object' || attrs === null || attrs.nodeType) { kids.unshift(attrs); attrs = {}; }
  kids = kids.map((k) => (typeof k === 'string' ? T(k) : k));
  const el = {
    nodeType: 1, tagName: tag.toUpperCase(), childNodes: kids,
    getAttribute: (n) => (n in attrs ? attrs[n] : null),
    get textContent() { return kids.map((k) => k.textContent).join(''); },
  };
  return el;
}
const root = (...k) => E('main', ...k);

describe('collectEvents', () => {
  it('emits headings, text, images and links in document order', () => {
    const ev = collectEvents(root(
      E('h2', 'ประชุมผู้ปกครอง'),
      E('div', E('p', 'รายละเอียด ', E('a', { href: 'https://example.com/x' }, 'ลิงก์'))),
      E('div', E('img', { src: 'https://lh3.googleusercontent.com/a=w1280' })),
    ));
    expect(ev.map((e) => e.type)).toEqual(['heading', 'text', 'image']);
    expect(ev[1].html).toBe('รายละเอียด <a href="https://example.com/x">ลิงก์</a>');
    expect(ev[1].links).toEqual(['https://example.com/x']);
    expect(ev[2].src).toBe('https://lh3.googleusercontent.com/a=w1280');
  });
  it('skips script/style/nav and drops non-http image sources', () => {
    const ev = collectEvents(root(
      E('nav', E('p', 'เมนู')), E('script', 'x=1'),
      E('p', 'ข้อความ'), E('img', { src: 'data:image/png;base64,AAA' }),
      E('img', { 'data-src': '//lh3.googleusercontent.com/b' }),
    ));
    expect(ev.map((e) => e.type)).toEqual(['text', 'image']);
    expect(ev[1].src).toBe('https://lh3.googleusercontent.com/b');
  });
  it('escapes text in html', () => {
    const ev = collectEvents(root(E('p', '<b>&')));
    expect(ev[0].html).toBe('&lt;b&gt;&amp;');
  });
});

describe('groupNewsBlocks', () => {
  const dom = root(
    E('p', 'ข้อความก่อนหัวข้อแรก (ทิ้ง)'),
    E('h2', 'ข่าว A'),
    E('p', '19 พ.ย. 2569'),
    E('p', 'เนื้อหา A1'),
    E('div', E('img', { src: 'https://lh3.googleusercontent.com/a1' })),
    E('p', E('a', { href: 'https://example.com/a' }, 'ดูเพิ่ม')),
    E('h2', 'ข่าว B (ไม่มีวันที่)'),
    E('p', 'เนื้อหา B'),
    E('h3', '   '),
    E('h2', 'ข่าว C ลงวันที่ 5 มีนาคม 2568'),
  );
  const blocks = groupNewsBlocks(collectEvents(dom));
  it('splits by headings, ignores empty headings and pre-heading content', () => {
    expect(blocks.map((b) => b.title)).toEqual(['ข่าว A', 'ข่าว B (ไม่มีวันที่)', 'ข่าว C ลงวันที่ 5 มีนาคม 2568']);
  });
  it('collects body, images, links and detects the date', () => {
    const a = blocks[0];
    expect(a.dateText).toBe('19 พ.ย. 2569');
    expect(a.bodyHtml).toBe('<p>เนื้อหา A1</p><p><a href="https://example.com/a">ดูเพิ่ม</a></p>');
    expect(a.images).toEqual(['https://lh3.googleusercontent.com/a1']);
    expect(a.links).toEqual(['https://example.com/a']);
  });
  it('dateText empty when none; date found inside the title', () => {
    expect(blocks[1].dateText).toBe('');
    expect(blocks[2].dateText).toBe('5 มีนาคม 2568');
  });
  it('parseNewsArchive composes parse + grouping via an injected parser', () => {
    const out = parseNewsArchive('<html>', () => dom);
    expect(out).toHaveLength(3);
    expect(Object.keys(out[0]).sort()).toEqual(['bodyHtml', 'dateText', 'images', 'links', 'title']);
  });
});

describe('groupStaff', () => {
  const dom = root(
    E('h2', 'กลุ่มสาระการเรียนรู้คณิตศาสตร์'),
    E('div', E('img', { src: 'https://lh3.googleusercontent.com/p1' })),
    E('p', 'นายสมชาย ใจดี'),
    E('p', 'ครู ชำนาญการพิเศษ'),
    E('p', 'โทร 081-234-5678'),
    E('p', 'นางสาวสมศรี รักเรียน'),
    E('div', E('img', { src: 'https://lh3.googleusercontent.com/p2' })),
    E('p', 'ครู'),
    E('p', 'ว่าที่ร้อยตรีสมปอง ดีมาก'),
    E('p', 'พนักงานราชการ'),
  );
  const people = groupStaff(collectEvents(dom));
  it('pairs prefix names with positions and photos, in either image order', () => {
    expect(people).toEqual([
      { prefix: 'นาย', name: 'สมชาย ใจดี', position: 'ครู ชำนาญการพิเศษ', photoUrl: 'https://lh3.googleusercontent.com/p1' },
      { prefix: 'นางสาว', name: 'สมศรี รักเรียน', position: 'ครู', photoUrl: 'https://lh3.googleusercontent.com/p2' },
      { prefix: 'ว่าที่ร้อยตรี', name: 'สมปอง ดีมาก', position: 'พนักงานราชการ', photoUrl: '' },
    ]);
  });
  it('never includes phone numbers', () => {
    expect(JSON.stringify(people)).not.toMatch(/081|โทร/);
  });
  it('parseStaffPage(html, deptKey) works through an injected parser', () => {
    expect(parseStaffPage('<html>', 'math', () => dom)).toHaveLength(3);
  });
});

describe('re-exports', () => {
  it('parseThaiDate is exported from the scraper module', () => {
    expect(parseThaiDate('19 พฤศจิกายน 2569').getTime()).toBe(new Date('2026-11-19T00:00:00+07:00').getTime());
  });
});

describe('fixture-based (needs real HTML saved by the maintainer; see migration/README.md)', () => {
  it.skip('TODO fixture: parseNewsArchive(legacy-news-2569.html).length equals the hand-counted number of news items', () => {});
  it.skip('TODO fixture: first news item has the title and date shown on the real page', () => {});
  it.skip('TODO fixture: parseStaffPage(legacy-staff-math.html, "math") returns the first teacher correctly', () => {});
});
