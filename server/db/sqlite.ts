/**
 * Thin wrapper around Node's built-in SQLite (node:sqlite, Node 22.13+).
 * Using the built-in module means the app needs no native npm packages,
 * so it runs from the prebuilt bundle without `npm install`.
 */
import { DatabaseSync, backup as sqliteBackup, type StatementSync } from "node:sqlite";

export class Database {
  private db: DatabaseSync;

  constructor(path: string, opts: { readonly?: boolean } = {}) {
    this.db = new DatabaseSync(path, { readOnly: !!opts.readonly });
  }

  prepare(sql: string): StatementSync {
    return this.db.prepare(sql);
  }

  exec(sql: string) {
    this.db.exec(sql);
  }

  /** "journal_mode = WAL" sets, "user_version" with {simple:true} returns the value */
  pragma(statement: string, opts: { simple?: boolean } = {}): unknown {
    const rows = this.db.prepare(`PRAGMA ${statement}`).all() as Record<string, unknown>[];
    if (opts.simple) return rows[0] ? Object.values(rows[0])[0] : undefined;
    return rows;
  }

  /** Returns a function that runs fn inside a transaction (like better-sqlite3) */
  transaction<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
    return (...args: A) => {
      this.db.exec("BEGIN");
      try {
        const result = fn(...args);
        this.db.exec("COMMIT");
        return result;
      } catch (e) {
        this.db.exec("ROLLBACK");
        throw e;
      }
    };
  }

  /** Online backup to a file */
  async backup(destination: string) {
    await sqliteBackup(this.db, destination);
  }

  close() {
    this.db.close();
  }
}

export default Database;
