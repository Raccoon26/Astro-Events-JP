export class D1Meter {
  readonly totals = {
    calls: 0,
    statements: 0,
    rowsRead: 0,
    rowsWritten: 0,
    measured: true,
  };
  readonly db: D1Database;
  private readonly originals = new WeakMap<
    D1PreparedStatement,
    D1PreparedStatement
  >();
  constructor(database: D1Database) {
    const record = <T>(result: D1Result<T>) => {
      this.totals.statements++;
      if (
        !Number.isFinite(result.meta?.rows_read) ||
        !Number.isFinite(result.meta?.rows_written)
      )
        this.totals.measured = false;
      this.totals.rowsRead += result.meta?.rows_read ?? 0;
      this.totals.rowsWritten += result.meta?.rows_written ?? 0;
      return result;
    };
    const wrap = (statement: D1PreparedStatement): D1PreparedStatement => {
      const wrapped = {
        bind: (...values: unknown[]) => wrap(statement.bind(...values)),
        all: async <T>() => {
          this.totals.calls++;
          return record(await statement.all<T>());
        },
        run: async <T>() => {
          this.totals.calls++;
          return record(await statement.run<T>());
        },
        first: async <T>(column?: string) => {
          this.totals.calls++;
          const row = record(await statement.all<Record<string, unknown>>())
            .results[0];
          return (column ? (row?.[column] ?? null) : (row ?? null)) as T | null;
        },
      } as unknown as D1PreparedStatement;
      this.originals.set(wrapped, statement);
      return wrapped;
    };
    this.db = {
      prepare: (sql: string) => wrap(database.prepare(sql)),
      batch: async <T>(statements: D1PreparedStatement[]) => {
        this.totals.calls++;
        const results = await database.batch<T>(
          statements.map((s) => this.originals.get(s) ?? s),
        );
        return results.map(record);
      },
    } as unknown as D1Database;
  }
  snapshot() {
    return { ...this.totals };
  }
}
