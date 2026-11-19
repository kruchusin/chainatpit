import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where } from 'firebase/firestore';
import { getEnv, seed, ctx as ctx0, anon as anon0 } from './setup.js';

let env;
const ctx = (uid) => ctx0(env, uid);
const anon = () => anon0(env);

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

describe('staff rules', () => {
  it('anon reads active staff, not inactive', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'staff/s1')));
    await assertFails(getDoc(doc(anon(), 'staff/s3')));
  });

  it('anon list query must filter active==true', async () => {
    await assertSucceeds(getDocs(query(collection(anon(), 'staff'), where('active', '==', true))));
    await assertFails(getDocs(collection(anon(), 'staff')));
  });

  it('t1 edits own bio/photoUrl/education/email', async () => {
    await assertSucceeds(
      updateDoc(doc(ctx('t1'), 'staff/s1'), { bio: 'b', photoUrl: 'u', education: 'e', email: 'a@b.c' })
    );
  });

  it('t1 cannot edit own position or departmentIds', async () => {
    await assertFails(updateDoc(doc(ctx('t1'), 'staff/s1'), { position: 'p' }));
    await assertFails(updateDoc(doc(ctx('t1'), 'staff/s1'), { departmentIds: ['sci'] }));
  });

  it('t1 cannot edit other staff', async () => {
    await assertFails(updateDoc(doc(ctx('t1'), 'staff/s2'), { bio: 'x' }));
  });

  it('prMath edits position of s1 (math member)', async () => {
    await assertSucceeds(updateDoc(doc(ctx('prMath'), 'staff/s1'), { position: 'ครูชำนาญการ' }));
  });

  it('prMath cannot edit s2 (sci)', async () => {
    await assertFails(updateDoc(doc(ctx('prMath'), 'staff/s2'), { position: 'x' }));
  });

  it('prMath may remove math from s1 but keep academic', async () => {
    await assertSucceeds(updateDoc(doc(ctx('prMath'), 'staff/s1'), { departmentIds: ['academic'] }));
  });

  it('prMath cannot remove academic from s1', async () => {
    await assertFails(updateDoc(doc(ctx('prMath'), 'staff/s1'), { departmentIds: ['math'] }));
  });

  it('prMath cannot add sci to s1', async () => {
    await assertFails(
      updateDoc(doc(ctx('prMath'), 'staff/s1'), { departmentIds: ['math', 'academic', 'sci'] })
    );
  });

  it('prMath cannot change uid', async () => {
    await assertFails(updateDoc(doc(ctx('prMath'), 'staff/s1'), { uid: 'x' }));
  });

  it('prMath can set active=false on s1', async () => {
    await assertSucceeds(updateDoc(doc(ctx('prMath'), 'staff/s1'), { active: false }));
  });

  it('only admin creates/deletes staff', async () => {
    await assertFails(
      setDoc(doc(ctx('prMath'), 'staff/new'), { departmentIds: ['math'], active: true })
    );
    await assertSucceeds(deleteDoc(doc(ctx('admin'), 'staff/s2')));
  });

  it('phone field rejected for everyone', async () => {
    await assertFails(updateDoc(doc(ctx('admin'), 'staff/s1'), { phone: '0812345678' }));
    await assertFails(updateDoc(doc(ctx('t1'), 'staff/s1'), { phone: '0812345678' }));
    await assertFails(
      setDoc(doc(ctx('admin'), 'staff/new'), { departmentIds: [], active: true, phone: '0812345678' })
    );
  });

  it('admin lists all staff incl. inactive (no filter)', async () => {
    const snap = await assertSucceeds(getDocs(collection(ctx('admin'), 'staff')));
    if (!snap.docs.some((d) => d.id === 's3')) throw new Error('inactive s3 missing');
  });

  it('prMath lists staff of math via array-contains (incl. inactive s3)', async () => {
    const snap = await assertSucceeds(
      getDocs(query(collection(ctx('prMath'), 'staff'), where('departmentIds', 'array-contains', 'math')))
    );
    if (!snap.docs.some((d) => d.id === 's3')) throw new Error('inactive s3 missing');
  });

  it('prMulti lists each owned department separately', async () => {
    await assertSucceeds(
      getDocs(query(collection(ctx('prMulti'), 'staff'), where('departmentIds', 'array-contains', 'academic')))
    );
  });

  it('t1 (no prDepartments) and disabled admin cannot list unfiltered', async () => {
    await assertFails(getDocs(collection(ctx('t1'), 'staff')));
    await assertFails(getDocs(collection(ctx('off'), 'staff')));
  });

  it('get of inactive staff stays scoped: prMath gets s3; anon and t1 cannot', async () => {
    await assertSucceeds(getDoc(doc(ctx('prMath'), 'staff/s3')));
    await assertFails(getDoc(doc(anon(), 'staff/s3')));
    await assertFails(getDoc(doc(ctx('t1'), 'staff/s3')));
  });
});
