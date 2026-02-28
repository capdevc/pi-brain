# Cache-Safety Property Test Suite Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Add property-based regression coverage for prompt-cache safety invariants in `pi-brain`, and remove branch-order nondeterminism that can destabilize injected status text.

**Architecture:** Introduce a dedicated `src/cache-safety.test.ts` suite using `fast-check` to validate lifecycle and prompt-safety invariants at the extension boundary (`activate`, lifecycle handlers, `before_agent_start`). Keep production changes minimal: make branch enumeration deterministic in `BranchManager.listBranches()` so status rendering is stable regardless of filesystem directory order.

**Tech Stack:** TypeScript, Vitest, fast-check, Node.js fs/path/os APIs, `@mariozechner/pi-coding-agent` extension types.

---

### Task 1: Make branch listing deterministic (red → green)

**TDD scenario:** Modifying tested code — run existing tests first, then add a failing regression test, then minimal fix.

**Files:**

- Modify: `src/branches.test.ts` (existing listBranches tests)
- Modify: `src/branches.ts:67-75` (`listBranches()`)
- Test: `src/branches.test.ts`

**Step 1: Write the failing test**

Add this test under `describe("listBranches", ...)` in `src/branches.test.ts` and add `import { vi } from "vitest";` at the top:

```ts
it("should return branches in sorted order for deterministic status output", () => {
  // Arrange
  manager.createBranch("zeta", "Zeta");
  manager.createBranch("alpha", "Alpha");
  manager.createBranch("beta", "Beta");

  const readdirSpy = vi
    .spyOn(fs, "readdirSync")
    .mockReturnValue(["zeta", "beta", "alpha"] as unknown as ReturnType<
      typeof fs.readdirSync
    >);

  try {
    // Act
    const branches = manager.listBranches();

    // Assert
    expect(branches).toStrictEqual(["alpha", "beta", "zeta"]);
  } finally {
    readdirSpy.mockRestore();
  }
});
```

**Step 2: Run test to verify it fails**

Run:

```bash
pnpm run test -- src/branches.test.ts
```

Expected: FAIL on `toStrictEqual(["alpha", "beta", "zeta"])` because current `listBranches()` returns unsorted directory order.

**Step 3: Write minimal implementation**

Update `listBranches()` in `src/branches.ts`:

```ts
listBranches(): string[] {
  if (!fs.existsSync(this.branchesDir)) {
    return [];
  }

  return fs
    .readdirSync(this.branchesDir)
    .filter((entry) => {
      const fullPath = path.join(this.branchesDir, entry);
      return fs.statSync(fullPath).isDirectory();
    })
    .sort((a, b) => a.localeCompare(b));
}
```

**Step 4: Run test to verify it passes**

Run:

```bash
pnpm run test -- src/branches.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/branches.ts src/branches.test.ts
git commit -m "fix: sort branch listing for deterministic memory status"
```

---

### Task 2: Create cache-safety test harness file

**TDD scenario:** New feature — full TDD cycle (test harness first, then use it for invariant properties).

**Files:**

- Create: `src/cache-safety.test.ts`
- Test: `src/cache-safety.test.ts`

**Step 1: Write the failing test scaffold**

Create `src/cache-safety.test.ts` with shared helpers (copied/adapted from `src/index.test.ts`) and one initial invariant test:

```ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import fc from "fast-check";
import type {
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";

import activate from "./index.js";

interface RegisteredHandler {
  event: string;
  handler: (event: unknown, ctx: ExtensionContext) => unknown;
}

interface MockPi {
  tools: ToolDefinition[];
  handlers: RegisteredHandler[];
  api: ExtensionAPI;
}

function createMockPi(): MockPi {
  const tools: ToolDefinition[] = [];
  const handlers: RegisteredHandler[] = [];

  const api = {
    registerTool(def: ToolDefinition) {
      tools.push(def);
    },
    on(
      event: string,
      handler: (event: unknown, ctx: ExtensionContext) => unknown
    ) {
      handlers.push({ event, handler });
    },
  } as unknown as ExtensionAPI;

  return { tools, handlers, api };
}

function setupInitializedProject(): {
  projectDir: string;
  cleanup: () => void;
} {
  const projectDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "cache-safety-test-")
  );
  const memoryDir = path.join(projectDir, ".memory");
  const branchDir = path.join(memoryDir, "branches", "main");

  fs.mkdirSync(branchDir, { recursive: true });
  fs.writeFileSync(
    path.join(memoryDir, "state.yaml"),
    [
      "active_branch: main",
      'initialized: "2026-02-23T00:00:00Z"',
      "last_commit:",
      "  branch: main",
      "  hash: a1b2c3d4",
      '  timestamp: "2026-02-23T00:30:00Z"',
      '  summary: "Initial foundation"',
    ].join("\n")
  );

  fs.writeFileSync(path.join(branchDir, "log.md"), "");
  fs.writeFileSync(
    path.join(branchDir, "commits.md"),
    "# main\n\n**Purpose:** Main branch\n"
  );
  fs.writeFileSync(path.join(branchDir, "metadata.yaml"), "");

  return {
    projectDir,
    cleanup: () => fs.rmSync(projectDir, { recursive: true, force: true }),
  };
}

describe("cache safety invariants", () => {
  it("registers exactly two stable memory tools", () => {
    const mockPi = createMockPi();
    activate(mockPi.api);

    expect(mockPi.tools.map((t) => t.name)).toStrictEqual([
      "memory_branch",
      "memory_commit",
    ]);
  });
});
```

