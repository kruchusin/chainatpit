// Pure helpers for the admin login flow (no imports so they run in Node).
export const DEFAULT_NEXT = '/admin/index.html';

export function loginErrorMessage(code) {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
    case 'auth/too-many-requests':
      return 'พยายามเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่';
    default:
      return 'เกิดข้อผิดพลาด กรุณาลองใหม่';
  }
}

// Only same-origin /admin/ paths are accepted (prevents open redirects).
export function safeNext(next) {
  if (typeof next !== 'string' || !next.startsWith('/admin/')) return DEFAULT_NEXT;
  if (/[\\\u0000-\u001f]/.test(next) || next.includes('..')) return DEFAULT_NEXT;
  return next;
}
