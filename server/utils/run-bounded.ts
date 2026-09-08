/**
 * Run async tasks with a cap on how many are in flight.
 *
 * Unbounded `Promise.all` against the Postgres pool is not parallelism on Fly.
 * The pool is ten connections wide (`server/db/client.ts`) and shared with every
 * other request on the one always-on process. Pulse used to open ~20 aggregations
 * at once; Usage another dozen. On Netlify each function isolate had its own pool,
 * so the fan-out only hurt that one request. Here it pinned the process: Pulse
 * held every connection until the slowest COUNT DISTINCT finished, the proxy saw
 * no first byte, and the dashboard sat on "Loading…".
 */

export async function runBounded<T extends readonly unknown[]>(
  tasks: { readonly [K in keyof T]: () => Promise<T[K]> },
  limit = 3,
): Promise<{ -readonly [K in keyof T]: T[K] }> {
  const list = tasks as ReadonlyArray<() => Promise<unknown>>;
  if (list.length === 0) return [] as { -readonly [K in keyof T]: T[K] };

  const results: unknown[] = new Array(list.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= list.length) return;
      results[index] = await list[index]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, list.length) }, () => worker());
  await Promise.all(workers);
  return results as { -readonly [K in keyof T]: T[K] };
}
