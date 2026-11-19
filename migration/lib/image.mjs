// Image helpers. `sharp` is injected so the pure parts stay testable without it installed.
export const MAX_SIDE = 1600;
export const MAX_BYTES = 2 * 1024 * 1024;

// Google-hosted images accept a size suffix (=w1280); ask for 1600px wide. Other hosts are left untouched.
export function bigImageUrl(url) {
  if (!/^https:\/\/[^/]*googleusercontent\.com\//i.test(url)) return url;
  return url.replace(/=[whs]\d+[^/]*$/, '') + '=w1600';
}

// -> Buffer: JPEG, long side <= 1600px, <= 2 MB (lowers quality, then dimensions, until it fits)
export async function toJpegWithinLimits(input, sharp) {
  let side = MAX_SIDE;
  for (let attempt = 0; attempt < 6; attempt++) {
    for (const quality of [85, 75, 65, 55, 45]) {
      const out = await sharp(input).rotate()
        .resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality, mozjpeg: true }).toBuffer();
      if (out.length <= MAX_BYTES) return out;
    }
    side = Math.round(side * 0.8);
  }
  throw new Error('ย่อรูปให้ไม่เกิน 2 MB ไม่สำเร็จ');
}
