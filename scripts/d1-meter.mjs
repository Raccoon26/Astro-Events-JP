// Provider-returned LOCAL D1 row counters; elapsed time is never CPU time.
export function meterD1(database) {
  const usage = { rowsRead: 0, rowsWritten: 0, queries: 0, sizeBytes: null };
  const record = (result) => {
    usage.queries++;
    usage.rowsRead += result.meta?.rows_read ?? 0;
    usage.rowsWritten += result.meta?.rows_written ?? 0;
    if (Number.isFinite(result.meta?.size_after))
      usage.sizeBytes = result.meta.size_after;
    return result;
  };
  function wrap(statement) {
    return {
      raw: statement,
      bind(...values) {
        return wrap(statement.bind(...values));
      },
      async all() {
        return record(await statement.all());
      },
      async run() {
        return record(await statement.run());
      },
      async first(column) {
        const row = (await this.all()).results[0];
        return column ? (row?.[column] ?? null) : (row ?? null);
      },
    };
  }
  return {
    usage,
    db: {
      prepare: (sql) => wrap(database.prepare(sql)),
      async batch(statements) {
        const results = await database.batch(statements.map((s) => s.raw));
        for (const r of results) record(r);
        return results;
      },
    },
  };
}
