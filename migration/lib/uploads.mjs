// Upload step shared by news and staff import. `upload(src, index)` returns a URL or throws.
// Rule: a doc is written only if EVERY image uploaded; otherwise nothing is written so a re-run retries it.
export async function uploadAll(sources, upload) {
  const urls = [];
  const errors = [];
  for (const [i, src] of sources.entries()) {
    try { urls.push(await upload(src, i)); } catch (e) { errors.push({ index: i, src, message: e.message }); }
  }
  return { urls, errors, shouldWrite: shouldWriteDoc(errors) };
}

export const shouldWriteDoc = (errors) => errors.length === 0;
