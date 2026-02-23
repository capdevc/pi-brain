/**
 * Minimal YAML parser and serializer for flat and one-level nested objects.
 * Handles the subset of YAML used by GCC state and metadata files.
 */

type YamlValue = string | Record<string, string>;
type YamlObject = Record<string, YamlValue>;

const NEEDS_QUOTING = /[-:{}[\],&*?|>!%@`]|^\d{4}-\d{2}/;

function unquote(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function quoteIfNeeded(value: string): string {
  if (NEEDS_QUOTING.test(value)) {
    return `"${value}"`;
  }
  return value;
}

export function parseYaml(input: string): YamlObject {
  const result: YamlObject = {};
  const lines = input.split("\n");
  let currentKey: string | null = null;
  let nested: Record<string, string> | null = null;

  for (const line of lines) {
    if (line.trim() === "") {
      continue;
    }

    const indented = line.startsWith("  ") && !line.startsWith("    ");
    if (indented && currentKey !== null) {
      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) {
        continue;
      }
      const key = line.slice(2, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();
      if (!nested) {
        nested = {};
      }
      nested[key] = unquote(val);
    } else {
      // Flush previous nested object
      if (currentKey !== null && nested !== null) {
        result[currentKey] = nested;
        nested = null;
      }

      const colonIdx = line.indexOf(":");
      if (colonIdx === -1) {
        continue;
      }
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();

      if (val === "") {
        // Start of nested object
        currentKey = key;
        nested = {};
      } else {
        currentKey = null;
        result[key] = unquote(val);
      }
    }
  }

  // Flush final nested object
  if (currentKey !== null && nested !== null) {
    result[currentKey] = nested;
  }

  return result;
}

export function serializeYaml(obj: YamlObject): string {
  const lines: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      lines.push(`${key}: ${quoteIfNeeded(value)}`);
    } else {
      lines.push(`${key}:`);
      for (const [nestedKey, nestedValue] of Object.entries(value)) {
        lines.push(`  ${nestedKey}: ${quoteIfNeeded(nestedValue)}`);
      }
    }
  }

  return lines.join("\n");
}
