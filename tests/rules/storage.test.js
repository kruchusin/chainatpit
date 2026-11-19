import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { ref, uploadBytes, getBytes, deleteObject } from 'firebase/storage';
import { getEnv, seed, st as st0, anonStorage as anonStorage0, img, bytes } from './setup.js';

let env;
const st = (uid) => st0(env, uid);
const anonStorage = () => anonStorage0(env);

// uploadBytes takes (ref, data, metadata); fixture objects are {data, metadata}
const up = (storage, path, f) => uploadBytes(ref(storage, path), f.data, f.metadata);

// seed an object with security rules disabled
const putObj = (path, f = img(100)) =>
  env.withSecurityRulesDisabled(async (c) => {
    await uploadBytes(ref(c.storage(), path), f.data, f.metadata);
  });

beforeAll(async () => { env = await getEnv(); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await seed(env);
});

describe('storage rules', () => {
  it('anon reads any image', async () => {
    await putObj('news/nMath/a.jpg');
    await assertSucceeds(getBytes(ref(anonStorage(), 'news/nMath/a.jpg')));
  });
  it('anon cannot upload', () =>
    assertFails(up(anonStorage(), 'news/nMath/a.jpg', img(1000))));
  it('t1 uploads own photo', () =>
    assertSucceeds(up(st('t1'), 'staff/s1/photo.jpg', img(500_000))));
  it('t1 cannot upload for s2', () =>
    assertFails(up(st('t1'), 'staff/s2/photo.jpg', img(1000))));
  it('prMath uploads staff photo of own department', () =>
    assertSucceeds(up(st('prMath'), 'staff/s1/photo.jpg', img(1000))));
  it('prMath cannot upload staff photo of other department', () =>
    assertFails(up(st('prMath'), 'staff/s2/photo.jpg', img(1000))));
  it('prMath uploads to news of math', () =>
    assertSucceeds(up(st('prMath'), 'news/nMath/b.jpg', img(1000))));
  it('prMath cannot upload to nSci', () =>
    assertFails(up(st('prMath'), 'news/nSci/b.jpg', img(1000))));
  it('prMath cannot upload to department-less news', () =>
    assertFails(up(st('prMath'), 'news/nGen/b.jpg', img(1000))));
  it('prc uploads to any news', () =>
    assertSucceeds(up(st('prc'), 'news/nGen/b.jpg', img(1000))));
  it('prMath uploads to own department folder', () =>
    assertSucceeds(up(st('prMath'), 'departments/math/cover.jpg', img(1000))));
  it('prMath cannot upload to other department folder', () =>
    assertFails(up(st('prMath'), 'departments/sci/cover.jpg', img(1000))));
  it('rejects > 2 MB', () =>
    assertFails(up(st('admin'), 'site/big.jpg', img(2 * 1024 * 1024 + 1))));
  it('accepts exactly 2 MB', () =>
    assertSucceeds(up(st('admin'), 'site/ok.jpg', img(2 * 1024 * 1024))));
  it('rejects non-image', () =>
    assertFails(up(st('admin'), 'site/x.pdf', bytes(10, 'application/pdf'))));
  it('only admin writes site/', () =>
    assertFails(up(st('prc'), 'site/logo.png', img(1000))));
  it('admin writes site/', () =>
    assertSucceeds(up(st('admin'), 'site/logo.png', img(1000))));
  it('disabled admin cannot write', () =>
    assertFails(up(st('off'), 'site/logo.png', img(1000))));
  it('unknown path is denied even for admin', () =>
    assertFails(up(st('admin'), 'other/x.jpg', img(1000))));
  it('staff path other than photo.jpg is denied', () =>
    assertFails(up(st('admin'), 'staff/s1/other.jpg', img(1000))));
  it('prMath can delete in own news', async () => {
    await putObj('news/nMath/d.jpg');
    await assertSucceeds(deleteObject(ref(st('prMath'), 'news/nMath/d.jpg')));
  });
  it('prMath cannot delete in nSci', async () => {
    await putObj('news/nSci/d.jpg');
    await assertFails(deleteObject(ref(st('prMath'), 'news/nSci/d.jpg')));
  });
  it('t1 cannot delete site file', async () => {
    await putObj('site/d.jpg');
    await assertFails(deleteObject(ref(st('t1'), 'site/d.jpg')));
  });
});
