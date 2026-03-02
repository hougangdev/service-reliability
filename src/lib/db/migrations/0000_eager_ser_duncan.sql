CREATE TABLE IF NOT EXISTS "service_checks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"service_id" uuid NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ok" boolean NOT NULL,
	"status_code" integer,
	"latency_ms" integer,
	"observed_version" text,
	"error" text,
	"run_id" uuid
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"env" text DEFAULT 'default' NOT NULL,
	"expected_version" text,
	"version_path" text,
	"version_header" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_name_unique" UNIQUE("name")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "service_checks" ADD CONSTRAINT "service_checks_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_checks_service_checked_idx" ON "service_checks" USING btree ("service_id","checked_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "service_checks_checked_at_idx" ON "service_checks" USING btree ("checked_at");