import { z } from "zod";

export const serviceConfigSchema = z.object({
  name: z.string().min(1, "name is required"),
  url: z.string().url("url must be a valid HTTP/HTTPS URL"),
  env: z.string().default("default"),
  expected_version: z.string().optional(),
  version_path: z.string().optional(),
  version_header: z.string().optional(),
});

export const configFileSchema = z.object({
  services: z
    .array(serviceConfigSchema)
    .min(1, "services list must not be empty"),
});

/** Camel-cased shape used internally (DB + poller). */
export type ServiceConfig = {
  name: string;
  url: string;
  env: string;
  expectedVersion?: string;
  versionPath?: string;
  versionHeader?: string;
};

export type ConfigFile = {
  services: ServiceConfig[];
};
