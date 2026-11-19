export const DECODE_MESSAGE = 'ไม่สามารถอ่านไฟล์รูปนี้ได้ กรุณาใช้ไฟล์ JPG หรือ PNG';
export const TOO_LARGE_MESSAGE = 'ไฟล์รูปใหญ่เกินไป';
const QUALITIES = [0.85, 0.75, 0.65, 0.55];

export class ImageDecodeError extends Error {
  constructor(message = DECODE_MESSAGE) {
    super(message);
    this.name = 'ImageDecodeError';
  }
}

export function computeResize(w, h, max = 1600) {
  const longSide = Math.max(w, h);
  if (longSide <= max) return { width: w, height: h };
  const scale = max / longSide;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

// encode(quality) -> Promise<Blob-like with .size>. Pure, so it is testable in Node.
export async function encodeUnderLimit(encode, maxBytes) {
  for (const q of QUALITIES) {
    const blob = await encode(q);
    if (blob && blob.size <= maxBytes) return blob;
  }
  throw new Error(TOO_LARGE_MESSAGE);
}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file);
      return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close && bmp.close() };
    } catch (_) { /* fall through to <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new ImageDecodeError());
      img.src = url;
    });
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => {} };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Browser only. Always outputs JPEG.
export async function resizeImage(file, { max = 1600, maxBytes = 2 * 1024 * 1024 } = {}) {
  let decoded;
  try {
    decoded = await decode(file);
  } catch (e) {
    throw e instanceof ImageDecodeError ? e : new ImageDecodeError();
  }
  if (!decoded.width || !decoded.height) throw new ImageDecodeError();
  try {
    const { width, height } = computeResize(decoded.width, decoded.height, max);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // JPEG has no alpha
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(decoded.source, 0, 0, width, height);
    return await encodeUnderLimit(
      (q) => new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new ImageDecodeError())), 'image/jpeg', q)),
      maxBytes,
    );
  } finally {
    decoded.release();
  }
}
