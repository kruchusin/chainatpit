import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore';
import { getEnv, seed, ctx as ctx0, anon as anon0 } from './setup.js';

let env;
const ctx = (uid) => ctx0(env, uid);
const anon = () => anon0(env);
const page = (o = {}) => ({ title: 'ประวัติโรงเรียน', bodyHtml: '<p>x</p>', order: 1, published: true, ...o });

beforeAll(async () => { env = await getEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await seed(env);
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), 'pages/pub'), page());
    await setDoc(doc(c.firestore(), 'pages/draft'), page({ title: 'ร่าง', published: false }));
  });
});

describe('pages rules', () => {
  it('anon reads published pages, not drafts', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'pages/pub')));
    await assertFails(getDoc(doc(anon(), 'pages/draft')));
    await assertSucceeds(getDocs(query(collection(anon(), 'pages'), where('published', '==', true))));
    await assertFails(getDocs(collection(anon(), 'pages')));
  });

  it('central lists all pages', async () => {
    await assertSucceeds(getDocs(collection(ctx('admin'), 'pages')));
    await assertSucceeds(getDocs(collection(ctx('prc'), 'pages')));
    await assertFails(getDocs(collection(ctx('prMath'), 'pages')));
  });

  it('admin and pr_central create/update/delete', async () => {
    for (const uid of ['admin', 'prc']) {
      await assertSucceeds(setDoc(doc(ctx(uid), `pages/new-${uid}`), page()));
      await assertSucceeds(updateDoc(doc(ctx(uid), 'pages/pub'), { order: 5 }));
      await assertSucceeds(deleteDoc(doc(ctx(uid), `pages/new-${uid}`)));
    }
  });

  it('dept PR, teacher, disabled and anon cannot write', async () => {
    for (const db of [ctx('prMath'), ctx('t1'), ctx('off'), anon()]) {
      await assertFails(setDoc(doc(db, 'pages/x'), page()));
      await assertFails(updateDoc(doc(db, 'pages/pub'), { order: 5 }));
      await assertFails(deleteDoc(doc(db, 'pages/pub')));
    }
  });

  it('validates shape', async () => {
    const a = ctx('admin');
    await assertFails(setDoc(doc(a, 'pages/x'), page({ title: '' })));
    await assertFails(setDoc(doc(a, 'pages/x'), page({ title: 'ก'.repeat(101) })));
    await assertFails(setDoc(doc(a, 'pages/x'), page({ order: '1' })));
    await assertFails(setDoc(doc(a, 'pages/x'), page({ published: 'yes' })));
    await assertFails(setDoc(doc(a, 'pages/x'), { ...page(), extra: 1 }));
    await assertFails(setDoc(doc(a, 'pages/x'), { title: 'a', order: 1, published: true }));
  });
});
