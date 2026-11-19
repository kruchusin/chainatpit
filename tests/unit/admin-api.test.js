import { describe, it, expect, vi } from 'vitest';
import { parseAdminResponse, callAdminUsersWith, GENERIC_ERROR } from '../../public/assets/js/lib/admin-api.js';

const res = (status, body, raw) => new Response(raw ?? JSON.stringify(body), { status });

describe('parseAdminResponse', () => {
  it('returns parsed body on 2xx', async () => {
    expect(await parseAdminResponse(res(201, { uid: 'u9', recovered: true }))).toEqual({ uid: 'u9', recovered: true });
  });
  it('throws Error with server code and Thai message on non-2xx', async () => {
    const err = await parseAdminResponse(res(409, { error: { code: 'EMAIL_EXISTS', message: 'อีเมลนี้มีผู้ใช้แล้ว' } })).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe('EMAIL_EXISTS');
    expect(err.message).toBe('อีเมลนี้มีผู้ใช้แล้ว');
    expect(err.status).toBe(409);
  });
  it('falls back to the generic Thai message when the body is not JSON', async () => {
    const err = await parseAdminResponse(res(502, null, '<html>bad gateway</html>')).catch((e) => e);
    expect(err.message).toBe(GENERIC_ERROR);
    expect(GENERIC_ERROR).toBe('เกิดข้อผิดพลาด กรุณาลองใหม่');
    expect(err.code).toBeUndefined();
  });
  it('falls back when JSON has no message', async () => {
    const err = await parseAdminResponse(res(500, {})).catch((e) => e);
    expect(err.message).toBe(GENERIC_ERROR);
  });
  it('2xx with non-JSON body resolves to {}', async () => {
    expect(await parseAdminResponse(res(200, null, ''))).toEqual({});
  });
});

describe('callAdminUsersWith', () => {
  it('POSTs action + payload with bearer token', async () => {
    const fetchFn = vi.fn(async () => res(200, { ok: true }));
    const out = await callAdminUsersWith({ fetchFn, getToken: async () => 'TKN', action: 'setPassword', payload: { uid: 'u1', password: 'abcdefgh' } });
    expect(out).toEqual({ ok: true });
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('/api/admin/users');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer TKN');
    expect(init.headers['content-type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ action: 'setPassword', uid: 'u1', password: 'abcdefgh' });
  });
  it('action cannot be overridden by payload', async () => {
    const fetchFn = vi.fn(async () => res(200, {}));
    await callAdminUsersWith({ fetchFn, getToken: async () => 't', action: 'create', payload: { action: 'setDisabled' } });
    expect(JSON.parse(fetchFn.mock.calls[0][1].body).action).toBe('create');
  });
  it('network failure gives generic Thai error', async () => {
    const fetchFn = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    const err = await callAdminUsersWith({ fetchFn, getToken: async () => 't', action: 'create', payload: {} }).catch((e) => e);
    expect(err.message).toBe(GENERIC_ERROR);
  });
});
