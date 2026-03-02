import { JSONPath } from "jsonpath-plus";

export type VersionInput = {
  responseText: string | null;
  versionPath?: string | null;
  versionHeader?: string | null;
  headers?: Pick<Headers, "get"> | null;
};

/**
 * Extracts an observed version string from a check result.
 * Prefers versionPath (JSON body extraction) over versionHeader.
 * Returns null on any parse/lookup failure — availability ≠ version.
 */
export function extractVersion(input: VersionInput): string | null {
  const { responseText, versionPath, versionHeader, headers } = input;

  if (versionPath) {
    if (!responseText) return null;
    try {
      const parsed = JSON.parse(responseText) as Record<string, unknown>;
      const matches = JSONPath({ path: versionPath, json: parsed, resultType: "value" }) as unknown[];
      const value = matches[0];
      return typeof value === "string" ? value : null;
    } catch {
      return null;
    }
  }

  if (versionHeader && headers) {
    const value = headers.get(versionHeader.toLowerCase());
    return value ?? null;
  }

  return null;
}
