# Fix Session Branch Sync + Empty Roadmap Status Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Fix two regressions from the spec-sync refactor: stale session branch mapping after branch switches, and missing roadmap guidance when `.gcc/main.md` exists but is empty.

**Architecture:** Keep behavior aligned with canonical spec: `session_start` registration remains, `gcc_context` stays status-only, and branch/session mapping is updated when GCC branch state changes. Implement the smallest code changes with test-first workflow.

**Tech Stack:** TypeScript, Vitest, pi extension API, YAML-backed `.gcc/state.yaml` persistence.

---

### Task 1: Fix stale session->branch mapping with TDD

**Files:**

- Modify: `src/index.test.ts`
- Modify: `src/state.test.ts`
- Modify: `src/index.ts`

**Step 1: Write failing tests**

In `src/index.test.ts`, add a regression test:

1. Boot initialized project via `session_start` with a fixed session file.
2. Call `gcc_branch` (or `gcc_switch`) to change active branch.
3. Assert `.gcc/state.yaml` has the same session file entry with updated `branch`.

In `src/state.test.ts`, assert `upsertSession()` updates existing session `branch` while preserving initial `started` value.

**Step 2: Run tests to confirm failure**

```bash
pnpm run test -- src/index.test.ts src/state.test.ts
```

Expected: FAIL due to branch mapping not being updated outside `session_start`.

**Step 3: Write minimal implementation**

In `src/index.ts`:

- Add a small helper that reads `ctx.sessionManager.getSessionFile()`, calls `state.upsertSession(...)`, and `state.save()`.
- Call this helper in:
  - `session_start` (existing behavior),
  - successful `gcc_branch` tool execution,
  - successful `gcc_switch` tool execution.

**Step 4: Run tests to confirm pass**

```bash
pnpm run test -- src/index.test.ts src/state.test.ts
```

Expected: PASS.

---

### Task 2: Fix empty `.gcc/main.md` status blind spot with TDD

**Files:**

- Modify: `src/gcc-context.test.ts`
- Modify: `src/gcc-context.ts`

**Step 1: Write failing test**

Add test in `src/gcc-context.test.ts`:

- Create empty `.gcc/main.md`.
- Call `executeGccContext({}, ...)`.
- Assert result contains explicit guidance that roadmap is empty and should be authored.

**Step 2: Run test to confirm failure**

```bash
pnpm run test -- src/gcc-context.test.ts
```

Expected: FAIL because existing code emits no roadmap message when the file exists but is empty.

**Step 3: Write minimal implementation**

In `src/gcc-context.ts`:

- In `buildStatusView`, preserve current behavior for missing file.
- Add explicit message for existing-but-empty `.gcc/main.md`.

**Step 4: Run test to confirm pass**

```bash
pnpm run test -- src/gcc-context.test.ts
```

Expected: PASS.

---

### Task 3: Verification

**Files:**

- No code changes expected

**Step 1: Run targeted suite**

```bash
pnpm run test -- src/index.test.ts src/state.test.ts src/gcc-context.test.ts src/gcc-switch.test.ts
```

Expected: PASS.

**Step 2: Run full suite**

```bash
pnpm run test
```

Expected: PASS.

**Step 3: Run full quality gate**

```bash
pnpm run check
```

Expected: PASS.
