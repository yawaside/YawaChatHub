import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * Ленивое подключение к PostgreSQL.
 *
 * Пул и клиент Drizzle создаются при ПЕРВОМ обращении, а не при импорте модуля.
 * Это важно для `next build`: на этапе «Collecting page data» Next.js импортирует
 * route-модули (например /api/health), и без DATABASE_URL (CI, GitHub Actions)
 * сборка раньше падала с ошибкой «DATABASE_URL is required».
 */

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __arenaNextJsPostgresqlDb?: NodePgDatabase;
};

/** Задан ли DATABASE_URL в окружении. */
export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getPool(): Pool {
  if (!globalForDb.__arenaNextJsPostgresqlPool) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required");
    }
    globalForDb.__arenaNextJsPostgresqlPool = new Pool({ connectionString: databaseUrl });
  }
  return globalForDb.__arenaNextJsPostgresqlPool;
}

export function getDb(): NodePgDatabase {
  if (!globalForDb.__arenaNextJsPostgresqlDb) {
    globalForDb.__arenaNextJsPostgresqlDb = drizzle(getPool());
  }
  return globalForDb.__arenaNextJsPostgresqlDb;
}

/**
 * Совместимый экспорт: `import { db } from "@/db"` работает как раньше,
 * но реальный клиент создаётся только при первом обращении к его свойствам.
 */
export const db: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});
