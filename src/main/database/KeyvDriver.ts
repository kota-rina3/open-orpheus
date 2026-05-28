import { DatabaseSync, SQLInputValue } from "node:sqlite";

import { SqliteDriver } from "@keyv/sqlite";

function coerceParams(params: unknown[]): SQLInputValue[] {
  return params.map((p) =>
    p !== null && typeof p === "object"
      ? JSON.stringify(p)
      : (p as SQLInputValue)
  );
}

export default function getKeyvDriver(db: DatabaseSync) {
  const driver: SqliteDriver = {
    name: "custom",
    async connect(): ReturnType<SqliteDriver["connect"]> {
      return {
        async query(sql, ...params) {
          const p = coerceParams(params);
          const normalized = sql.trimStart().toUpperCase();
          if (
            normalized.startsWith("SELECT") ||
            normalized.startsWith("PRAGMA") ||
            /\bRETURNING\b/.test(normalized)
          ) {
            return db.prepare(sql).all(...p);
          }
          db.prepare(sql).run(...p);
          return [];
        },
        async close() {},
      };
    },
  };
  return driver;
}
