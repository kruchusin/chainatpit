import { describe, it, expect } from 'vitest';
import { loginErrorMessage, safeNext } from '../../public/assets/js/lib/auth-messages.js';

describe('loginErrorMessage', () => {
  it('maps credential errors to one message (no account enumeration)', () => {
    for (const c of ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-not-found']) {
      expect(loginErrorMessage(c)).toBe('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
    }
  });
  it('maps too-many-requests', () => {
    expect(loginErrorMessage('auth/too-many-requests')).toBe('พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่');
  });
  it('falls back for anything else', () => {
    expect(loginErrorMessage('auth/network-request-failed')).toBe('เกิดข้อผิดพลาด กรุณาลองใหม่');
    expect(loginErrorMessage(undefined)).toBe('เกิดข้อผิดพลาด กรุณาลองใหม่');
  });
});

describe('safeNext', () => {
  it('accepts /admin/ paths with search', () => {
    expect(safeNext('/admin/news.html')).toBe('/admin/news.html');
    expect(safeNext('/admin/news.html?id=3')).toBe('/admin/news.html?id=3');
  });
  it('rejects open redirects and non-admin paths', () => {
    for (const bad of ['https://evil.com', '//evil.com', '/\\evil.com', '/admin/../x', '/news.html', '/administrator', 'javascript:alert(1)', '', null, undefined, 42, '/admin/\nx']) {
      expect(safeNext(bad)).toBe('/admin/index.html');
    }
  });
});
