import { describe, it, expect } from "vitest";
import { buildPoolConfig } from "@/lib/db/pool-config";

describe("buildPoolConfig", () => {
  it("strips sslmode=require from URL and sets ssl.rejectUnauthorized=false", () => {
    const config = buildPoolConfig(
      "postgresql://user:pass@host:5432/db?sslmode=require"
    );

    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(config.connectionString).toBe(
      "postgresql://user:pass@host:5432/db"
    );
  });

  it("strips sslmode=prefer from URL and sets ssl.rejectUnauthorized=false", () => {
    const config = buildPoolConfig(
      "postgresql://user:pass@host:5432/db?sslmode=prefer"
    );

    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(config.connectionString).toBe(
      "postgresql://user:pass@host:5432/db"
    );
  });

  it("preserves other query params when stripping sslmode (sslmode first)", () => {
    const config = buildPoolConfig(
      "postgresql://user:pass@host:5432/db?sslmode=require&connect_timeout=10"
    );

    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(config.connectionString).toBe(
      "postgresql://user:pass@host:5432/db?connect_timeout=10"
    );
  });

  it("preserves other query params when stripping sslmode (sslmode last)", () => {
    const config = buildPoolConfig(
      "postgresql://user:pass@host:5432/db?connect_timeout=10&sslmode=require"
    );

    expect(config.ssl).toEqual({ rejectUnauthorized: false });
    expect(config.connectionString).toBe(
      "postgresql://user:pass@host:5432/db?connect_timeout=10"
    );
  });

  it("does not add ssl config for localhost connections without sslmode", () => {
    const config = buildPoolConfig(
      "postgresql://postgres:postgres@localhost:5432/service_monitor"
    );

    expect(config.ssl).toBeUndefined();
    expect(config.connectionString).toBe(
      "postgresql://postgres:postgres@localhost:5432/service_monitor"
    );
  });

  it("does not add ssl config when sslmode=disable", () => {
    const config = buildPoolConfig(
      "postgresql://user:pass@host:5432/db?sslmode=disable"
    );

    expect(config.ssl).toBeUndefined();
  });

  it("leaves sslmode=verify-full in the URL without overriding", () => {
    const config = buildPoolConfig(
      "postgresql://user:pass@host:5432/db?sslmode=verify-full"
    );

    // verify-full means the user explicitly wants cert verification — respect it
    expect(config.ssl).toBeUndefined();
    expect(config.connectionString).toBe(
      "postgresql://user:pass@host:5432/db?sslmode=verify-full"
    );
  });

  it("includes base pool settings", () => {
    const config = buildPoolConfig(
      "postgresql://user:pass@host:5432/db?sslmode=require"
    );

    expect(config.max).toBe(20);
    expect(config.min).toBe(2);
    expect(config.idleTimeoutMillis).toBe(30_000);
    expect(config.connectionTimeoutMillis).toBe(5_000);
    expect(config.statement_timeout).toBe(10_000);
  });
});
