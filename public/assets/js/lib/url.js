// Adds/replaces a ?v= param so a re-uploaded file at the same path is not served from cache.
export function cacheBust(url, v = Date.now()) {
  const u = new URL(url);
  u.searchParams.set('v', String(v));
  return u.toString();
}
