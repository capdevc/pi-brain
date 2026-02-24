import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { BranchManager } from "./branches.js";
import { executeGccMerge } from "./gcc-merge.js";
import { GccState } from "./state.js";

describe("executeGccMerge", () => {
  let tmpDir: string;
  let state: GccState;
  let branches: BranchManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcc-merge-test-"));
    const gccDir = path.join(tmpDir, ".gcc");
    fs.mkdirSync(path.join(gccDir, "branches"), { recursive: true });

    fs.writeFileSync(
      path.join(gccDir, "state.yaml"),
      'active_branch: main\ninitialized: "2026-02-22T14:00:00Z"'
    );
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "# Project\n");

    state = new GccState(tmpDir);
    state.load();
    branches = new BranchManager(tmpDir);
    branches.createBranch("main", "Main branch");
    branches.createBranch("explore-redis", "Evaluate Redis as caching layer");

    // Add a commit to the source branch
    const entry =
      "\n---\n\n## Commit a1b2c3d4 | 2026-02-22\n\n### Branch Purpose\n\nEvaluate Redis\n\n### This Commit's Contribution\n\nRedis is viable for our use case.\n";
    branches.appendCommit("explore-redis", entry);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends a merge commit to the current branch", () => {
    const result = executeGccMerge(
      {
        branch: "explore-redis",
        synthesis:
          "Redis confirmed as caching layer. Will use for session storage.",
      },
      state,
      branches,
      tmpDir
    );

    expect(result).toContain("Merge commit");
    const commits = branches.readCommits("main");
    expect(commits).toContain("Merge from explore-redis");
    expect(commits).toContain("Redis confirmed as caching layer");
  });

  it("generates a valid hash in the merge commit", () => {
    executeGccMerge(
      { branch: "explore-redis", synthesis: "Redis is good." },
      state,
      branches,
      tmpDir
    );

    const commits = branches.readCommits("main");
    const hashMatch = /## Commit ([a-f0-9]{8})/.exec(commits);
    expect(hashMatch).not.toBeNull();
  });

  it("updates state with last commit info", () => {
    executeGccMerge(
      { branch: "explore-redis", synthesis: "Merged Redis findings." },
      state,
      branches,
      tmpDir
    );

    expect(state.lastCommit).not.toBeNull();
    expect(state.lastCommit?.branch).toBe("main");
    expect(state.lastCommit?.summary).toContain("Merge from explore-redis");
  });

  it("updates root AGENTS.md", () => {
    executeGccMerge(
      { branch: "explore-redis", synthesis: "Merged." },
      state,
      branches,
      tmpDir
    );

    const agentsMd = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
    expect(agentsMd).toContain("Merge from explore-redis");
  });

  it("retains the merged branch (does not delete)", () => {
    executeGccMerge(
      { branch: "explore-redis", synthesis: "Done." },
      state,
      branches,
      tmpDir
    );

    expect(branches.branchExists("explore-redis")).toBeTruthy();
  });

  it("rejects merging a branch into itself", () => {
    const result = executeGccMerge(
      { branch: "main", synthesis: "Self merge." },
      state,
      branches,
      tmpDir
    );

    expect(result).toContain("Cannot merge");
  });

  it("rejects merging a nonexistent branch", () => {
    const result = executeGccMerge(
      { branch: "nonexistent", synthesis: "Missing." },
      state,
      branches,
      tmpDir
    );

    expect(result).toContain("not found");
  });
});
