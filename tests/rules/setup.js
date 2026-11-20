import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';
import { doc, setDoc } from 'firebase/firestore';

export const PROJECT_ID = 'demo-chainatpit';

export async function getEnv() {
  return initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
  });
}

export async function seed(env) {
  await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    const put = (path, data) => setDoc(doc(db, path), data);

    await put('settings/site', { name: 'โรงเรียนชัยนาทพิทยาคม' });

    await put('users/admin', { role: 'admin', prDepartments: [], disabled: false });
    await put('users/prc', { role: 'pr_central', prDepartments: [], disabled: false });
    await put('users/prMath', { role: 'teacher', prDepartments: ['math'], disabled: false });
    await put('users/prMulti', { role: 'teacher', prDepartments: ['math', 'academic'], disabled: false });
    await put('users/t1', { role: 'teacher', prDepartments: [], staffId: 's1', disabled: false });
    await put('users/off', { role: 'admin', prDepartments: [], disabled: true });

    await put('departments/math', { name: 'คณิตศาสตร์', type: 'subject', description: '', coverUrl: '' });
    await put('departments/sci', { name: 'วิทยาศาสตร์', type: 'subject', description: '', coverUrl: '' });
    await put('departments/academic', { name: 'ฝ่ายวิชาการ', type: 'division', description: '', coverUrl: '' });

    await put('staff/s1', { uid: 't1', departmentIds: ['math', 'academic'], active: true });
    await put('staff/s2', { uid: null, departmentIds: ['sci'], active: true });
    await put('staff/s3', { uid: null, departmentIds: ['math'], active: false });

    await put('news/nMath', { departmentIds: ['math'], published: true });
    await put('news/nSci', { departmentIds: ['sci'], published: true });
    await put('news/nGen', { departmentIds: [], published: true });
    await put('news/nDraft', { departmentIds: ['math'], published: false });
  });
}

export const ctx = (env, uid) => env.authenticatedContext(uid).firestore();
export const anon = (env) => env.unauthenticatedContext().firestore();
