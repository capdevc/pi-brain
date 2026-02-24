import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { BranchManager } from "./branches.js";
import { executeGccCommit, finalizeGccCommit } from "./gcc-commit.js";
import { GccState } from "./state.js";

describe("executeGccCommit", () => {
  let tmpDir: string;
  let state: GccState;
  let branches: BranchManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcc-commit-test-"));
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
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns log contents for agent distillation", () => {
    branches.appendLog(
      "main",
      "## Turn 1 | 2026-02-22 | anthropic/claude\n\nDid some reasoning.\n"
    );

    const result = executeGccCommit(
      { summary: "First milestone" },
      state,
      branches
    );

    expect(result).toContain("Turn 1");
    expect(result).toContain("Did some reasoning.");
    expect(result).toContain("First milestone");
  });

  it("returns message when log is empty", () => {
    const result = executeGccCommit(
      { summary: "Empty commit" },
      state,
      branches
    );

    expect(result).toContain("No log entries");
  });
});

describe("finalizeGccCommit", () => {
  let tmpDir: string;
  let state: GccState;
  let branches: BranchManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcc-finalize-test-"));
    const gccDir = path.join(tmpDir, ".gcc");
    fs.mkdirSync(path.join(gccDir, "branches"), { recursive: true });

    fs.writeFileSync(
      path.join(gccDir, "state.yaml"),
      'active_branch: main\ninitialized: "2026-02-22T14:00:00Z"'
    );
    // Create root AGENTS.md for updateRootAgentsMd
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "# Project\n");

    state = new GccState(tmpDir);
    state.load();
    branches = new BranchManager(tmpDir);
    branches.createBranch("main", "Main branch");
    branches.appendLog(
      "main",
      "## Turn 1 | 2026-02-22 | anthropic/claude\n\nSome reasoning.\n"
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends commit entry to commits.md", () => {
    const commitContent = [
      "### Branch Purpose",
      "",
      "Main project memory branch.",
      "",
      "### Previous Progress Summary",
      "",
      "No prior commits.",
      "",
      "### This Commit's Contribution",
      "",
      "Established the project architecture.",
    ].join("\n");

    finalizeGccCommit(
      "First milestone",
      commitContent,
      state,
      branches,
      tmpDir
    );

    const commits = branches.readCommits("main");
    expect(commits).toContain("## Commit");
    expect(commits).toContain("Established the project architecture.");
    expect(commits).toContain("### Branch Purpose");
  });

  it("clears log.md after commit", () => {
    const commitContent =
      "### Branch Purpose\n\nMain\n\n### Previous Progress Summary\n\nNone.\n\n### This Commit's Contribution\n\nDone.\n";

    finalizeGccCommit("Done", commitContent, state, branches, tmpDir);

    expect(branches.readLog("main")).toBe("");
  });

  it("updates state with last commit info", () => {
    const commitContent =
      "### Branch Purpose\n\nMain\n\n### Previous Progress Summary\n\nNone.\n\n### This Commit's Contribution\n\nArchitecture decided.\n";

    finalizeGccCommit(
      "Architecture decided",
      commitContent,
      state,
      branches,
      tmpDir
    );

    expect(state.lastCommit).not.toBeNull();
    expect(state.lastCommit?.branch).toBe("main");
    expect(state.lastCommit?.summary).toBe("Architecture decided");
    expect(state.lastCommit?.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(state.lastCommit?.timestamp).toBeTruthy();
  });

  it("updates root AGENTS.md", () => {
    const commitContent =
      "### Branch Purpose\n\nMain\n\n### Previous Progress Summary\n\nNone.\n\n### This Commit's Contribution\n\nNew milestone.\n";

    finalizeGccCommit("New milestone", commitContent, state, branches, tmpDir);

    const agentsMd = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("New milestone");
    expect(agentsMd).toContain("main");
  });

  it("generates a valid 8-char hex hash in the commit entry", () => {
    const commitContent =
      "### Branch Purpose\n\nMain\n\n### Previous Progress Summary\n\nNone.\n\n### This Commit's Contribution\n\nTest hash.\n";

    finalizeGccCommit("Test hash", commitContent, state, branches, tmpDir);

    const commits = branches.readCommits("main");
    const hashMatch = /## Commit ([a-f0-9]{8})/.exec(commits);
    expect(hashMatch).not.toBeNull();
  });
});
