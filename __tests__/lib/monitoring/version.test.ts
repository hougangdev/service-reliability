import { describe, it, expect } from "vitest";
import { extractVersion } from "@/lib/monitoring/version";

function makeHeaders(map: Record<string, string>): Pick<Headers, "get"> {
  return { get: (k: string) => map[k.toLowerCase()] ?? null };
}

describe("extractVersion — JSON path", () => {
  it("extracts version from a simple JSON path", () => {
    const result = extractVersion({
      responseText: '{"version":"2.1.0"}',
      versionPath: "$.version",
    });
    expect(result).toBe("2.1.0");
  });

  it("extracts version from a nested JSON path", () => {
    const result = extractVersion({
      responseText: '{"data":{"build":{"version":"1.5.3"}}}',
      versionPath: "$.data.build.version",
    });
    expect(result).toBe("1.5.3");
  });

  it("returns null when JSON path finds no match", () => {
    const result = extractVersion({
      responseText: '{"other":"field"}',
      versionPath: "$.version",
    });
    expect(result).toBeNull();
  });

  it("returns null when response body is not valid JSON", () => {
    const result = extractVersion({
      responseText: "plain text response",
      versionPath: "$.version",
    });
    expect(result).toBeNull();
  });

  it("returns null when response body is empty", () => {
    const result = extractVersion({
      responseText: "",
      versionPath: "$.version",
    });
    expect(result).toBeNull();
  });

  it("returns null when response body is null", () => {
    const result = extractVersion({
      responseText: null,
      versionPath: "$.version",
    });
    expect(result).toBeNull();
  });
});

describe("extractVersion — response header", () => {
  it("extracts version from a response header", () => {
    const result = extractVersion({
      responseText: null,
      versionHeader: "x-app-version",
      headers: makeHeaders({ "x-app-version": "3.0.0" }),
    });
    expect(result).toBe("3.0.0");
  });

  it("returns null when the header is not present", () => {
    const result = extractVersion({
      responseText: null,
      versionHeader: "x-app-version",
      headers: makeHeaders({}),
    });
    expect(result).toBeNull();
  });

  it("is case-insensitive for header lookup", () => {
    const result = extractVersion({
      responseText: null,
      versionHeader: "X-App-Version",
      headers: makeHeaders({ "x-app-version": "1.0.0" }),
    });
    expect(result).toBe("1.0.0");
  });
});

describe("extractVersion — no extraction config", () => {
  it("returns null when neither versionPath nor versionHeader is provided", () => {
    const result = extractVersion({ responseText: '{"version":"2.0.0"}' });
    expect(result).toBeNull();
  });
});

describe("extractVersion — prefers versionPath over versionHeader when both given", () => {
  it("uses versionPath when both are configured", () => {
    const result = extractVersion({
      responseText: '{"version":"2.1.0"}',
      versionPath: "$.version",
      versionHeader: "x-app-version",
      headers: makeHeaders({ "x-app-version": "9.9.9" }),
    });
    expect(result).toBe("2.1.0");
  });
});