**Step 2: Run test to verify it fails/passes as baseline**

Run:

```bash
pnpm run test -- src/cache-safety.test.ts
```

Expected: PASS baseline (harness compiles and test executes).

**Step 3: Write minimal implementation**

No production code change for this task. Keep this as pure harness setup.

**Step 4: Re-run test**

Run:

```bash
pnpm run test -- src/cache-safety.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/cache-safety.test.ts
git commit -m "test: add cache-safety property test harness"
```

---

### Task 3: Add append-only prompt-safety property (`before_agent_start` must not mutate `systemPrompt`)

**TDD scenario:** New feature — test first, then minimal implementation if needed.

**Files:**

- Modify: `src/cache-safety.test.ts`
- Reference implementation under test: `src/index.ts:265-293` (`before_agent_start` handler)
- Test: `src/cache-safety.test.ts`

**Step 1: Write the failing property test**

Append this test to `src/cache-safety.test.ts`:

```ts
it("before_agent_start never returns systemPrompt (append-only contract)", async () => {
  await fc.assert(
    fc.asyncProperty(fc.string(), async (prompt) => {
      const { projectDir, cleanup } = setupInitializedProject();
      try {
        const mockPi = createMockPi();
        activate(mockPi.api);

        const beforeStart = mockPi.handlers.find(
          (h) => h.event === "before_agent_start"
        )?.handler;
        const sessionStart = mockPi.handlers.find(
          (h) => h.event === "session_start"
        )?.handler;

        const ctx = {
          cwd: projectDir,
          ui: { notify() {}, setStatus() {} },
          sessionManager: {
            getSessionFile: () => "/tmp/pi-cache-safety.jsonl",
          },
        } as unknown as ExtensionContext;

        await sessionStart?.({ type: "session_start" }, ctx);

        const result = (await beforeStart?.(
          { type: "before_agent_start", prompt, systemPrompt: "base" },
          ctx
        )) as { systemPrompt?: string; message?: unknown } | undefined;

        if (result) {
          expect(result.systemPrompt).toBeUndefined();
        }
      } finally {
        cleanup();
      }
    }),
    { numRuns: 60 }
  );
});
```

**Step 2: Run test to verify current behavior**

Run:

```bash
pnpm run test -- src/cache-safety.test.ts
```

Expected: PASS if contract is already honored; FAIL if any handler starts returning `systemPrompt`.

**Step 3: Write minimal implementation**

No production change expected if test passes. If failing, fix only `before_agent_start` return shape in `src/index.ts` so it returns only `message` (never `systemPrompt`).

**Step 4: Re-run test**

Run:

```bash
pnpm run test -- src/cache-safety.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/cache-safety.test.ts src/index.ts
git commit -m "test: enforce append-only before_agent_start cache contract"
```

---

### Task 4: Add state-machine property for `statusInjected` reset/inject lifecycle

**TDD scenario:** New feature — property-based state machine over lifecycle events.

**Files:**

- Modify: `src/cache-safety.test.ts`
- Reference implementation under test: `src/index.ts:225-295`
- Test: `src/cache-safety.test.ts`

**Step 1: Write the failing property test**

Append this state-machine property:

```ts
it("injects at most one brain-status message per epoch and resets on session events", async () => {
  const opArb = fc.array(
    fc.constantFrom(
      "before_agent_start",
      "session_start",
      "session_switch",
      "session_compact"
    ),
    { minLength: 1, maxLength: 80 }
  );

  await fc.assert(
    fc.asyncProperty(opArb, async (ops) => {
      const { projectDir, cleanup } = setupInitializedProject();
      try {
        const mockPi = createMockPi();
        activate(mockPi.api);

        const getHandler = (name: string) =>
          mockPi.handlers.find((h) => h.event === name)?.handler;
        const beforeStart = getHandler("before_agent_start");
        const onSessionStart = getHandler("session_start");
        const onSessionSwitch = getHandler("session_switch");
        const onSessionCompact = getHandler("session_compact");

        const ctx = {
          cwd: projectDir,
          ui: { notify() {}, setStatus() {} },
          sessionManager: {
            getSessionFile: () => "/tmp/pi-cache-safety.jsonl",
          },
        } as unknown as ExtensionContext;

        let canInject = true;

        for (const op of ops) {
          if (op === "session_start") {
            await onSessionStart?.({ type: "session_start" }, ctx);
            canInject = true;
            continue;
          }

          if (op === "session_switch") {
            await onSessionSwitch?.(
              {
                type: "session_switch",
                reason: "resume",
                previousSessionFile: "/tmp/prev.jsonl",
              },
              ctx
            );
            canInject = true;
            continue;
          }

          if (op === "session_compact") {
            await onSessionCompact?.({ type: "session_compact" }, ctx);
            canInject = true;
            continue;
          }

          const result = (await beforeStart?.(
            { type: "before_agent_start", prompt: "p", systemPrompt: "base" },
            ctx
          )) as { message?: { customType?: string } } | undefined;

          if (canInject) {
            expect(result?.message?.customType).toBe("brain-status");
            canInject = false;
          } else {
            expect(result).toBeUndefined();
          }
        }
      } finally {
        cleanup();
      }
    }),
    { numRuns: 40 }
  );
});
```

