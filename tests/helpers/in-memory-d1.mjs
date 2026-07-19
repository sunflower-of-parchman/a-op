import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const migrationsDirectory = new URL("../../drizzle/", import.meta.url);

function d1Meta(changes = 0, lastRowId = 0) {
  return {
    changed_db: false,
    changes,
    duration: 0,
    last_row_id: lastRowId,
    rows_read: 0,
    rows_written: changes,
    served_by: "in-memory-sqlite",
    size_after: 0,
  };
}

class InMemoryD1PreparedStatement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new InMemoryD1PreparedStatement(this.database, this.sql, bindings);
  }

  first(columnName) {
    const row = this.database.prepare(this.sql).get(...this.bindings);
    if (row === undefined) return null;
    return columnName === undefined ? row : (row[columnName] ?? null);
  }

  all() {
    const results = this.database.prepare(this.sql).all(...this.bindings);
    return { success: true, results, meta: d1Meta() };
  }

  raw() {
    const statement = this.database.prepare(this.sql);
    const columnNames = statement.columns().map(({ name }) => name);
    const rows = statement.all(...this.bindings);
    return rows.map((row) => columnNames.map((name) => row[name]));
  }

  run() {
    const result = this.database.prepare(this.sql).run(...this.bindings);
    return {
      success: true,
      results: [],
      meta: d1Meta(Number(result.changes), Number(result.lastInsertRowid ?? 0)),
    };
  }
}

class InMemoryD1Binding {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new InMemoryD1PreparedStatement(this.database, sql);
  }

  batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

async function applyMigrations(database) {
  const migrationUrls = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.+\.sql$/.test(name))
    .sort()
    .map((name) => new URL(name, migrationsDirectory));

  for (const migrationUrl of migrationUrls) {
    const source = await readFile(migrationUrl, "utf8");
    const statements = source
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) database.exec(statement);
  }
}

export async function createInMemoryD1() {
  const database = new DatabaseSync(":memory:");
  await applyMigrations(database);
  database.exec("PRAGMA foreign_keys = ON");

  return {
    binding: new InMemoryD1Binding(database),
    database,
    close() {
      database.close();
    },
  };
}

export function scalar(database, sql, ...bindings) {
  const row = database.prepare(sql).get(...bindings);
  return row ? Object.values(row)[0] : null;
}
