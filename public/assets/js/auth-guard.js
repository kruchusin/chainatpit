// Admin auth guard. UI-level only: the Firestore rules / media API are the real security.
import { auth, db, authSdk, firestoreSdk as f } from './firebase.js';
import { safeNext } from './lib/auth-messages.js';

const LOGIN = '/admin/login.html';
const NEVER = () => new Promise(() => {}); // page is navigating away / halted

function firstAuthState() {
  return new Promise((resolve) => {
    const off = authSdk.onAuthStateChanged(auth, (u) => { off(); resolve(u); });
  });
}

let leaving = false;
async function kickDisabled() {
  if (leaving) return NEVER();
  leaving = true;
  try { await authSdk.signOut(auth); } catch (e) { console.error(e); }
  location.replace(`${LOGIN}?reason=disabled`);
  return NEVER();
}

// Visible, retryable error; the caller must stop running page code (await the returned promise).
function showFatal() {
  leaving = true;
  document.querySelectorAll('main').forEach((m) => { m.hidden = true; });
  const box = document.createElement('div');
  box.className = 'container';
  box.setAttribute('role', 'alert');
  box.innerHTML = '<p class="alert">ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่ <a href="" id="guard-retry">ลองอีกครั้ง</a></p>';
  box.querySelector('#guard-retry').addEventListener('click', (e) => { e.preventDefault(); location.reload(); });
  document.body.appendChild(box);
  return NEVER();
}

export async function requireLogin() {
  const user = await firstAuthState();
  if (!user) {
    leaving = true;
    const here = location.pathname + location.search;
    location.replace(`${LOGIN}?next=${encodeURIComponent(safeNext(here))}`);
    return NEVER();
  }
  const userRef = f.doc(db, 'users', user.uid);

  // Attach the listener first; its first snapshot is the initial check, so a disable
  // landing between a separate getDoc and the listener cannot be missed.
  let unsub = () => {};
  let settled = false;
  const first = new Promise((resolve) => {
    unsub = f.onSnapshot(userRef, (d) => {
      const bad = !d.exists() || d.data().disabled === true;
      if (!settled) { settled = true; resolve({ d, bad }); return; }
      if (bad) { unsub(); kickDisabled(); }
    }, (e) => {
      if (!settled) { settled = true; resolve({ err: e }); return; }
      if (e && e.code === 'permission-denied') { unsub(); kickDisabled(); } else console.error(e);
    });
  });
  const res = await first;

  if (res.err) {
    unsub();
    console.error(res.err);
    if (res.err.code === 'permission-denied') return kickDisabled();
    return showFatal();
  }
  if (res.bad) { unsub(); return kickDisabled(); }
  const profile = { uid: user.uid, ...res.d.data() };

  let staff = null;
  if (profile.staffId) {
    try {
      const s = await f.getDoc(f.doc(db, 'staff', profile.staffId));
      if (s.exists()) staff = { id: s.id, ...s.data() };
    } catch (e) {
      console.error(e);
      unsub();
      return showFatal();
    }
  }
  return { user, profile, staff };
}
