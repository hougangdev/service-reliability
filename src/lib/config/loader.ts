import { parse as parseYaml } from "yaml";
import { configFileSchema, type ConfigFile, type ServiceConfig } from "./schema";

/**
 * Replace ${VAR} and ${VAR:-default} patterns with environment variable
 * values. Used to make services.yaml portable across Docker Compose
 * (default) and production (env-var override).
 */
export function interpolateEnvVars(content: string): string {
  return content.replace(/\$\{(\w+)(?::-(.*?))?\}/g, (_match, name, fallback) => {
    return process.env[name] ?? fallback ?? "";
  });
}

/**
 * Parse and validate a YAML string containing service definitions.
 * Throws a descriptive error on any validation or parse failure.
 */
export function parseConfig(yamlContent: string): ConfigFile {
  let raw: unknown;

  try {
    raw = parseYaml(interpolateEnvVars(yamlContent));
  } catch (err) {
    throw new Error(`Failed to parse YAML: ${(err as Error).message}`);
  }

  const result = configFileSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid config: ${issues}`);
  }

  const services: ServiceConfig[] = result.data.services.map((svc) => ({
    name: svc.name,
    url: svc.url,
    env: svc.env,
    expectedVersion: svc.expected_version,
    versionPath: svc.version_path,
    versionHeader: svc.version_header,
  }));

  // Guard against duplicate names (would violate the DB unique constraint)
  const seen = new Set<string>();
  for (const svc of services) {
    if (seen.has(svc.name)) {
      throw new Error(`Duplicate service name detected: "${svc.name}"`);
    }
    seen.add(svc.name);
  }

  return { services };
}

/**
 * Load and parse the services.yaml file from the given path.
 * Defaults to the repo-root services.yaml when no path is provided.
 */
export async function loadConfigFile(
  filePath?: string
): Promise<ConfigFile> {
  const { readFile } = await import("fs/promises");
  const { resolve } = await import("path");

  const target = filePath ?? resolve(process.cwd(), "services.yaml");
  let content: string;

  try {
    content = await readFile(target, "utf8");
  } catch (err) {
    throw new Error(`Could not read config file at "${target}": ${(err as Error).message}`);
  }

  return parseConfig(content);
}
