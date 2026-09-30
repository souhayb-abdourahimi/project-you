/** Supabase returns at most this many rows per request (project default `max_rows`). */
export const PAGE_SIZE = 1000;

type Page<T> = { data: T[] | null; error: unknown };

/**
 * Reads every row by requesting consecutive ranges until a short page comes back, so a table
 * above the server's row limit is never silently truncated. The query must be ordered by a
 * unique key for the pages to be stable. Any failed page fails the whole read.
 */
export async function fetchAllPages<T>(
  page: (from: number, to: number) => PromiseLike<Page<T>>,
  size = PAGE_SIZE,
): Promise<Page<T>> {
  const all: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error || !data) return { data: null, error: error ?? new Error('no data') };
    all.push(...data);
    if (data.length < size) return { data: all, error: null };
  }
}
