import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
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

describe('core rules: users, settings, departments', () => {
  it('anon reads settings/site, departments', async () => {
    await assertSucceeds(getDoc(doc(anon(), 'settings/site')));
    await assertSucceeds(getDoc(doc(anon(), 'departments/math')));
  });

  it('anon cannot read users', async () => {
    await assertFails(getDoc(doc(anon(), 'users/t1')));
  });

  it('user reads own users doc only', async () => {
    await assertSucceeds(getDoc(doc(ctx('t1'), 'users/t1')));
    await assertFails(getDoc(doc(ctx('t1'), 'users/prc')));
  });

  it('admin reads/writes any users doc', async () => {
    await assertSucceeds(getDoc(doc(ctx('admin'), 'users/prc')));
    await assertSucceeds(
      setDoc(doc(ctx('admin'), 'users/x'), { role: 'teacher', prDepartments: [], disabled: false })
    );
  });

  it('teacher cannot change own role', async () => {
    await assertFails(updateDoc(doc(ctx('t1'), 'users/t1'), { role: 'admin' }));
  });

  it('disabled admin cannot write', async () => {
    await assertFails(setDoc(doc(ctx('off'), 'settings/site'), { name: 'x' }));
  });

  it('only admin writes settings', async () => {
    await assertFails(updateDoc(doc(ctx('prc'), 'settings/site'), { name: 'x' }));
    await assertSucceeds(updateDoc(doc(ctx('admin'), 'settings/site'), { name: 'x' }));
  });

  it('admin creates/deletes departments', async () => {
    await assertSucceeds(
      setDoc(doc(ctx('admin'), 'departments/art'), { name: 'ศิลปะ', type: 'subject', description: '', coverUrl: '' })
    );
    await assertSucceeds(deleteDoc(doc(ctx('admin'), 'departments/art')));
  });

  it('prMath edits only description/coverUrl of math', async () => {
    await assertSucceeds(updateDoc(doc(ctx('prMath'), 'departments/math'), { description: 'd' }));
    await assertFails(updateDoc(doc(ctx('prMath'), 'departments/math'), { name: 'n' }));
    await assertFails(updateDoc(doc(ctx('prMath'), 'departments/sci'), { description: 'd' }));
  });

  it('prMath cannot create departments', async () => {
    await assertFails(setDoc(doc(ctx('prMath'), 'departments/z'), { name: 'z' }));
  });
});
