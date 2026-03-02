import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  bigserial,
  integer,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

export const services = pgTable("services", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  url: text("url").notNull(),
  env: text("env").default("default").notNull(),
  expectedVersion: text("expected_version"),
  versionPath: text("version_path"),
  versionHeader: text("version_header"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const serviceChecks = pgTable(
  "service_checks",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    checkedAt: timestamp("checked_at", { withTimezone: true }).defaultNow().notNull(),
    ok: boolean("ok").notNull(),
    statusCode: integer("status_code"),
    latencyMs: integer("latency_ms"),
    observedVersion: text("observed_version"),
    error: text("error"),
    runId: uuid("run_id"),
  },
  (table) => [
    index("service_checks_service_checked_idx").on(table.serviceId, table.checkedAt),
    index("service_checks_checked_at_idx").on(table.checkedAt),
  ]
);

export const servicesRelations = relations(services, ({ many }) => ({
  checks: many(serviceChecks),
}));

export const serviceChecksRelations = relations(serviceChecks, ({ one }) => ({
  service: one(services),
}));

export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type ServiceCheck = typeof serviceChecks.$inferSelect;
export type NewServiceCheck = typeof serviceChecks.$inferInsert;
