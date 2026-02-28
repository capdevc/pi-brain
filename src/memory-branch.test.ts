import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { BranchManager } from "./branches.js";
import { executeMemoryBranch } from "./memory-branch.js";
import { MemoryState } from "./state.js";

describe("executeMemoryBranch", () => {
  let tmpDir: string;
  let state: MemoryState;
  let branches: BranchManager;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-branch-tool-test-"));
    const memoryDir = path.join(tmpDir, ".memory");
    fs.mkdirSync(path.join(memoryDir, "branches"), { recursive: true });

    fs.writeFileSync(
      path.join(memoryDir, "state.yaml"),
      'active_branch: main\ninitialized: "2026-02-22T14:00:00Z"'
    );

    state = new MemoryState(tmpDir);
    state.load();
    branches = new BranchManager(tmpDir);
    branches.createBranch("main", "Main branch");

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- create action ---

  it("should create a new branch and switch to it", () => {
    const result = executeMemoryBranch(
      { action: "create", name: "explore-redis", purpose: "Evaluate Redis" },
      state,
      branches
    );

    expect(result).toContain("explore-redis");
    expect(branches.branchExists("explore-redis")).toBeTruthy();
    expect(state.activeBranch).toBe("explore-redis");
  });

  it("should initialize commits.md with branch purpose", () => {
    executeMemoryBranch(
      { action: "create", name: "explore-redis", purpose: "Evaluate Redis" },
      state,
      branches
    );

    const commits = branches.readCommits("explore-redis");
    expect(commits).toContain("Evaluate Redis");
  });

  it("should reject duplicate branch names on create", () => {
    const result = executeMemoryBranch(
      { action: "create", name: "main", purpose: "Duplicate" },
      state,
      branches
    );

    expect(result).toContain("already exists");
  });

  it("should require name and purpose for create", () => {
    const result = executeMemoryBranch({ action: "create" }, state, branches);

    expect(result).toContain("required");
  });

  // --- switch action ---

  it("should switch to an existing branch", () => {
    branches.createBranch("feature-x", "Feature X");

    const result = executeMemoryBranch(
      { action: "switch", branch: "feature-x" },
      state,
      branches
    );

    expect(state.activeBranch).toBe("feature-x");
    expect(result).toContain("feature-x");
  });

  it("should return latest commit on switch for orientation", () => {
    branches.createBranch("feature-x", "Feature X");
    branches.appendCommit(
      "feature-x",
      "\n---\n\n## Commit a1b2c3d4 | 2026-02-22\n\n### This Commit's Contribution\n\nRedis is viable.\n"
    );

    const result = executeMemoryBranch(
      { action: "switch", branch: "feature-x" },
      state,
      branches
    );

    expect(result).toContain("Redis is viable.");
  });

  it("should reject switching to nonexistent branch", () => {
    const result = executeMemoryBranch(
      { action: "switch", branch: "nope" },
      state,
      branches
    );

    expect(result).toContain("not found");
    expect(state.activeBranch).toBe("main");
  });

  it("should require branch for switch", () => {
    const result = executeMemoryBranch({ action: "switch" }, state, branches);

    expect(result).toContain("required");
  });

  // --- merge action ---

  it("should append a merge commit to the current branch", () => {
    branches.createBranch("explore-redis", "Evaluate Redis");
    branches.appendCommit(
      "explore-redis",
      "\n---\n\n## Commit a1b2c3d4 | 2026-02-22\n\n### This Commit's Contribution\n\nRedis is viable.\n"
    );

    const result = executeMemoryBranch(
      {
        action: "merge",
        branch: "explore-redis",
        synthesis: "Redis confirmed as caching layer.",
      },
      state,
      branches
    );

    expect(result).toContain("Merge commit");
    const commits = branches.readCommits("main");
    expect(commits).toContain("Merge from explore-redis");
    expect(commits).toContain("Redis confirmed as caching layer.");
  });

  it("should reject merging a branch into itself", () => {
    const result = executeMemoryBranch(
      { action: "merge", branch: "main", synthesis: "Self merge." },
      state,
      branches
    );

    expect(result).toContain("Cannot merge");
  });

  it("should reject merging a nonexistent branch", () => {
    const result = executeMemoryBranch(
      { action: "merge", branch: "nonexistent", synthesis: "Missing." },
      state,
      branches
    );

    expect(result).toContain("not found");
  });

  it("should require branch and synthesis for merge", () => {
    const result = executeMemoryBranch({ action: "merge" }, state, branches);

    expect(result).toContain("required");
  });

  it("should update state with last commit info on merge", () => {
    vi.setSystemTime(new Date("2026-02-22T16:00:00.000Z"));
    branches.createBranch("explore-redis", "Evaluate Redis");

    executeMemoryBranch(
      {
        action: "merge",
        branch: "explore-redis",
        synthesis: "Merged Redis findings.",
      },
      state,
      branches
    );

    expect(state.lastCommit).not.toBeNull();
    expect(state.lastCommit?.branch).toBe("main");
    expect(state.lastCommit?.summary).toContain("Merge from explore-redis");
  });

  // --- invalid action ---

  it("should reject invalid action values", () => {
    const result = executeMemoryBranch({ action: "delete" }, state, branches);

    expect(result).toContain("Unknown action");
  });
});
