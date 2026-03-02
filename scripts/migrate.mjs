/**
 * Standalone migration runner — executed at container startup before the
 * Next.js server boots. Uses drizzle-orm's node-postgres migrator so
 * drizzle-kit is not required in the production image.
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error("[migrate] DATABASE_URL is not set");
  process.exit(1);
}

// pg v9+ treats sslmode=require as verify-full, which rejects RDS certs.
// Strip sslmode from URL and set ssl explicitly — pg-connection-string
// parses sslmode AFTER pool config and would override our ssl setting.
const sslMode = DATABASE_URL.match(/[?&]sslmode=([^&]*)/)?.[1];
let cleanedUrl = DATABASE_URL;
let ssl = undefined;

if (sslMode === "require" || sslMode === "prefer") {
  cleanedUrl = DATABASE_URL.replace(/([?&])sslmode=[^&]*(&?)/, (_, prefix, suffix) => {
    if (prefix === "?" && suffix === "&") return "?";
    if (prefix === "?" && suffix === "") return "";
    return "";
  });
  ssl = { rejectUnauthorized: false };
}

const pool = new Pool({
  connectionString: cleanedUrl,
  ssl,
  connectionTimeoutMillis: 10_000,
  statement_timeout: 30_000,
});
const db = drizzle(pool);

try {
  console.log("[migrate] Applying pending migrations…");
  await migrate(db, { migrationsFolder: join(__dirname, "../migrations") });
  console.log("[migrate] All migrations applied successfully");
} catch (err) {
  console.error("[migrate] Migration failed:", err);
  process.exit(1);
} finally {
  await pool.end();
}
