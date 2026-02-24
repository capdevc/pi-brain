import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { BranchManager } from "./branches.js";
import { executeGccSwitch } from "./gcc-switch.js";
import { GccState } from "./state.js";

describe("executeGccSwitch", () => {
  let tmpDir: string;
  let state: GccState;
  let branches: BranchManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcc-switch-test-"));
    const gccDir = path.join(tmpDir, ".gcc");
    fs.mkdirSync(path.join(gccDir, "branches"), { recursive: true });

    fs.writeFileSync(
      path.join(gccDir, "state.yaml"),
      'active_branch: main\ninitialized: "2026-02-22T14:00:00Z"'
    );

    state = new GccState(tmpDir);
    state.load();
    branches = new BranchManager(tmpDir);
    branches.createBranch("main", "Main branch");
    branches.createBranch("feature-x", "Explore feature X");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("switches to an existing branch", () => {
    const result = executeGccSwitch({ branch: "feature-x" }, state, branches);

    expect(state.activeBranch).toBe("feature-x");
    expect(result).toContain("feature-x");
  });

  it("returns latest commit summary for orientation", () => {
    const entry =
      "\n---\n\n## Commit a1b2c3d4 | 2026-02-22\n\n### Branch Purpose\n\nExplore feature X\n\n### This Commit's Contribution\n\nDetermined Redis is viable.\n";
    branches.appendCommit("feature-x", entry);

    const result = executeGccSwitch({ branch: "feature-x" }, state, branches);

    expect(result).toContain("Determined Redis is viable.");
  });

  it("rejects switching to nonexistent branch", () => {
    const result = executeGccSwitch({ branch: "nope" }, state, branches);

    expect(result).toContain("not found");
    expect(state.activeBranch).toBe("main");
  });
});
