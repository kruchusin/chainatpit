import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp,
} from 'firebase/firestore';
import { getEnv, seed, ctx as ctx0, anon as anon0 } from './setup.js';

let env;
const ctx = (uid) => ctx0(env, uid);
const anon = () => anon0(env);

const newsOf = (depts, author) => ({
  title: 'หัวข้อ',
  bodyHtml: '<p>เนื้อหา</p>',
  coverUrl: '',
  images: [],
  departmentIds: depts,
  pinned: false,
  published: true,
  authorUid: author,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
});
const docOf = (dept) => ({
  title: 'เอกสาร',
  url: 'https://drive.google.com/x',
  category: 'ทั่วไป',
  departmentId: dept,
  year: 2569,
  order: 0,
});

beforeAll(async () => {
  env = await getEnv();
});
afterAll(async () => {
  await env.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await seed(env);
});

describe('news rules', () => {
  it('anon reads published, not draft', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'news/nMath')));
    await assertFails(getDoc(doc(anon(), 'news/nDraft')));
  });

  it('anon list must filter published==true', async () => {
    await assertSucceeds(getDocs(query(collection(anon(), 'news'), where('published', '==', true))));
    await assertFails(getDocs(collection(anon(), 'news')));
  });

  it('prMath reads own-dept draft', async () => {
    await assertSucceeds(getDoc(doc(ctx('prMath'), 'news/nDraft')));
  });

  it('prc writes any news incl. general', async () => {
    await assertSucceeds(updateDoc(doc(ctx('prc'), 'news/nSci'), { title: 'x' }));
    await assertSucceeds(setDoc(doc(ctx('prc'), 'news/g2'), newsOf([], 'prc')));
  });

  it('prMath creates math news with authorUid=self', async () => {
    await assertSucceeds(setDoc(doc(ctx('prMath'), 'news/m2'), newsOf(['math'], 'prMath')));
  });

  it('prMath cannot spoof authorUid', async () => {
    await assertFails(setDoc(doc(ctx('prMath'), 'news/m3'), newsOf(['math'], 'prc')));
  });

  it('prc cannot spoof authorUid either', async () => {
    await assertFails(setDoc(doc(ctx('prc'), 'news/g4'), newsOf([], 'admin')));
  });

  it('authorUid cannot change on update', async () => {
    await assertSucceeds(setDoc(doc(ctx('prMath'), 'news/m5'), newsOf(['math'], 'prMath')));
    await assertFails(updateDoc(doc(ctx('prMath'), 'news/m5'), { authorUid: 'prc' }));
    await assertFails(updateDoc(doc(ctx('prc'), 'news/m5'), { authorUid: 'prc' }));
  });

  it('prMath cannot create general news', async () => {
    await assertFails(setDoc(doc(ctx('prMath'), 'news/g3'), newsOf([], 'prMath')));
  });

  it('prMath cannot edit sci news', async () => {
    await assertFails(updateDoc(doc(ctx('prMath'), 'news/nSci'), { title: 'x' }));
  });

  it('prMath cannot delete sci news but can delete math news', async () => {
    await assertFails(deleteDoc(doc(ctx('prMath'), 'news/nSci')));
    await assertSucceeds(deleteDoc(doc(ctx('prMath'), 'news/nMath')));
  });

  it('prMulti cannot add foreign dept to news', async () => {
    await assertFails(
      updateDoc(doc(ctx('prMulti'), 'news/nMath'), { departmentIds: ['math', 'sci'] })
    );
  });

  it('prMulti tags math+academic', async () => {
    await assertSucceeds(
      setDoc(doc(ctx('prMulti'), 'news/ma'), newsOf(['math', 'academic'], 'prMulti'))
    );
  });

  it('prMath cannot pull sci news into math', async () => {
    await assertFails(updateDoc(doc(ctx('prMath'), 'news/nSci'), { departmentIds: ['math'] }));
  });

  it('only admin/pr_central may pin', async () => {
    await assertFails(
      setDoc(doc(ctx('prMath'), 'news/p1'), { ...newsOf(['math'], 'prMath'), pinned: true })
    );
    await assertFails(updateDoc(doc(ctx('prMath'), 'news/nMath'), { pinned: true }));
    await assertSucceeds(updateDoc(doc(ctx('prc'), 'news/nMath'), { pinned: true }));
    await assertSucceeds(updateDoc(doc(ctx('prMath'), 'news/nMath'), { title: 'keeps pin' }));
  });

  it('teacher t1 cannot write news', async () => {
    await assertFails(setDoc(doc(ctx('t1'), 'news/t'), newsOf(['math'], 't1')));
  });

  it('disabled cannot write news', async () => {
    await assertFails(setDoc(doc(ctx('off'), 'news/o'), newsOf([], 'off')));
    await assertFails(updateDoc(doc(ctx('off'), 'news/nMath'), { title: 'x' }));
    await assertFails(deleteDoc(doc(ctx('off'), 'news/nMath')));
  });

  it('unknown field rejected', async () => {
    await assertFails(setDoc(doc(ctx('prc'), 'news/x'), { ...newsOf([], 'prc'), extra: 1 }));
  });
});

describe('documents rules', () => {
  it('documents follow same rules', async () => {
    await assertSucceeds(setDoc(doc(ctx('prMath'), 'documents/d1'), docOf('math')));
    await assertFails(setDoc(doc(ctx('prMath'), 'documents/d2'), docOf(null)));
    await assertFails(setDoc(doc(ctx('prMath'), 'documents/d3'), docOf('sci')));
    await assertSucceeds(setDoc(doc(ctx('prc'), 'documents/d4'), docOf(null)));
  });

  it('anyone reads documents; t1 and disabled cannot write', async () => {
    await assertSucceeds(setDoc(doc(ctx('admin'), 'documents/d5'), docOf('sci')));
    await assertSucceeds(getDoc(doc(anon(), 'documents/d5')));
    await assertFails(setDoc(doc(ctx('t1'), 'documents/d6'), docOf('math')));
    await assertFails(setDoc(doc(ctx('off'), 'documents/d7'), docOf(null)));
  });

  it('prMath cannot edit or delete sci document, nor move it to math', async () => {
    await assertSucceeds(setDoc(doc(ctx('admin'), 'documents/d8'), docOf('sci')));
    await assertFails(updateDoc(doc(ctx('prMath'), 'documents/d8'), { title: 'x' }));
    await assertFails(updateDoc(doc(ctx('prMath'), 'documents/d8'), { departmentId: 'math' }));
    await assertFails(deleteDoc(doc(ctx('prMath'), 'documents/d8')));
  });
});
