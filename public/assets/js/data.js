// Read helpers. Every query is one the Firestore rules allow anonymously:
// news lists filter published == true, staff lists filter active == true.
import { db, auth, firestoreSdk as f } from './firebase.js';
import { callAdminUsersWith } from './lib/admin-api.js';
import { DOC_KEYS } from './lib/doc-edit.js';
import { SETTINGS_KEYS } from './lib/settings-edit.js';
import { resizeImage } from './lib/image-resize.js';
import { uploadMediaWith, deleteMediaWith } from './lib/media-api.js';
import { collectFiltered } from './lib/paginate.js';
import { isAdmin, isPrCentral, prDepts } from './lib/permissions.js';
import { NEWS_WRITE_KEYS } from './lib/news-payload.js';
import { swapOrders } from './lib/staff-edit.js';
import { PAGE_KEYS, sortPages } from './lib/info-pages.js';

const withId = (d) => ({ id: d.id, ...d.data() });

export async function getSettings() {
  const snap = await f.getDoc(f.doc(db, 'settings', 'site'));
  return snap.exists() ? snap.data() : {};
}

export async function listDepartments(type) {
  const col = f.collection(db, 'departments');
  const q = type ? f.query(col, f.where('type', '==', type)) : col;
  const items = (await f.getDocs(q)).docs.map(withId);
  return items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || String(a.name).localeCompare(String(b.name), 'th'));
}

// Published "ข้อมูลสถานศึกษา" sub-pages for the menu, sorted by order (no index needed: sorted here).
export async function listInfoPages() {
  const q = f.query(f.collection(db, 'pages'), f.where('published', '==', true));
  return sortPages((await f.getDocs(q)).docs.map(withId));
}

