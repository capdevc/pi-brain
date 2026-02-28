# Tool Consolidation Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Reduce Brain's tool surface from 5 tools to 2. Consolidate `memory_branch`, `memory_switch`, `memory_merge` into a single `memory_branch` tool with an `action` parameter. Remove the `memory_status` tool — status is injected via the `before_agent_start` hook on first invocation and appended to `memory_branch` and `memory_commit` results.

**Tech Stack:** TypeScript (ESM), vitest, pi extension API

---

## Phase 1: Consolidate Branch Operations (3 → 1 tool)

### Task 1: Expand `memory-branch.ts` to handle create, switch, and merge actions

**TDD scenario:** Modifying tested code — `memory-branch.ts` and `memory-branch.test.ts` already exist.

**Files:**

- Modify: `src/memory-branch.ts`
- Modify: `src/memory-branch.test.ts`

**Step 1: Write failing tests**

Replace the contents of `src/memory-branch.test.ts`. The existing 3 tests cover create-only behavior. Rewrite to test all three actions through a single `executeMemoryBranch` function that now takes an `action` parameter.

```typescript
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
```

**Step 2: Run tests to verify they fail**

Run: `pnpm run test -- src/memory-branch.test.ts`
Expected: FAIL — current `executeMemoryBranch` does not accept `action` parameter

**Step 3: Rewrite `src/memory-branch.ts`**

Replace the existing single-action implementation with a dispatcher that handles create, switch, and merge. The logic comes directly from the existing `memory-switch.ts` and `memory-merge.ts` modules.

```typescript
import type { BranchManager } from "./branches.js";
import { generateHash } from "./hash.js";
import type { MemoryState } from "./state.js";

interface MemoryBranchParams {
  action: string;
  name?: string;
  purpose?: string;
  branch?: string;
  synthesis?: string;
}

function executeCreate(
  params: MemoryBranchParams,
  state: MemoryState,
  branches: BranchManager
): string {
  const { name, purpose } = params;

  if (!name || !purpose) {
    return '"name" and "purpose" are required for the create action.';
  }

  if (branches.branchExists(name)) {
    return `Branch "${name}" already exists. Use action "switch" to switch to it.`;
  }

  branches.createBranch(name, purpose);
  state.setActiveBranch(name);
  state.save();

  return `Created branch "${name}" and switched to it.\nPurpose: ${purpose}`;
}

function executeSwitch(
  params: MemoryBranchParams,
  state: MemoryState,
  branches: BranchManager
): string {
  const { branch } = params;

  if (!branch) {
    return '"branch" is required for the switch action.';
  }

  if (!branches.branchExists(branch)) {
    return `Branch "${branch}" not found. Available branches: ${branches.listBranches().join(", ")}`;
  }

  state.setActiveBranch(branch);
  state.save();

  const latest = branches.getLatestCommit(branch);
  const summary = latest ?? "No commits yet.";

  return `Switched to branch "${branch}".\n\n${summary}`;
}

function executeMerge(
  params: MemoryBranchParams,
  state: MemoryState,
  branches: BranchManager
): string {
  const { branch: sourceBranch, synthesis } = params;

  if (!sourceBranch || !synthesis) {
    return '"branch" and "synthesis" are required for the merge action.';
  }

  const targetBranch = state.activeBranch;

  if (sourceBranch === targetBranch) {
    return `Cannot merge branch "${sourceBranch}" into itself.`;
  }

  if (!branches.branchExists(sourceBranch)) {
    return `Branch "${sourceBranch}" not found. Available branches: ${branches.listBranches().join(", ")}`;
  }

  const hash = generateHash();
  const timestamp = new Date().toISOString();
  const summary = `Merge from ${sourceBranch}`;

  const entry = [
    "",
    "---",
    "",
    `## Commit ${hash} | ${timestamp}`,
    "",
    `### Merge from ${sourceBranch}`,
    "",
    synthesis,
    "",
  ].join("\n");

  branches.appendCommit(targetBranch, entry);

  state.setLastCommit(targetBranch, hash, timestamp, summary);
  state.save();

  return `Merge commit ${hash} written to branch "${targetBranch}" (merged from "${sourceBranch}").`;
}

/**
 * Execute the unified memory_branch tool.
 * Actions: create, switch, merge.
 */