**Step 2: Run test to verify it fails or passes**

Run:

```bash
pnpm run test -- src/cache-safety.test.ts
```

Expected: PASS if lifecycle gating is correct; FAIL if any reset/injection path regresses.

**Step 3: Write minimal implementation**

No production change expected if passing. If failing, adjust only `statusInjected` transitions in:

- `session_start`
- `session_switch`
- `session_compact`
- `before_agent_start`

in `src/index.ts`.

**Step 4: Re-run test**

Run:

```bash
pnpm run test -- src/cache-safety.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/cache-safety.test.ts src/index.ts
git commit -m "test: add lifecycle state-machine property for brain status injection"
```

---

### Task 5: Add deterministic status text property (same filesystem state → same output)

**TDD scenario:** New feature — property tests for deterministic rendering.

**Files:**

- Modify: `src/cache-safety.test.ts`
- Reference implementation under test: `src/memory-context.ts:111-148`
- Test: `src/cache-safety.test.ts`

**Step 1: Write the failing property test**

Append:

```ts
import { BranchManager } from "./branches.js";
import { buildStatusView } from "./memory-context.js";
import { MemoryState } from "./state.js";

it("buildStatusView is deterministic for identical on-disk state", () => {
  const branchNameArb = fc
    .stringMatching(/^[a-z][a-z0-9-]{0,12}$/)
    .filter((name) => name !== "main");

  fc.assert(
    fc.property(
      fc.uniqueArray(branchNameArb, { maxLength: 8 }),
      fc.string(),
      (extraBranches, roadmap) => {
        const { projectDir, cleanup } = setupInitializedProject();
        try {
          fs.writeFileSync(
            path.join(projectDir, ".memory", "main.md"),
            `# Roadmap\n\n${roadmap}`
          );

          const branches = new BranchManager(projectDir);
          for (const name of [...extraBranches].reverse()) {
            branches.createBranch(name, `Purpose ${name}`);
          }

          const state = new MemoryState(projectDir);
          state.load();

          const first = buildStatusView(state, branches, projectDir, {
            compact: true,
            branchLimit: 8,
          });
          const second = buildStatusView(state, branches, projectDir, {
            compact: true,
            branchLimit: 8,
          });

          expect(first).toBe(second);
        } finally {
          cleanup();
        }
      }
    ),
    { numRuns: 50 }
  );
});
```

**Step 2: Run test to verify behavior**

Run:

```bash
pnpm run test -- src/cache-safety.test.ts
```

Expected: PASS. If it fails, investigate nondeterministic branch ordering/formatting.

**Step 3: Write minimal implementation**

No production code change expected if Task 1 sort fix is in place.

**Step 4: Re-run test**

Run:

```bash
pnpm run test -- src/cache-safety.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/cache-safety.test.ts
git commit -m "test: add deterministic status rendering property tests"
```

---

### Task 6: Full verification and final integration commit

**TDD scenario:** Modifying tested code — run targeted tests first, then full suite/checks before completion.

**Files:**

- Verify changed files:
  - `src/branches.ts`
  - `src/branches.test.ts`
  - `src/cache-safety.test.ts`

**Step 1: Run targeted tests for changed files**

```bash
pnpm run test -- src/branches.test.ts
pnpm run test -- src/cache-safety.test.ts
```

Expected: PASS.

**Step 2: Run full test suite**

```bash
pnpm run test
```

Expected: PASS.

**Step 3: Run full repository checks**

```bash
pnpm run check
```

Expected: PASS (lint, typecheck, format:check, deadcode, duplicates, secrets, tests).

**Step 4: Confirm no out-of-scope file edits**

```bash
git status --short
```

Expected: only planned file changes present.

**Step 5: Commit verification pass**

```bash
git add src/branches.ts src/branches.test.ts src/cache-safety.test.ts
git commit -m "test: add cache-safety property suite and deterministic branch ordering"
```

---

## Notes for the implementer

- Keep the tool surface static (`memory_branch`, `memory_commit`). Do not introduce runtime tool registration.
- Do not return `systemPrompt` from `before_agent_start`; status must remain append-only message context.
- Prefer `fast-check` properties over one-off examples for lifecycle sequence coverage.
- Keep test runtime bounded (`numRuns` between 40-60) to avoid slowing CI.
