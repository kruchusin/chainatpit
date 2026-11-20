import { describe, it, expect, vi } from 'vitest';
import { uploadMediaWith, deleteMediaWith } from '../../public/assets/js/lib/media-api.js';

const jsonRes = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

describe('uploadMediaWith', () => {
  it('posts multipart path+file with bearer, returns url', async () => {
    const fetchFn = vi.fn(async () => jsonRes(201, { url: '/media/news/n1/a.jpg?v=1' }));
    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' });
    const url = await uploadMediaWith(fetchFn, async () => 'tok', 'news/n1/a.jpg', blob);
    expect(url).toBe('/media/news/n1/a.jpg?v=1');
    const [target, init] = fetchFn.mock.calls[0];
    expect(target).toBe('/api/media');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('path')).toBe('news/n1/a.jpg');
    expect(init.body.get('file').name).toBe('image.jpg');
  });
  it('maps 403 to Thai message and code', async () => {
    const fetchFn = async () => jsonRes(403, { error: { code: 'FORBIDDEN', message: 'ไม่มีสิทธิ์ใช้งานส่วนนี้' } });
    const err = await uploadMediaWith(fetchFn, async () => 't', 'site/x.jpg', new Blob(['x'])).catch((e) => e);
    expect(err.message).toBe('ไม่มีสิทธิ์ใช้งานส่วนนี้');
    expect(err.code).toBe('FORBIDDEN');
  });
  it('non-JSON error falls back to generic message', async () => {
    const fetchFn = async () => ({ ok: false, status: 502, json: async () => { throw new Error('x'); } });
    const err = await uploadMediaWith(fetchFn, async () => 't', 'site/x.jpg', new Blob(['x'])).catch((e) => e);
    expect(err.message).toBe('เกิดข้อผิดพลาด กรุณาลองใหม่');
  });
});

describe('deleteMediaWith', () => {
  it('sends JSON prefix, returns deleted', async () => {
    const fetchFn = vi.fn(async () => jsonRes(200, { deleted: 3 }));
    const n = await deleteMediaWith(fetchFn, async () => 'tok', { prefix: 'news/n1/' });
    expect(n).toBe(3);
    const [target, init] = fetchFn.mock.calls[0];
    expect(target).toBe('/api/media');
    expect(init.method).toBe('DELETE');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body)).toEqual({ prefix: 'news/n1/' });
  });
});
