import { describe, it, expect } from 'vitest';
import { collectFiltered } from '../../public/assets/js/lib/paginate.js';

// fake source: items 1..n, fetched `batch` at a time after a cursor item
function source(n, batch) {
  const all = Array.from({ length: n }, (_, i) => ({ id: i + 1 }));
  const calls = [];
  const fetchPage = async (after) => {
    calls.push(after ? after.id : null);
    const start = after ? after.id : 0;
    const docs = all.slice(start, start + batch);
    return { docs, more: start + batch < n };
  };
  return { fetchPage, calls };
}
const even = (d) => d.id % 2 === 0;

describe('collectFiltered', () => {
  it('fetches more pages until pageSize accepted items are found', async () => {
    const { fetchPage, calls } = source(20, 3);
    const r = await collectFiltered({ fetchPage, accept: even, pageSize: 4 });
    expect(r.items.map((d) => d.id)).toEqual([2, 4, 6, 8]);
    expect(r.cursor.id).toBe(8);
    expect(calls).toEqual([null, 3, 6]);
  });
  it('returns null cursor when source runs out before pageSize', async () => {
    const { fetchPage } = source(7, 3);
    const r = await collectFiltered({ fetchPage, accept: even, pageSize: 10 });
    expect(r.items.map((d) => d.id)).toEqual([2, 4, 6]);
    expect(r.cursor).toBeNull();
  });
  it('resumes after the cursor without repeating or skipping', async () => {
    const { fetchPage } = source(20, 3);
    const a = await collectFiltered({ fetchPage, accept: even, pageSize: 4 });
    const b = await collectFiltered({ fetchPage, accept: even, pageSize: 4, after: a.cursor });
    expect(b.items.map((d) => d.id)).toEqual([10, 12, 14, 16]);
  });
  it('handles an empty source', async () => {
    const { fetchPage } = source(0, 3);
    const r = await collectFiltered({ fetchPage, accept: even, pageSize: 4 });
    expect(r).toEqual({ items: [], cursor: null });
  });
});
