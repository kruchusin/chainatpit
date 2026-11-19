// Shared test helpers: RSA keys, signed Firebase-style ID tokens, service-account PEM.
export const P = 'proj-1';
export const T = 1_800_000_000; // seconds
export const NOW = T * 1000;
export const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const enc = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
const alg = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };

export const kp = await crypto.subtle.generateKey(alg, true, ['sign', 'verify']);
export const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };

export async function sign(payload, { kid = 'k1', key = kp.privateKey } = {}) {
  const h = enc({ alg: 'RS256', kid, typ: 'JWT' });
  const body = enc(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${h}.${body}`));
  return `${h}.${body}.${b64u(sig)}`;
}
export const good = (extra = {}) => ({
  aud: P, iss: `https://securetoken.google.com/${P}`, sub: 'u1', exp: T + 3600, iat: T, ...extra,
});

export async function makeServiceAccountPem() {
  const k = await crypto.subtle.generateKey(alg, true, ['sign', 'verify']);
  const der = Buffer.from(await crypto.subtle.exportKey('pkcs8', k.privateKey)).toString('base64');
  return `-----BEGIN PRIVATE KEY-----\n${der.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`;
}
