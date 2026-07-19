/**
 * Executes a non-empty set of prepared D1 statements atomically.
 *
 * D1 `batch()` is the Worker transaction primitive. Callers prepare exactly
 * one SQL statement per item and know every identifier and binding before the
 * batch begins. Application code does not issue manual BEGIN/COMMIT queries.
 */
export async function runAtomicBatch(
  binding: D1Database,
  statements: readonly D1PreparedStatement[],
): Promise<D1Result<unknown>[]> {
  if (statements.length === 0) {
    throw new RangeError("An atomic D1 batch requires at least one statement.");
  }

  return binding.batch([...statements]);
}

export async function runPreparedStatement<T = Record<string, unknown>>(
  statement: D1PreparedStatement,
): Promise<D1Result<T>> {
  return statement.run<T>();
}
