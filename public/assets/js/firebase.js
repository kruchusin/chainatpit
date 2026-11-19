// Firebase init (CDN, no build step). The SDK version is defined ONLY here.
export const FIREBASE_VERSION = '11.10.0';

const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

// ค่า web config เป็นข้อมูลสาธารณะ (ไม่ใช่ความลับ) แต่ยังไม่มีค่าจริง
// ให้ไปคัดลอกจาก Firebase console → Project settings → General → Your apps (Web app)
const config = {
  apiKey: 'REPLACE_WITH_WEB_API_KEY',               // Firebase console → Project settings → Web API Key
  authDomain: 'chainatpit-a8c9c.firebaseapp.com',
  projectId: 'chainatpit-a8c9c',
  storageBucket: 'chainatpit-a8c9c.firebasestorage.app',
  messagingSenderId: 'REPLACE_WITH_MESSAGING_SENDER_ID', // Firebase console → Project settings → Cloud Messaging
  appId: 'REPLACE_WITH_APP_ID',                      // Firebase console → Project settings → Your apps
};
// Emulators run under this project id (see package.json test scripts)
if (isLocal) { config.projectId = 'demo-chainatpit'; config.apiKey = 'demo-key'; }

const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
const [appMod, authMod, fsMod, stMod] = await Promise.all([
  import(`${base}/firebase-app.js`),
  import(`${base}/firebase-auth.js`),
  import(`${base}/firebase-firestore.js`),
  import(`${base}/firebase-storage.js`),
]);

export const app = appMod.initializeApp(config);
export const auth = authMod.getAuth(app);
export const db = fsMod.getFirestore(app);
export const storage = stMod.getStorage(app);

if (isLocal) {
  authMod.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  fsMod.connectFirestoreEmulator(db, '127.0.0.1', 8080);
  stMod.connectStorageEmulator(storage, '127.0.0.1', 9199);
}

// SDK namespaces re-exported so other modules never repeat the versioned URL.
export const authSdk = authMod;
export const firestoreSdk = fsMod;
export const storageSdk = stMod;
