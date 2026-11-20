// Pure permission logic for R2 media paths. Replaces the former storage.rules.
// No I/O, no npm imports.
const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;
const FILE_RE = /^[A-Za-z0-9._-]{1,100}$/;
const isFile = (s) => FILE_RE.test(s) && s !== '.' && s !== '..';

export function parseMediaPath(path) {
  if (typeof path !== 'string' || path === '' || path.includes('%')) return null;
  const parts = path.split('/');
  if (parts.length === 2) {
    const [kind, file] = parts;
    return kind === 'site' && isFile(file) ? { kind: 'site', id: null, file } : null;
  }
  if (parts.length === 3) {
    const [kind, id, file] = parts;
    if (!ID_RE.test(id) || !isFile(file)) return null;
    if (kind === 'news' || kind === 'departments') return { kind, id, file };
    if (kind === 'staff' && file === 'photo.jpg') return { kind, id, file };
  }
  return null;
}

export function parseMediaPrefix(prefix) {
  if (typeof prefix !== 'string' || prefix.includes('%')) return null;
  const m = /^(news|departments)\/([^/]+)\/$/.exec(prefix);
  return m && ID_RE.test(m[2]) ? { kind: m[1], id: m[2] } : null;
}

export function targetDocPath(parsed) {
  if (!parsed || parsed.kind === 'site') return null;
  return `${parsed.kind}/${parsed.id}`;
}

const arr = (v) => (Array.isArray(v) ? v : []);

export function canWriteMedia(user, parsed, targetDoc, uid, { forDelete = false } = {}) {
  if (!user || typeof user !== 'object' || user.disabled === true || !parsed) return false;
  const isAdmin = user.role === 'admin';
  const isCentral = isAdmin || user.role === 'pr_central';
  const prDepts = arr(user.prDepartments);

  switch (parsed.kind) {
    case 'site':
      return isAdmin;
    case 'departments':
      return isAdmin || prDepts.includes(parsed.id);
    case 'news': {
      if (isCentral) return true; // covers forDelete with the news doc already gone
      if (!targetDoc) return false;
      const ids = arr(targetDoc.departmentIds);
      return ids.length > 0 && ids.every((d) => prDepts.includes(d));
    }
    case 'staff': {
      if (isAdmin) return true;
      if (!targetDoc) return false;
      const docUid = targetDoc.uid === undefined ? null : targetDoc.uid;
      return (docUid === uid && uid != null) || arr(targetDoc.departmentIds).some((d) => prDepts.includes(d));
    }
    default:
      return false;
  }
}
