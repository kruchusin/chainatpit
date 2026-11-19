// Read helpers. Every query is one the Firestore rules allow anonymously:
// news lists filter published == true, staff lists filter active == true.
import { db, storage, firestoreSdk as f, storageSdk as st } from './firebase.js';
import { resizeImage } from './lib/image-resize.js';
import { cacheBust } from './lib/url.js';
import { collectFiltered } from './lib/paginate.js';

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
  const r = st.ref(storage, path);
  await st.uploadBytes(r, blob, { contentType: 'image/jpeg', cacheControl: 'public, max-age=300' });
  // same path is reused, so the bare URL may not change: bust browser caches
  return cacheBust(await st.getDownloadURL(r));
}
