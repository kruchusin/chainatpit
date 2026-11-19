// Admin auth guard. UI-level only: the Firestore/Storage rules are the real security.
import { auth, db, authSdk, firestoreSdk as f } from './firebase.js';
import { safeNext } from './lib/auth-messages.js';

const LOGIN = '/admin/login.html';

function firstAuthState() {
  return new Promise((resolve) => {
    const off = authSdk.onAuthStateChanged(auth, (u) => { off(); resolve(u); });
  });
}

async function kickDisabled() {
  try { await authSdk.signOut(auth); } catch (e) { console.error(e); }
  location.replace(`${LOGIN}?reason=disabled`);
  return new Promise(() => {}); // never resolves: the page is navigating away
}

export async function requireLogin() {
  const user = await firstAuthState();
  if (!user) {
    const here = location.pathname + location.search;
    location.replace(`${LOGIN}?next=${encodeURIComponent(safeNext(here))}`);
    return new Promise(() => {});
  }
  const userRef = f.doc(db, 'users', user.uid);
  const snap = await f.getDoc(userRef);
  if (!snap.exists() || snap.data().disabled === true) return kickDisabled();
  const profile = { uid: user.uid, ...snap.data() };

  let staff = null;
  if (profile.staffId) {
    const s = await f.getDoc(f.doc(db, 'staff', profile.staffId));
    if (s.exists()) staff = { id: s.id, ...s.data() };
  }

  // Sign out immediately if the account is disabled/removed while the page is open.
  f.onSnapshot(userRef, (d) => {
    if (!d.exists() || d.data().disabled === true) kickDisabled();
  }, (e) => console.error(e));

  return { user, profile, staff };
}
