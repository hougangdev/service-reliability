import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseConfig, interpolateEnvVars } from "@/lib/config/loader";

const validYaml = `
services:
  - name: my-api
    url: http://localhost:3001/api/healthy
    env: staging
    expected_version: "2.1.0"
    version_path: "$.version"

  - name: other-api
    url: http://localhost:3001/api/other
    # no env, no version — should use defaults
`;

describe("parseConfig", () => {
  it("parses a valid YAML config", () => {
    const result = parseConfig(validYaml);
    expect(result.services).toHaveLength(2);
  });

  it("maps fields correctly for a full entry", () => {
    const result = parseConfig(validYaml);
    const svc = result.services[0];
    expect(svc.name).toBe("my-api");
    expect(svc.url).toBe("http://localhost:3001/api/healthy");
    expect(svc.env).toBe("staging");
    expect(svc.expectedVersion).toBe("2.1.0");
    expect(svc.versionPath).toBe("$.version");
    expect(svc.versionHeader).toBeUndefined();
  });

  it("applies default env of 'default' when env is omitted", () => {
    const result = parseConfig(validYaml);
    expect(result.services[1].env).toBe("default");
  });

  it("allows optional fields to be undefined", () => {
    const result = parseConfig(validYaml);
    const svc = result.services[1];
    expect(svc.expectedVersion).toBeUndefined();
    expect(svc.versionPath).toBeUndefined();
    expect(svc.versionHeader).toBeUndefined();
  });

  it("throws when name is missing", () => {
    const yaml = `
services:
  - url: http://localhost:3001/api/healthy
`;
    expect(() => parseConfig(yaml)).toThrow();
  });

  it("throws when url is missing", () => {
    const yaml = `
services:
  - name: my-api
`;
    expect(() => parseConfig(yaml)).toThrow();
  });

  it("throws when url is not a valid HTTP/HTTPS URL", () => {
    const yaml = `
services:
  - name: my-api
    url: not-a-url
`;
    expect(() => parseConfig(yaml)).toThrow();
  });

  it("throws when services list is empty", () => {
    const yaml = `
services: []
`;
    expect(() => parseConfig(yaml)).toThrow();
  });

  it("throws when services key is missing", () => {
    expect(() => parseConfig("name: something")).toThrow();
  });

  it("throws on invalid YAML syntax", () => {
    expect(() => parseConfig("services:\n  - name: [unclosed")).toThrow();
  });

  it("accepts version_header as an alternative to version_path", () => {
    const yaml = `
services:
  - name: header-api
    url: http://localhost:3001/api/healthy
    version_header: X-App-Version
`;
    const result = parseConfig(yaml);
    expect(result.services[0].versionHeader).toBe("X-App-Version");
    expect(result.services[0].versionPath).toBeUndefined();
  });

  it("returns a deduplicated list when duplicate names exist (throws)", () => {
    const yaml = `
services:
  - name: dup-api
    url: http://localhost:3001/api/healthy
  - name: dup-api
    url: http://localhost:3001/api/other
`;
    expect(() => parseConfig(yaml)).toThrow(/duplicate/i);
  });
});

describe("interpolateEnvVars", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.stubEnv("MOCK_SERVICES_URL", "https://mock.example.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("replaces ${VAR} with env var value", () => {
    const input = "url: ${MOCK_SERVICES_URL}/api/healthy";
    expect(interpolateEnvVars(input)).toBe("url: https://mock.example.com/api/healthy");
  });

  it("uses default when env var is not set", () => {
    const input = "url: ${UNSET_VAR:-http://localhost:3001}/api/healthy";
    expect(interpolateEnvVars(input)).toBe("url: http://localhost:3001/api/healthy");
  });

  it("prefers env var over default when both exist", () => {
    const input = "url: ${MOCK_SERVICES_URL:-http://localhost:3001}/api/healthy";
    expect(interpolateEnvVars(input)).toBe("url: https://mock.example.com/api/healthy");
  });

  it("handles multiple substitutions in one string", () => {
    vi.stubEnv("OTHER_VAR", "world");
    const input = "${MOCK_SERVICES_URL} and ${OTHER_VAR}";
    expect(interpolateEnvVars(input)).toBe("https://mock.example.com and world");
  });

  it("leaves unset vars without defaults as empty string", () => {
    const input = "url: ${TOTALLY_MISSING}/api";
    expect(interpolateEnvVars(input)).toBe("url: /api");
  });
});