export function executeMemoryBranch(
  params: MemoryBranchParams,
  state: MemoryState,
  branches: BranchManager
): string {
  switch (params.action) {
    case "create":
      return executeCreate(params, state, branches);
    case "switch":
      return executeSwitch(params, state, branches);
    case "merge":
      return executeMerge(params, state, branches);
    default:
      return `Unknown action "${params.action}". Valid actions: create, switch, merge.`;
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm run test -- src/memory-branch.test.ts`
Expected: All 14 tests PASS

**Step 5: Commit**

```bash
git add src/memory-branch.ts src/memory-branch.test.ts
git commit -m "feat: consolidate branch/switch/merge into single memory_branch tool"
```

---

## Phase 2: Replace `memory_status` with Hook Injection + Tool Result Appending

### Task 2: Export `buildStatusView` from `memory-context.ts`

**TDD scenario:** Modifying tested code.

**Files:**

- Modify: `src/memory-context.ts` — export `buildStatusView`, remove `executeMemoryStatus`
- Modify: `src/memory-context.test.ts` — rewrite tests to call `buildStatusView` directly

**Step 1: Rewrite tests to target `buildStatusView`**

In `src/memory-context.test.ts`, replace `executeMemoryStatus({}, state, branches, tmpDir)` with `buildStatusView(state, branches, tmpDir)` in every test. Remove the test for "unsupported level params" (no longer relevant — `buildStatusView` has no params). Update the import.

**Step 2: Run tests to verify they fail**

Run: `pnpm run test -- src/memory-context.test.ts`
Expected: FAIL — `buildStatusView` is not exported

**Step 3: Update `memory-context.ts`**

- Add `export` to `buildStatusView`
- Remove `executeMemoryStatus` function
- Remove `import type { MemoryStatusParams }` from types

**Step 4: Run tests to verify they pass**

Run: `pnpm run test -- src/memory-context.test.ts`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add src/memory-context.ts src/memory-context.test.ts
git commit -m "refactor: export buildStatusView, remove executeMemoryStatus"
```

---

### Task 3: Append status to `memory_branch` and `memory_commit` results

**TDD scenario:** Modifying tested code.

**Files:**

- Modify: `src/memory-branch.ts` — accept `projectDir`, append status on success
- Modify: `src/memory-branch.test.ts` — verify status in results
- Modify: `src/memory-commit.ts` — accept `projectDir` in `finalizeMemoryCommit`, append status
- Modify: `src/memory-commit.test.ts` — verify status in results

**Step 1: Write failing tests for `memory-branch.ts`**

Add to `src/memory-branch.test.ts`:

```typescript
it("should include status view in create result", () => {
  fs.writeFileSync(
    path.join(tmpDir, ".memory/main.md"),
    "# Roadmap\n\nGoals.\n"
  );

  const result = executeMemoryBranch(
    { action: "create", name: "test-branch", purpose: "Testing" },
    state,
    branches,
    tmpDir
  );

  expect(result).toContain("Created branch");
  expect(result).toContain("# Memory Status");
  expect(result).toContain("Active branch: test-branch");
});

it("should include status view in switch result", () => {
  branches.createBranch("feature-x", "Feature X");
  fs.writeFileSync(
    path.join(tmpDir, ".memory/main.md"),
    "# Roadmap\n\nGoals.\n"
  );

  const result = executeMemoryBranch(
    { action: "switch", branch: "feature-x" },
    state,
    branches,
    tmpDir
  );

  expect(result).toContain("Switched to branch");
  expect(result).toContain("# Memory Status");
  expect(result).toContain("Active branch: feature-x");
});

it("should include status view in merge result", () => {
  branches.createBranch("explore-redis", "Redis eval");
  fs.writeFileSync(
    path.join(tmpDir, ".memory/main.md"),
    "# Roadmap\n\nGoals.\n"
  );

  const result = executeMemoryBranch(
    {
      action: "merge",
      branch: "explore-redis",
      synthesis: "Redis works.",
    },
    state,
    branches,
    tmpDir
  );

  expect(result).toContain("Merge commit");
  expect(result).toContain("# Memory Status");
});

it("should NOT include status view in error results", () => {
  const result = executeMemoryBranch(
    { action: "switch", branch: "nonexistent" },
    state,
    branches,
    tmpDir
  );

  expect(result).toContain("not found");
  expect(result).not.toContain("# Memory Status");
});
```

Update all existing test calls to pass `tmpDir` as the 4th argument.

**Step 2: Run tests to verify they fail**

Run: `pnpm run test -- src/memory-branch.test.ts`
Expected: FAIL — function signature doesn't accept `projectDir`

**Step 3: Update `executeMemoryBranch` and helpers**

Add `projectDir` parameter. Import `buildStatusView` from `./memory-context.js`. On success paths, append `\n\n${buildStatusView(state, branches, projectDir)}`. On error paths (validation failures, not found), return the error string as-is.

Determine success vs error: each helper returns a string. Add a simple convention — helpers return `{ text: string; ok: boolean }`, and the dispatcher appends status only when `ok` is true. Or simpler: the dispatcher calls `buildStatusView` after the helper, and each error-path helper sets a flag. Simplest approach: use an `isError` prefix check or return a tuple. **Recommended:** change helpers to return `{ text: string; ok: boolean }`.

**Step 4: Write failing test for `memory-commit.ts`**

Add to `src/memory-commit.test.ts` in the `finalizeMemoryCommit` describe block:

```typescript
it("should include status view in the result", () => {
  fs.writeFileSync(
    path.join(tmpDir, ".memory/main.md"),
    "# Roadmap\n\nGoals here.\n"
  );
  const commitContent =
    "### Branch Purpose\n\nMain\n\n### Previous Progress Summary\n\nNone.\n\n### This Commit's Contribution\n\nFirst milestone.\n";

  const message = finalizeMemoryCommit(
    "First milestone",
    commitContent,
    state,
    branches,
    tmpDir
  );

  expect(message).toContain("Commit ");
  expect(message).toContain("# Memory Status");
  expect(message).toContain("Active branch: main");
});
```

Update all existing `finalizeMemoryCommit` calls to pass `tmpDir` as 5th arg.

**Step 5: Update `finalizeMemoryCommit` in `src/memory-commit.ts`**

Add `projectDir: string` parameter. Import `buildStatusView`. Append status to the result string.

**Step 6: Update call site in `src/index.ts`**

Pass `ctx.cwd` as the 5th argument to `finalizeMemoryCommit`.

**Step 7: Run tests**

Run: `pnpm run test -- src/memory-branch.test.ts src/memory-commit.test.ts`
Expected: All tests PASS

**Step 8: Commit**

```bash
git add src/memory-branch.ts src/memory-branch.test.ts src/memory-commit.ts src/memory-commit.test.ts src/index.ts
git commit -m "feat: append status view to memory_branch and memory_commit results"
```

---

### Task 4: Inject status via `before_agent_start` hook on first invocation

**TDD scenario:** New feature.

**Files:**

- Modify: `src/index.ts` — add `before_agent_start` handler, remove `memory_status` tool
- Modify: `src/index.test.ts` — add test for hook injection, remove `memory_status` tests

**Design note:** `before_agent_start` fires on every user prompt, not just the first. A `statusInjected` flag gates injection to the first call only. The flag is reset in `session_start` (covers session switches and `/reload`) and `session_compact` (covers context compaction, where the agent loses the injected message and needs it re-injected).

**Step 1: Write failing tests**

Add to `src/index.test.ts`:

```typescript
it("should inject status message on first before_agent_start", async () => {
  const { projectDir, cleanup } = setupInitializedProject();
  try {
    const mockPi = createMockPi();
    activate(mockPi.api);

    // Trigger session_start to load state
    const ctx = createCtx(projectDir);
    const sessionStart = getHandler(mockPi.handlers, "session_start");
    await sessionStart?.({ type: "session_start" }, ctx);

    // Trigger before_agent_start
    const beforeStart = getHandler(mockPi.handlers, "before_agent_start");
    const result = await beforeStart?.(
      { type: "before_agent_start", prompt: "hello", systemPrompt: "..." },
      ctx
    );

    expect(result).toBeDefined();
    expect(result?.message?.content).toContain("# Memory Status");
    expect(result?.message?.content).toContain("Active branch:");
  } finally {
    cleanup();
  }
});

it("should NOT inject status on subsequent before_agent_start calls", async () => {
  const { projectDir, cleanup } = setupInitializedProject();
  try {
    const mockPi = createMockPi();
    activate(mockPi.api);

    const ctx = createCtx(projectDir);
    const sessionStart = getHandler(mockPi.handlers, "session_start");
    await sessionStart?.({ type: "session_start" }, ctx);

    const beforeStart = getHandler(mockPi.handlers, "before_agent_start");
    const event = {
      type: "before_agent_start",
      prompt: "hello",
      systemPrompt: "...",
    };

    // First call injects
    await beforeStart?.(event, ctx);
    // Second call should not inject
    const result2 = await beforeStart?.(event, ctx);

    expect(result2).toBeUndefined();
  } finally {
    cleanup();
  }
});

it("should re-inject status after session_start resets the flag", async () => {
  const { projectDir, cleanup } = setupInitializedProject();
  try {
    const mockPi = createMockPi();
    activate(mockPi.api);

    const ctx = createCtx(projectDir);
    const sessionStart = getHandler(mockPi.handlers, "session_start");
    const beforeStart = getHandler(mockPi.handlers, "before_agent_start");
    const event = {
      type: "before_agent_start",
      prompt: "hello",
      systemPrompt: "...",
    };

    // First session: inject status
    await sessionStart?.({ type: "session_start" }, ctx);
    await beforeStart?.(event, ctx);

    // Second call should not inject
    const result2 = await beforeStart?.(event, ctx);
    expect(result2).toBeUndefined();

    // session_start fires again (session switch / reload) — resets the flag
    await sessionStart?.({ type: "session_start" }, ctx);

    // Now it should inject again
    const result3 = await beforeStart?.(event, ctx);
    expect(result3).toBeDefined();
    expect(result3?.message?.content).toContain("# Memory Status");
  } finally {
    cleanup();
  }
});

it("should re-inject status after session_compact resets the flag", async () => {
  const { projectDir, cleanup } = setupInitializedProject();
  try {
    const mockPi = createMockPi();
    activate(mockPi.api);

    const ctx = createCtx(projectDir);
    const sessionStart = getHandler(mockPi.handlers, "session_start");
    const beforeStart = getHandler(mockPi.handlers, "before_agent_start");
    const sessionCompact = getHandler(mockPi.handlers, "session_compact");
    const event = {
      type: "before_agent_start",
      prompt: "hello",
      systemPrompt: "...",
    };

    // Initial session + first injection
    await sessionStart?.({ type: "session_start" }, ctx);
    await beforeStart?.(event, ctx);

    // Compaction resets the flag
    await sessionCompact?.({ type: "session_compact" }, ctx);

    // Should inject again
    const result = await beforeStart?.(event, ctx);
    expect(result).toBeDefined();
    expect(result?.message?.content).toContain("# Memory Status");
  } finally {
    cleanup();
  }
});
```

Also update the wiring test that checks registered tool names — remove `memory_status` from expected list.

**Step 2: Run tests to verify they fail**

Run: `pnpm run test -- src/index.test.ts`
Expected: FAIL — no `before_agent_start` handler, `memory_status` still registered

**Step 3: Update `src/index.ts`**

1. Remove the `memory_status` tool registration block entirely.
2. Remove the `executeMemoryStatus` import.
3. Add import for `buildStatusView` from `./memory-context.js`.
4. Add a `statusInjected` boolean flag (starts `false`, set to `true` after first injection).
5. Reset `statusInjected = false` at the top of the `session_start` handler (before `tryLoad`).
6. Add a `session_compact` handler that resets `statusInjected = false`.
7. Add a `before_agent_start` handler:

```typescript
pi.on("before_agent_start", (_event, ctx) => {
  if (statusInjected) {
    return;
  }

  if (!isMemoryReady(state, branchManager) || !branchManager) {
    return;
  }

  statusInjected = true;

  const status = buildStatusView(state, branchManager, ctx.cwd);
  return {
    message: {
      customType: "brain-status",
      content: status,
      display: "tool",
      details: {},
    },
  };
});

pi.on("session_compact", () => {
  statusInjected = false;
});
```

8. Update the `memory_branch` tool registration to use the consolidated `executeMemoryBranch` with action parameter:

```typescript
pi.registerTool({
  name: "memory_branch",
  label: "Memory Branch",
  description:
    "Manage memory branches. Actions: create (new branch), switch (change active branch), merge (synthesize branch into current).",
  parameters: Type.Object({
    action: Type.String({
      description: 'Action to perform: "create", "switch", or "merge"',
    }),
    name: Type.Optional(
      Type.String({ description: "Branch name (required for create)" })
    ),
    purpose: Type.Optional(
      Type.String({
        description: "Why this branch exists (required for create)",
      })
    ),
    branch: Type.Optional(
      Type.String({
        description: "Target branch (required for switch and merge)",
      })
    ),
    synthesis: Type.Optional(
      Type.String({ description: "Synthesized insight (required for merge)" })
    ),
  }),
  async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
    if (
      !tryLoad(ctx) ||
      !isMemoryReady(state, branchManager) ||
      !branchManager
    ) {
      return createTextResult(MEMORY_NOT_INITIALIZED_MESSAGE);
    }

    const previousBranch = state.activeBranch;
    const result = executeMemoryBranch(params, state, branchManager, ctx.cwd);

    if (state.activeBranch !== previousBranch) {
      upsertCurrentSession(state, ctx);
    }

    return createTextResult(result);
  },
});
```

9. Remove `memory_switch` and `memory_merge` tool registration blocks.
10. Remove imports for `executeMemorySwitch` and `executeMemoryMerge`.

**Step 4: Run tests**

Run: `pnpm run test -- src/index.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/index.ts src/index.test.ts
git commit -m "feat: inject status via before_agent_start hook, remove memory_status tool"
```

---

## Phase 3: Cleanup

### Task 5: Delete old modules

**Files:**

- Delete: `src/memory-switch.ts`, `src/memory-switch.test.ts`
- Delete: `src/memory-merge.ts`, `src/memory-merge.test.ts`
- Modify: `src/types.ts` — remove `MemoryStatusParams`

**Step 1: Verify no imports reference old modules**

```bash
rg "memory-switch\.js|memory-merge\.js|executeMemoryStatus|MemoryStatusParams" src/
```

Expected: No matches (all call sites updated in prior tasks).

**Step 2: Delete files and clean up types**

```bash
rm src/memory-switch.ts src/memory-switch.test.ts
rm src/memory-merge.ts src/memory-merge.test.ts
```

Remove `MemoryStatusParams` from `src/types.ts`.

**Step 3: Run full checks**

Run: `pnpm run check`
Expected: All green

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remove old switch/merge/status modules and types"
```

---

### Task 6: Update documentation and templates

**Files:**

- Modify: `skills/brain/SKILL.md` — remove `memory_status` tool references, update orientation instructions
- Modify: `skills/brain/templates/root-agents-section.md` — update tool list
- Modify: `skills/brain/templates/agents-md.md` — update tool table
- Modify: `src/init-script.test.ts` — update assertions for new tool names

**Step 1: Update templates**

In `root-agents-section.md`, change tool list to: `Tools: memory_commit, memory_branch (create/switch/merge)`

In `agents-md.md`, replace individual tool entries with consolidated table showing `memory_commit` and `memory_branch` with its three actions.

**Step 2: Update SKILL.md**

Remove references to `memory_status` tool. Update context retrieval section to explain that status is automatically injected at session start and appended to `memory_branch` and `memory_commit` results. For manual deep retrieval, use `read` on `.memory/` files.

**Step 3: Update init-script test assertions**

Update expected tool names in assertions.

**Step 4: Run full checks**

Run: `pnpm run check`
Expected: All green

**Step 5: Commit**

```bash
git add -A
git commit -m "docs: update templates, skill, and init tests for 2-tool surface"
```

---

## Summary

| Before                                                                                      | After                                                                          |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 5 tools: `memory_status`, `memory_branch`, `memory_switch`, `memory_merge`, `memory_commit` | 2 tools: `memory_branch` (with create/switch/merge actions), `memory_commit`   |
| Status requires explicit tool call                                                          | Status injected automatically via `before_agent_start` on first invocation     |
| No status in tool results                                                                   | Status appended to every successful `memory_branch` and `memory_commit` result |
| 3 separate modules for branch ops                                                           | 1 module: `memory-branch.ts`                                                   |
