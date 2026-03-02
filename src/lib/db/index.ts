import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Defer throwing until a query is actually executed so `next build` doesn't
// fail when DATABASE_URL isn't set in the build environment.
function getDb() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

let _db: ReturnType<typeof getDb> | undefined;

function lazyDb(): ReturnType<typeof getDb> {
  if (!_db) _db = getDb();
  return _db;
}

export const db: ReturnType<typeof getDb> = new Proxy({} as ReturnType<typeof getDb>, {
  get(_target, prop) {
    return (lazyDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export * from "./schema";
