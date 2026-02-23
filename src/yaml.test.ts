import { parseYaml, serializeYaml } from "./yaml.js";

describe("parseYaml", () => {
  it("parses flat key-value pairs", () => {
    const input = `active_branch: main\ninitialized: "2026-02-22T14:00:00Z"`;
    expect(parseYaml(input)).toStrictEqual({
      active_branch: "main",
      initialized: "2026-02-22T14:00:00Z",
    });
  });

  it("parses nested objects (one level)", () => {
    const input = `last_commit:\n  branch: main\n  hash: a1b2c3d4\n  summary: "Decided X"`;
    expect(parseYaml(input)).toStrictEqual({
      last_commit: { branch: "main", hash: "a1b2c3d4", summary: "Decided X" },
    });
  });

  it("returns empty object for empty or whitespace input", () => {
    expect(parseYaml("")).toStrictEqual({});
    expect(parseYaml("  \n  ")).toStrictEqual({});
  });
});

describe("serializeYaml", () => {
  it("serializes flat key-value pairs", () => {
    const obj = { active_branch: "main", initialized: "2026-02-22" };
    expect(serializeYaml(obj)).toBe(
      `active_branch: main\ninitialized: "2026-02-22"`
    );
  });

  it("serializes nested objects (one level)", () => {
    const obj = { last_commit: { branch: "main", hash: "a1b2c3d4" } };
    expect(serializeYaml(obj)).toBe(
      `last_commit:\n  branch: main\n  hash: a1b2c3d4`
    );
  });

  it("round-trips through parse and serialize", () => {
    const original = {
      active_branch: "main",
      last_commit: { branch: "main", hash: "abc" },
    };
    expect(parseYaml(serializeYaml(original))).toStrictEqual(original);
  });
});
