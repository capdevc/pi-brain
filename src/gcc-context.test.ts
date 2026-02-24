import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { BranchManager } from "./branches.js";
import { executeGccContext } from "./gcc-context.js";
import { GccState } from "./state.js";

function setupGccProject(): {
  tmpDir: string;
  state: GccState;
  branches: BranchManager;
} {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcc-context-test-"));
  const gccDir = path.join(tmpDir, ".gcc");
  fs.mkdirSync(path.join(gccDir, "branches"), { recursive: true });

  const state = new GccState(tmpDir);
  const branches = new BranchManager(tmpDir);

  // Initialize state file so load() works
  fs.writeFileSync(
    path.join(gccDir, "state.yaml"),
    'active_branch: main\ninitialized: "2026-02-22T14:00:00Z"'
  );
  state.load();

  // Create main branch
  branches.createBranch("main", "Main project memory");

  return { tmpDir, state, branches };
}

describe("executeGccContext", () => {
  let tmpDir: string;
  let state: GccState;
  let branches: BranchManager;

  beforeEach(() => {
    const setup = setupGccProject();
    ({ tmpDir } = setup);
    ({ state } = setup);
    ({ branches } = setup);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("status level", () => {
    it("returns main.md content and branch list", () => {
      fs.writeFileSync(
        path.join(tmpDir, ".gcc/main.md"),
        "# Project Roadmap\n\nGoals here.\n"
      );

      const result = executeGccContext(
        { level: "status" },
        state,
        branches,
        tmpDir
      );

      expect(result).toContain("Project Roadmap");
      expect(result).toContain("Goals here.");
      expect(result).toContain("main");
      expect(result).toContain("Active branch: main");
    });

    it("handles missing main.md gracefully", () => {
      const result = executeGccContext(
        { level: "status" },
        state,
        branches,
        tmpDir
      );

      expect(result).toContain("No roadmap found");
      expect(result).toContain("main");
    });

    it("is the default when no level specified", () => {
      fs.writeFileSync(path.join(tmpDir, ".gcc/main.md"), "# Roadmap\n");

      const result = executeGccContext({}, state, branches, tmpDir);

      expect(result).toContain("Roadmap");
    });
  });

  describe("branch level", () => {
    it("returns branch purpose and latest commit", () => {
      const commitEntry =
        "\n---\n\n## Commit a1b2c3d4 | 2026-02-22\n\n### Branch Purpose\n\nMain project memory\n\n### This Commit's Contribution\n\nEstablished architecture.\n";
      branches.appendCommit("main", commitEntry);

      const result = executeGccContext(
        { level: "branch", branch: "main" },
        state,
        branches,
        tmpDir
      );

      expect(result).toContain("Main project memory");
      expect(result).toContain("a1b2c3d4");
      expect(result).toContain("Established architecture.");
    });

    it("defaults to active branch when branch not specified", () => {
      const result = executeGccContext(
        { level: "branch" },
        state,
        branches,
        tmpDir
      );

      expect(result).toContain("main");
    });

    it("reports error for nonexistent branch", () => {
      const result = executeGccContext(
        { level: "branch", branch: "nope" },
        state,
        branches,
        tmpDir
      );

      expect(result).toContain("not found");
    });
  });

  describe("commit level", () => {
    it("returns full commit entry for a specific hash", () => {
      const entry =
        "\n---\n\n## Commit deadbeef | 2026-02-22\n\n### Branch Purpose\n\nMain branch\n\n### This Commit's Contribution\n\nSpecific commit content.\n";
      branches.appendCommit("main", entry);

      const result = executeGccContext(
        { level: "commit", commit: "deadbeef" },
        state,
        branches,
        tmpDir
      );

      expect(result).toContain("deadbeef");
      expect(result).toContain("Specific commit content.");
    });

    it("reports error when commit hash not found", () => {
      const result = executeGccContext(
        { level: "commit", commit: "00000000" },
        state,
        branches,
        tmpDir
      );

      expect(result).toContain("not found");
    });
  });

  describe("log level", () => {
    it("returns current log.md contents", () => {
      branches.appendLog(
        "main",
        "## Turn 1 | 2026-02-22 | anthropic/claude\n\nSome reasoning.\n"
      );

      const result = executeGccContext(
        { level: "log" },
        state,
        branches,
        tmpDir
      );

      expect(result).toContain("Turn 1");
      expect(result).toContain("Some reasoning.");
    });

    it("reports empty when no log entries", () => {
      const result = executeGccContext(
        { level: "log" },
        state,
        branches,
        tmpDir
      );

      expect(result).toContain("No log entries");
    });
  });

  describe("metadata level", () => {
    it("returns full metadata when no segment specified", () => {
      const metaPath = path.join(tmpDir, ".gcc/branches/main/metadata.yaml");
      fs.writeFileSync(
        metaPath,
        "file_structure:\n  src/: source code\nenv_config:\n  node: 22\n"
      );

      const result = executeGccContext(
        { level: "metadata" },
        state,
        branches,
        tmpDir
      );

      expect(result).toContain("file_structure");
      expect(result).toContain("env_config");
    });

    it("extracts specific segment from metadata", () => {
      const metaPath = path.join(tmpDir, ".gcc/branches/main/metadata.yaml");
      fs.writeFileSync(
        metaPath,
        "file_structure:\n  src/: source code\n  tests/: test files\nenv_config:\n  node: 22\n"
      );

      const result = executeGccContext(
        { level: "metadata", segment: "file_structure" },
        state,
        branches,
        tmpDir
      );

      expect(result).toContain("file_structure");
      expect(result).toContain("src/: source code");
      expect(result).not.toContain("env_config");
    });

    it("reports error for missing segment", () => {
      const metaPath = path.join(tmpDir, ".gcc/branches/main/metadata.yaml");
      fs.writeFileSync(metaPath, "file_structure:\n  src/: source\n");

      const result = executeGccContext(
        { level: "metadata", segment: "nonexistent" },
        state,
        branches,
        tmpDir
      );

      expect(result).toContain("not found");
    });

    it("reports empty metadata", () => {
      const result = executeGccContext(
        { level: "metadata" },
        state,
        branches,
        tmpDir
      );

      expect(result).toContain("No metadata");
    });
  });
});
