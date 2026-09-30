import { fetchAllPages } from '../paging';

const rows = Array.from({ length: 25 }, (_, i) => i);
const source = (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: null });

describe('fetchAllPages', () => {
  it('reads past the page size without losing or duplicating rows', async () => {
    expect((await fetchAllPages(source, 10)).data).toEqual(rows);
    expect((await fetchAllPages(source, 25)).data).toEqual(rows);
    expect((await fetchAllPages(source, 100)).data).toEqual(rows);
  });

  it('fails the whole read when one page fails', async () => {
    const flaky = (from: number, to: number) =>
      from === 10 ? Promise.resolve({ data: null, error: new Error('offline') }) : source(from, to);
    const r = await fetchAllPages(flaky, 10);
    expect(r.data).toBeNull();
    expect(r.error).toBeTruthy();
  });
});