// null when missing or not published (permission-denied for anon).
export async function getInfoPage(id) {
  try {
    const snap = await f.getDoc(f.doc(db, 'pages', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    if (e && e.code === 'permission-denied') return null;
    throw e;
  }
}

// Returns {items, cursor}; cursor is the last snapshot (pass as `after`) or null when no more pages.
export async function listNews({ departmentId, pageSize = 12, after } = {}) {
  const col = f.collection(db, 'news');
  const parts = [f.where('published', '==', true)];
  if (departmentId) {
    // index: news(published, departmentIds CONTAINS, createdAt DESC); no pinned ordering here
    parts.push(f.where('departmentIds', 'array-contains', departmentId), f.orderBy('createdAt', 'desc'));
  } else {
    // index: news(published, pinned DESC, createdAt DESC)
    parts.push(f.orderBy('pinned', 'desc'), f.orderBy('createdAt', 'desc'));
  }
  if (after) parts.push(f.startAfter(after));
  parts.push(f.limit(pageSize));
  const snap = await f.getDocs(f.query(col, ...parts));
  const last = snap.docs[snap.docs.length - 1];
  return { items: snap.docs.map(withId), cursor: snap.docs.length === pageSize ? last : null };
}

export async function getNews(id) {
  try {
    const snap = await f.getDoc(f.doc(db, 'news', id));
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  } catch (e) {
    if (e && e.code === 'permission-denied') return null; // unpublished -> same as missing
    throw e;
  }
}

export async function listStaff({ departmentId } = {}) {
  const parts = [f.where('active', '==', true)];
  if (departmentId) parts.push(f.where('departmentIds', 'array-contains', departmentId));
  const items = (await f.getDocs(f.query(f.collection(db, 'staff'), ...parts))).docs.map(withId);
  return items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export async function listDocuments({ category } = {}) {
  const col = f.collection(db, 'documents');
  const q = category ? f.query(col, f.where('category', '==', category)) : col;
  const items = (await f.getDocs(q)).docs.map(withId);
  return items.sort((a, b) => (b.year ?? 0) - (a.year ?? 0) || (a.order ?? 0) - (b.order ?? 0));
}

// Published news that have at least one image, newest first. Returns {items, cursor} like listNews.
// index: news(published ASC, createdAt DESC). images.length is filtered on the client, so more
// pages are fetched until pageSize items are found or the collection is exhausted.
export async function listGalleryNews({ pageSize = 12, after } = {}) {
  const col = f.collection(db, 'news');
  const batch = Math.max(pageSize * 2, 24);
  const { items, cursor } = await collectFiltered({
    pageSize,
    after,
    accept: (d) => Array.isArray(d.data().images) && d.data().images.length > 0,
    fetchPage: async (cur) => {
      const parts = [f.where('published', '==', true), f.orderBy('createdAt', 'desc')];
      if (cur) parts.push(f.startAfter(cur));
      parts.push(f.limit(batch));
      const snap = await f.getDocs(f.query(col, ...parts));
      return { docs: snap.docs, more: snap.docs.length === batch };
    },
  });
  return { items: items.map(withId), cursor };
}

// ---------- admin helpers (allowed by the rules only for signed-in users) ----------

// users/{uid} -> {uid, ...data} or null when missing
export async function getMyProfile(uid) {
  const snap = await f.getDoc(f.doc(db, 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

// Partial update; the rules decide which fields the caller may change.
export async function updateStaff(id, partial) {
  await f.updateDoc(f.doc(db, 'staff', id), partial);
}

// Resizes (<=1600px, <=2MB JPEG) then uploads. Throws ImageDecodeError for unreadable files.
export async function uploadImage(path, file) {
  const blob = await resizeImage(file);
  // the server returns /media/<path>?v=<ts>, so re-uploads to the same path bust caches
  return uploadMediaWith((...a) => fetch(...a), () => auth.currentUser.getIdToken(), path, blob);
}

const deleteMedia = (target) => deleteMediaWith((...a) => fetch(...a), () => auth.currentUser.getIdToken(), target);

// ---------- admin news helpers ----------

// Editor list (drafts included), newest first. Returns {items, cursor} like listNews.
// admin / pr_central: all news. Dept PR: array-contains-any over their departments (max 30), which the
// list rule allows for any active dept PR; the page then hides items the user cannot edit.
// index: news(createdAt DESC) automatic; news(departmentIds CONTAINS, createdAt DESC).
export async function listNewsForEditor(profile, { pageSize = 20, after } = {}) {
  const parts = [];
  if (!(isAdmin(profile) || isPrCentral(profile))) {
    const depts = prDepts(profile).slice(0, 30);
    if (!depts.length) return { items: [], cursor: null };
    parts.push(f.where('departmentIds', 'array-contains-any', depts));
  }
  parts.push(f.orderBy('createdAt', 'desc'));
  if (after) parts.push(f.startAfter(after));
  parts.push(f.limit(pageSize));
  const snap = await f.getDocs(f.query(f.collection(db, 'news'), ...parts));
  const last = snap.docs[snap.docs.length - 1];
  return { items: snap.docs.map(withId), cursor: snap.docs.length === pageSize ? last : null };
}

// Drafts are not publicly readable, so this uses getDoc (rules: get is per-document scope).
export async function getNewsForEditor(id) {
  const snap = await f.getDoc(f.doc(db, 'news', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Creates an unpublished draft so the media API (news doc must exist) accepts image uploads. Returns the id.
// pinned:false is written explicitly: the public home query orders by pinned, which skips docs lacking the field.
export async function createDraftNews(profile, departmentIds) {
  const ref = f.doc(f.collection(db, 'news'));
  await f.setDoc(ref, {
    title: '', bodyHtml: '', coverUrl: '', images: [], departmentIds,
    pinned: false, published: false, authorUid: profile.uid,
    createdAt: f.serverTimestamp(), updatedAt: f.serverTimestamp(),
  });
  return ref.id;
}

// `data` must only hold allowed keys (see NEWS_WRITE_KEYS); updatedAt is always set here.
export async function saveNews(id, data) {
  const bad = Object.keys(data).filter((k) => !NEWS_WRITE_KEYS.includes(k));
  if (bad.length) throw new Error(`saveNews: unexpected keys ${bad.join(', ')}`);
  await f.updateDoc(f.doc(db, 'news', id), { ...data, updatedAt: f.serverTimestamp() });
}

// Media first (the doc still exists then), then the doc.
// A failure while deleting files is logged but never blocks deleting the document.
export async function deleteNews(id) {
  try {
    await deleteMedia({ prefix: `news/${id}/` });
  } catch (e) {
    console.error('deleteNews: could not delete media', e);
  }
  await f.deleteDoc(f.doc(db, 'news', id));
}

// ---------- admin staff / departments helpers ----------

// Editor list of staff, active and inactive, sorted by order.
// admin: whole collection (no filter; the rules allow admin). Dept PR: one array-contains query per owned
// department (the list rule cannot prove a per-document department check), merged by id.
// Other users: [] (menu hides this page). The page hides staff the user cannot edit.
export async function listStaffForEditor(profile) {
  const col = f.collection(db, 'staff');
  let docs;
  if (isAdmin(profile)) {
    docs = (await f.getDocs(col)).docs;
  } else {
    const depts = prDepts(profile);
    const snaps = await Promise.all(depts.map((d) => f.getDocs(f.query(col, f.where('departmentIds', 'array-contains', d)))));
    docs = snaps.flatMap((s) => s.docs);
  }
  const byId = new Map(docs.map((d) => [d.id, withId(d)]));
  return [...byId.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)
    || String(a.name).localeCompare(String(b.name), 'th'));
}

// getDoc (rules: get is per-document scope). null when missing.
export async function getStaffForEditor(id) {
  const snap = await f.getDoc(f.doc(db, 'staff', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// Admin only (rules). Creates a hidden (active:false), unlinked record at the end of the order. Returns the id.
export async function createStaff() {
  const top = await f.getDocs(f.query(f.collection(db, 'staff'), f.orderBy('order', 'desc'), f.limit(1)));
  const max = top.empty ? 0 : Number(top.docs[0].data().order) || 0;
  const ref = f.doc(f.collection(db, 'staff'));
  await f.setDoc(ref, {
    prefix: '', name: '', position: '', photoUrl: '', bio: '', education: '', email: '',
    departmentIds: [], uid: null, order: max + 1, active: false, // hidden until the admin fills it in and turns it on
  });
  return ref.id;
}

// Swaps `order` of two docs {id, order} in one atomic batch (two updateDoc writes).
// collection: 'staff' | 'departments'.
export async function swapOrder(collection, a, b) {
  const batch = f.writeBatch(db);
  for (const w of swapOrders(a, b)) batch.update(f.doc(db, collection, w.id), { order: w.order });
  await batch.commit();
}

// Partial update; the rules decide what the caller may change (dept PR: description/coverUrl only).
export async function saveDepartment(id, data) {
  await f.updateDoc(f.doc(db, 'departments', id), data);
}

// Admin only. Auto-id (Thai names do not slugify). order = max + 1. Returns the id.
export async function createDepartment(data) {
  const top = await f.getDocs(f.query(f.collection(db, 'departments'), f.orderBy('order', 'desc'), f.limit(1)));
  const max = top.empty ? 0 : Number(top.docs[0].data().order) || 0;
  const ref = f.doc(f.collection(db, 'departments'));
  await f.setDoc(ref, { description: '', externalUrl: '', coverUrl: '', ...data, order: max + 1 });
  return ref.id;
}

export const DEPT_IN_USE_MESSAGE = 'ลบไม่ได้ เพราะยังมีบุคลากรหรือข่าวที่อยู่ในหน่วยงานนี้ กรุณาย้ายหรือลบออกก่อน';

// Admin only. Refuses (Error with DEPT_IN_USE_MESSAGE, code 'dept-in-use') while any staff or news still
// references the department. The staff query includes inactive staff and the news query includes drafts.
export async function deleteDepartment(id) {
  const [s, n] = await Promise.all([
    f.getDocs(f.query(f.collection(db, 'staff'), f.where('departmentIds', 'array-contains', id), f.limit(1))),
    f.getDocs(f.query(f.collection(db, 'news'), f.where('departmentIds', 'array-contains', id), f.limit(1))),
  ]);
  if (!s.empty || !n.empty) {
    const err = new Error(DEPT_IN_USE_MESSAGE);
    err.code = 'dept-in-use';
    throw err;
  }
  await f.deleteDoc(f.doc(db, 'departments', id));
  try {
    await deleteMedia({ prefix: `departments/${id}/` });
  } catch (e) {
    console.error('deleteDepartment: could not delete media', e);
  }
}

// ---------- admin users / settings / documents helpers ----------

// POST /api/admin/users. Throws Error (.code = server code, .message = Thai message) on failure.
export function callAdminUsers(action, payload) {
  return callAdminUsersWith({
    fetchFn: (...a) => fetch(...a),
    getToken: () => auth.currentUser.getIdToken(),
    action, payload,
  });
}

// Admin only (rules). All users/* docs.
export async function listUsers() {
  return (await f.getDocs(f.collection(db, 'users'))).docs.map((d) => ({ uid: d.id, ...d.data() }));
}

// Writes Firestore directly (rules: admin may write users). Only role and prDepartments.
export async function updateUserRole(uid, { role, prDepartments }) {
  await f.updateDoc(f.doc(db, 'users', uid), { role, prDepartments });
}

// Admin only. merge:true keeps any fields this page does not manage.
export async function saveSettings(data) {
  const bad = Object.keys(data).filter((k) => !SETTINGS_KEYS.includes(k));
  if (bad.length) throw new Error(`saveSettings: unexpected keys ${bad.join(', ')}`);
  await f.setDoc(f.doc(db, 'settings', 'site'), data, { merge: true });
}

// id omitted -> create (auto id, returns it). `data` must be exactly DOC_KEYS (rules: hasOnly).
export async function saveDocument(id, data) {
  const bad = Object.keys(data).filter((k) => !DOC_KEYS.includes(k));
  if (bad.length) throw new Error(`saveDocument: unexpected keys ${bad.join(', ')}`);
  if (id) {
    await f.setDoc(f.doc(db, 'documents', id), data); // full replace keeps the key set exact
    return id;
  }
  const ref = f.doc(f.collection(db, 'documents'));
  await f.setDoc(ref, data);
  return ref.id;
}

export async function deleteDocument(id) {
  await f.deleteDoc(f.doc(db, 'documents', id));
}

// ---------- admin "ข้อมูลสถานศึกษา" pages (admin / pr_central) ----------

export async function listInfoPagesForEditor() {
  return sortPages((await f.getDocs(f.collection(db, 'pages'))).docs.map(withId));
}

// data: exactly PAGE_KEYS. id omitted -> create with auto id. Returns the id.
export async function saveInfoPage(id, data) {
  const keys = Object.keys(data);
  if (keys.length !== PAGE_KEYS.length || keys.some((k) => !PAGE_KEYS.includes(k))) {
    throw new Error(`saveInfoPage: keys must be ${PAGE_KEYS.join(', ')}`);
  }
  const ref = id ? f.doc(db, 'pages', id) : f.doc(f.collection(db, 'pages'));
  await f.setDoc(ref, data);
  return ref.id;
}

// New id without writing (so images can be uploaded under pages/<id>/ before the first save).
export function newInfoPageId() {
  return f.doc(f.collection(db, 'pages')).id;
}

// Creates the given titles as hidden pages after the current last order, in one batch.
export async function createInfoPages(titles, startOrder) {
  const batch = f.writeBatch(db);
  titles.forEach((title, i) => {
    batch.set(f.doc(f.collection(db, 'pages')), { title, bodyHtml: '', order: startOrder + i, published: false });
  });
  await batch.commit();
}

export async function deleteInfoPage(id) {
  await f.deleteDoc(f.doc(db, 'pages', id));
  try {
    await deleteMedia({ prefix: `pages/${id}/` });
  } catch (e) {
    console.error('deleteInfoPage: could not delete media', e);
  }
}
