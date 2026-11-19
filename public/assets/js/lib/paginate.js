// Client-side filtered pagination over a cursor-paged source (no URL imports: testable in Node).
// fetchPage(after) -> Promise<{docs: any[], more: boolean}>; docs are in source order.
// Returns {items, cursor}: cursor is the last accepted doc (pass as `after` to resume) or null when exhausted.
export async function collectFiltered({ fetchPage, accept, pageSize, after }) {
  const items = [];
  let cur = after || null;
  for (;;) {
    const { docs, more } = await fetchPage(cur);
    for (const d of docs) {
      if (!accept(d)) continue;
      items.push(d);
      if (items.length === pageSize) return { items, cursor: d };
    }
    if (!more || docs.length === 0) return { items, cursor: null };
    cur = docs[docs.length - 1];
  }
}
