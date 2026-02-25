import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { BranchManager } from "./branches.js";
import { LOG_SIZE_WARNING_BYTES } from "./constants.js";
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

  fs.writeFileSync(
    path.join(gccDir, "state.yaml"),
    'active_branch: main\ninitialized: "2026-02-22T14:00:00Z"'
  );
  state.load();

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

  it("returns status overview when called with empty params", () => {
    fs.writeFileSync(
      path.join(tmpDir, ".gcc/main.md"),
      "# Roadmap\n\nGoals here.\n"
    );
    branches.appendCommit(
      "main",
      "\n---\n\n## Commit deadbeef | 2026-02-22\n\n### This Commit's Contribution\n\nShipped milestone.\n"
    );

    const result = executeGccContext({}, state, branches, tmpDir);

    expect(result).toContain("# GCC Status");
    expect(result).toContain("Roadmap");
    expect(result).toContain("Active branch: main");
    expect(result).toContain("Shipped milestone.");
    expect(result).toContain(
      "Use `read .gcc/branches/<name>/commits.md` for full history."
    );
  });

  it("handles missing main.md gracefully", () => {
    const result = executeGccContext({}, state, branches, tmpDir);

    expect(result).toContain("No roadmap found");
    expect(result).toContain("Active branch: main");
  });

  it("shows guidance when main.md exists but is empty", () => {
    fs.writeFileSync(path.join(tmpDir, ".gcc/main.md"), "\n\n");

    const result = executeGccContext({}, state, branches, tmpDir);

    expect(result).toContain("Roadmap is empty");
    expect(result).toContain("Update `.gcc/main.md` with project goals");
  });

  it("ignores unsupported level params and still returns status", () => {
    const result = executeGccContext(
      { level: "branch", branch: "main", commit: "deadbeef", segment: "x" },
      state,
      branches,
      tmpDir
    );

    expect(result).toContain("# GCC Status");
    expect(result).toContain(
      "Use `read .gcc/branches/<name>/commits.md` for full history."
    );
  });

  it("warns when log.md exceeds size threshold", () => {
    fs.writeFileSync(path.join(tmpDir, ".gcc/main.md"), "# Roadmap\n");
    branches.appendLog("main", "x".repeat(LOG_SIZE_WARNING_BYTES + 1));

    const result = executeGccContext({}, state, branches, tmpDir);

    expect(result).toContain("**Warning:**");
    expect(result).toContain("log.md is large");
    expect(result).toContain("You should commit");
  });

  it("does not warn when log.md is below threshold", () => {
    fs.writeFileSync(path.join(tmpDir, ".gcc/main.md"), "# Roadmap\n");
    branches.appendLog("main", "x".repeat(1000));

    const result = executeGccContext({}, state, branches, tmpDir);

    expect(result).not.toContain("**Warning:**");
  });
});
