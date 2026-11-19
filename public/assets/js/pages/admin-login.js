import { auth, authSdk } from '../firebase.js';
import { loginErrorMessage, safeNext } from '../lib/auth-messages.js';

const params = new URLSearchParams(location.search);
const errEl = document.getElementById('login-error');
const noticeEl = document.getElementById('login-notice');
const form = document.getElementById('login-form');
const btn = document.getElementById('login-btn');

// already signed in -> go straight on (a disabled account is signed out by the guard on arrival)
if (params.get('reason') !== 'disabled') {
  const off = authSdk.onAuthStateChanged(auth, (u) => { off(); if (u) location.replace(safeNext(params.get('next'))); });
}

if (params.get('reason') === 'disabled') errEl.textContent = 'บัญชีนี้ถูกปิดการใช้งาน กรุณาติดต่อผู้ดูแลระบบ';

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  errEl.textContent = ''; noticeEl.textContent = '';
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) { errEl.textContent = 'กรุณากรอกอีเมลและรหัสผ่าน'; return; }
  btn.disabled = true;
  try {
    await authSdk.signInWithEmailAndPassword(auth, email, password);
    location.replace(safeNext(params.get('next')));
  } catch (err) {
    errEl.textContent = loginErrorMessage(err && err.code);
    btn.disabled = false;
  }
});

// Always the same neutral message so the form cannot be used to enumerate accounts.
document.getElementById('forgot-btn').addEventListener('click', async () => {
  errEl.textContent = ''; noticeEl.textContent = '';
  const email = form.email.value.trim();
  if (!email) { errEl.textContent = 'กรุณากรอกอีเมลก่อน'; form.email.focus(); return; }
  try { await authSdk.sendPasswordResetEmail(auth, email); } catch (err) { console.warn(err && err.code); }
  noticeEl.textContent = 'หากอีเมลนี้มีอยู่ในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ให้แล้ว';
});
