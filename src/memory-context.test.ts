import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import fc from "fast-check";

import { BranchManager } from "./branches.js";
import { LOG_SIZE_WARNING_BYTES } from "./constants.js";
import { buildStatusView } from "./memory-context.js";
import { MemoryState } from "./state.js";

// Helpers

function setupMemoryProject(): {
  tmpDir: string;
  state: MemoryState;
  branches: BranchManager;
} {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-context-test-"));
  const memoryDir = path.join(tmpDir, ".memory");
  fs.mkdirSync(path.join(memoryDir, "branches"), { recursive: true });

  const state = new MemoryState(tmpDir);
  const branches = new BranchManager(tmpDir);

  fs.writeFileSync(
    path.join(memoryDir, "state.yaml"),
    'active_branch: main\ninitialized: "2026-02-22T14:00:00Z"'
  );
  state.load();

  branches.createBranch("main", "Main project memory");

  return { tmpDir, state, branches };
}

describe("buildStatusView", () => {
  let tmpDir: string;
  let state: MemoryState;
  let branches: BranchManager;

  beforeEach(() => {
    const setup = setupMemoryProject();
    ({ tmpDir } = setup);
    ({ state } = setup);
    ({ branches } = setup);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should return status overview with roadmap and branches", () => {
    // Arrange
    fs.writeFileSync(
      path.join(tmpDir, ".memory/main.md"),
      "# Roadmap\n\nGoals here.\n"
    );
    branches.appendCommit(
      "main",
      "\n---\n\n## Commit deadbeef | 2026-02-22\n\n### This Commit's Contribution\n\nShipped milestone.\n"
    );

    // Act
    const result = buildStatusView(state, branches, tmpDir);

    // Assert
    expect(result).toContain("# Memory Status");
    expect(result).toContain("Roadmap");
    expect(result).toContain("Active branch: main");
    expect(result).toContain("Shipped milestone.");
    expect(result).toContain(
      "Use `read .memory/branches/<name>/commits.md` for full history."
    );
  });

  it("should handle missing main.md gracefully", () => {
    // Act
    const result = buildStatusView(state, branches, tmpDir);

    // Assert
    expect(result).toContain("No roadmap found");
    expect(result).toContain("Active branch: main");
  });

  it("should show guidance when main.md exists but is empty", () => {
    // Arrange
    fs.writeFileSync(path.join(tmpDir, ".memory/main.md"), "\n\n");

    // Act
    const result = buildStatusView(state, branches, tmpDir);

    // Assert
    expect(result).toContain("Roadmap is empty");
    expect(result).toContain("Update `.memory/main.md` with project goals");
  });

  it("should warn when log.md exceeds size threshold", () => {
    // Arrange
    fs.writeFileSync(path.join(tmpDir, ".memory/main.md"), "# Roadmap\n");
    branches.appendLog("main", "x".repeat(LOG_SIZE_WARNING_BYTES + 1));

    // Act
    const result = buildStatusView(state, branches, tmpDir);

    // Assert
    expect(result).toContain("**Warning:**");
    expect(result).toContain("log.md is large");
    expect(result).toContain("You should commit");
  });

  it("should not warn when log.md is below threshold", () => {
    // Arrange
    fs.writeFileSync(path.join(tmpDir, ".memory/main.md"), "# Roadmap\n");
    branches.appendLog("main", "x".repeat(1000));

    // Act
    const result = buildStatusView(state, branches, tmpDir);

    // Assert
    expect(result).not.toContain("**Warning:**");
  });

  it("should list multiple branches with their latest commit summaries", () => {
    // Arrange
    branches.createBranch("feature-a", "Feature A");
    const entry =
      "\n---\n\n## Commit ff001122 | 2026-02-22\n\n### This Commit's Contribution\n\nAdded caching layer.\n";
    branches.appendCommit("feature-a", entry);

    // Act
    const result = buildStatusView(state, branches, tmpDir);

    // Assert
    expect(result).toContain("feature-a");
    expect(result).toContain("Added caching layer");
    expect(result).toContain("main");
  });

  it("compact mode should truncate roadmap iff it exceeds roadmapCharLimit", () => {
    const roadmapCharLimit = 160;
    const roadmapChunkArb = fc
      .array(fc.constantFrom("a", "b", "c", "d", "e", " ", "\n", "#"), {
        minLength: 1,
        maxLength: 400,
      })
      .map((chars) => chars.join(""));

    fc.assert(
      fc.property(roadmapChunkArb, (roadmapChunk) => {
        const roadmap = `# Roadmap\n\n${roadmapChunk}`;
        fs.writeFileSync(path.join(tmpDir, ".memory/main.md"), roadmap);

        const result = buildStatusView(state, branches, tmpDir, {
          compact: true,
          roadmapCharLimit,
          branchLimit: 8,
        });

        const shouldTruncate = roadmap.trim().length > roadmapCharLimit;
        expect(result.includes("Roadmap truncated")).toBe(shouldTruncate);
      }),
      { numRuns: 60 }
    );
  });

  it("compact mode should cap visible branch rows and report hidden count", () => {
    const branchLimit = 4;
    const branchNameArb = fc
      .array(
        fc.constantFrom(
          "a",
          "b",
          "c",
          "d",
          "e",
          "f",
          "g",
          "h",
          "i",
          "j",
          "k",
          "l",
          "m",
          "n",
          "o",
          "p",
          "q",
          "r",
          "s",
          "t",
          "u",
          "v",
          "w",
          "x",
          "y",
          "z",
          "0",
          "1",
          "2",
          "3",
          "4",
          "5",
          "6",
          "7",
          "8",
          "9",
          "-"
        ),
        { minLength: 1, maxLength: 10 }
      )
      .map((chars) => chars.join(""))
      .filter((name) => name !== "main");

    const extraBranchesArb = fc.uniqueArray(branchNameArb, {
      maxLength: 12,
      selector: (name) => name,
    });

    fc.assert(
      fc.property(extraBranchesArb, (extraBranches) => {
        const setup = setupMemoryProject();
        try {
          fs.writeFileSync(
            path.join(setup.tmpDir, ".memory/main.md"),
            "# Roadmap\n\nCompact branch list validation.\n"
          );

          for (const branch of extraBranches) {
            setup.branches.createBranch(branch, `Purpose ${branch}`);
          }

          const result = buildStatusView(
            setup.state,
            setup.branches,
            setup.tmpDir,
            {
              compact: true,
              branchLimit,
            }
          );

          const visibleBranchRows = result.match(/^- \*\*/gm) ?? [];
          const totalBranches = extraBranches.length + 1;
          const expectedVisible = Math.min(totalBranches, branchLimit);
          expect(visibleBranchRows).toHaveLength(expectedVisible);

          const hiddenCount = totalBranches - expectedVisible;
          const hiddenMessageMatch = result.match(
            /^- \.\.\. \d+ more branch(?:es)? not shown\.$/m
          );
          const expectedHiddenMessage =
            hiddenCount > 0
              ? `- ... ${hiddenCount} more ${hiddenCount === 1 ? "branch" : "branches"} not shown.`
              : null;

          expect(hiddenMessageMatch?.[0] ?? null).toBe(expectedHiddenMessage);
        } finally {
          fs.rmSync(setup.tmpDir, { recursive: true, force: true });
        }
      }),
      { numRuns: 40 }
    );
  });
});
