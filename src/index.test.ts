import { describe, expect, it } from "vitest";

describe("extension", () => {
  it("exports a default function", async () => {
    const mod = await import("./index.js");
    expect(typeof mod.default).toBe("function");
  });
});
