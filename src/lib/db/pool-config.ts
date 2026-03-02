import type { PoolConfig } from "pg";

/**
 * Builds a pg.Pool config from a connection string, adding SSL settings
 * when needed.
 *
 * The `pg` driver (v9+) treats sslmode=require/prefer as verify-full,
 * which rejects RDS certificates that Node.js doesn't trust. For these
 * modes we strip sslmode from the URL and set `ssl.rejectUnauthorized`
 * explicitly — the old sslmode=require behavior (encryption without
 * cert verification). VPC-level network controls provide the trust
 * boundary.
 *
 * We must strip the param because pg-connection-string parses sslmode
 * from the URL AFTER pool-level config and overrides it via
 * Object.assign, so an explicit `ssl` config on the Pool is ignored.
 *
 * sslmode=verify-full is left in the URL (user wants strict verification).
 * sslmode=disable and connections without sslmode get no ssl config.
 */
export function buildPoolConfig(connectionString: string): PoolConfig {
  const sslModeMatch = connectionString.match(/[?&]sslmode=([^&]*)/);
  const sslMode = sslModeMatch?.[1];

  let cleanedUrl = connectionString;
  let ssl: PoolConfig["ssl"];

  if (sslMode === "require" || sslMode === "prefer") {
    // Strip sslmode from the URL so pg-connection-string doesn't
    // parse it into verify-full, then set ssl explicitly.
    cleanedUrl = connectionString.replace(/([?&])sslmode=[^&]*(&?)/, (_, prefix, suffix) => {
      // If sslmode was the only query param: remove the '?'
      // If it was first of many: keep the '?' by replacing '&' with '?'
      if (prefix === "?" && suffix === "&") return "?";
      if (prefix === "?" && suffix === "") return "";
      // sslmode was a middle/last param prefixed with '&'
      return suffix ? "" : "";
    });
    ssl = { rejectUnauthorized: false };
  }

  return {
    connectionString: cleanedUrl,
    ssl,
    max: 20,
    min: 2,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  };
}
