# GCC Spec Sync + Cache-Safe Realignment Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Make `pi-gcc` follow the canonical GCC spec from `pi-ctx`, with prompt-cache-safe behavior and matching runtime/docs contracts.

**Architecture:** First, make the canonical spec explicit in this repo and remove ambiguous copies. Then align runtime behavior with the canonical cache model: no per-turn context injection and no dynamic root `AGENTS.md` state updates. Finally, reconcile tool/state/lifecycle behavior and docs, with tests leading each behavior change.

**Tech Stack:** TypeScript (ESM), Vitest, Node `fs/path`, pi extension API (`@mariozechner/pi-coding-agent`), bash-based init script.

---

## Phase 0 — Canonical Spec Files (Documentation Ground Truth)

### Task 1: Lock canonical + archived spec filenames and remove ambiguous spec path

**Files:**

- Verify: `docs/specs/GCC-SPEC-WRONG-ONE.md`
- Verify: `docs/specs/GCC-SPEC-USE-THIS-ONE.md`
- Delete: `docs/specs/GCC-SPEC.md`

**Step 1: Write failing verification check**

```bash
test -f docs/specs/GCC-SPEC.md && echo "FOUND_OLD_SPEC"
```

Expected (before removal): `FOUND_OLD_SPEC`.

**Step 2: Run check to confirm canonical copy correctness**

```bash
sha256sum docs/specs/GCC-SPEC-USE-THIS-ONE.md /home/will/projects/pi-ctx/docs/specs/GCC-SPEC.md
```

Expected: matching hashes.

**Step 3: Write minimal implementation**

```bash
rm -f docs/specs/GCC-SPEC.md
```

**Step 4: Run verification**

```bash
ls -l docs/specs/GCC-SPEC-WRONG-ONE.md docs/specs/GCC-SPEC-USE-THIS-ONE.md
! test -f docs/specs/GCC-SPEC.md
```

Expected: archived + canonical files exist; old ambiguous filename absent.

**Step 5: Commit**

```bash
git add docs/specs/GCC-SPEC-WRONG-ONE.md docs/specs/GCC-SPEC-USE-THIS-ONE.md
git rm docs/specs/GCC-SPEC.md
git commit -m "docs: lock canonical GCC spec filenames and remove ambiguous copy"
```

---

### Task 2: Update diff tracking docs to use canonical/archived filenames

**Files:**

- Modify: `docs/specs/fix-specs-diff.md`
- Modify: `docs/plans/2026-02-23-spec-sync-implementation.md`

**Step 1: Write failing verification check**

```bash
rg -n 'Modify: `docs/specs/GCC-SPEC\\.md`|cp .*docs/specs/GCC-SPEC\\.md docs/specs/GCC-SPEC\\.md|target needing updates.*GCC-SPEC\\.md' docs/specs/fix-specs-diff.md docs/plans/2026-02-23-spec-sync-implementation.md
```

Expected (before update): matches found.

**Step 2: Run check to confirm fail condition**
Run the command above and capture output.

**Step 3: Write minimal implementation**

- Replace references to `docs/specs/GCC-SPEC.md` with:
  - `docs/specs/GCC-SPEC-USE-THIS-ONE.md` (canonical)
  - `docs/specs/GCC-SPEC-WRONG-ONE.md` (archived)
- Add explicit rule: do not recreate `docs/specs/GCC-SPEC.md`.

**Step 4: Run verification**

```bash
rg -n 'Modify: `docs/specs/GCC-SPEC\\.md`|cp .*docs/specs/GCC-SPEC\\.md docs/specs/GCC-SPEC\\.md|target needing updates.*GCC-SPEC\\.md' docs/specs/fix-specs-diff.md docs/plans/2026-02-23-spec-sync-implementation.md
```

Expected: no matches.

**Step 5: Commit**

```bash
git add docs/specs/fix-specs-diff.md docs/plans/2026-02-23-spec-sync-implementation.md
git commit -m "docs: update spec-sync references to canonical GCC spec filenames"
```

---

## Phase 1 — Cache-Safe Runtime Behavior

### Task 3: Remove `before_agent_start` context injection hook

**Files:**

- Modify: `src/index.ts`
- Modify: `src/index.test.ts`
- Delete: `src/context-injector.ts`
- Delete: `src/context-injector.test.ts`

**Step 1: Write the failing test**
In `src/index.test.ts`, change handler assertion to reject `before_agent_start`:

```ts
expect(handlerNames).not.toContain("before_agent_start");
```

**Step 2: Run test to verify it fails**
Run: `pnpm run test -- src/index.test.ts`
Expected: FAIL because handler is currently registered.

**Step 3: Write minimal implementation**

- Remove `buildContextInjection` import.
- Remove `pi.on("before_agent_start", ...)` registration.
- Remove now-dead `context-injector` module/tests.

**Step 4: Run tests to verify pass**
Run:

```bash
pnpm run test -- src/index.test.ts
pnpm run test -- src/integration.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/index.ts src/index.test.ts src/integration.test.ts
git rm src/context-injector.ts src/context-injector.test.ts
git commit -m "refactor: remove before_agent_start GCC context injection"
```

---

### Task 4: Make root `AGENTS.md` static and stop runtime state writes

**Files:**

- Modify: `src/gcc-commit.ts`
- Modify: `src/gcc-commit.test.ts`
- Modify: `src/gcc-merge.ts`
- Modify: `src/gcc-merge.test.ts`
- Delete: `src/agents-md.ts`
- Delete: `src/agents-md.test.ts`

**Step 1: Write failing tests**

- In `src/gcc-commit.test.ts`, replace/update test:

```ts
it("does not modify root AGENTS.md during commit finalization", () => {
  const before = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
  finalizeGccCommit("New milestone", commitContent, state, branches, tmpDir);
  const after = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
  expect(after).toBe(before);
});
```

- In `src/gcc-merge.test.ts`, same invariant for merge.

**Step 2: Run tests to verify failure**
Run: `pnpm run test -- src/gcc-commit.test.ts src/gcc-merge.test.ts`
Expected: FAIL because code still updates root `AGENTS.md`.

**Step 3: Write minimal implementation**

- Remove `updateRootAgentsMd` imports/calls from commit + merge flows.
- Remove unused `projectDir` dependency if no longer needed.
- Delete `src/agents-md.*` and clean imports.

**Step 4: Run tests to verify pass**
Run:

```bash
pnpm run test -- src/gcc-commit.test.ts
pnpm run test -- src/gcc-merge.test.ts
pnpm run test -- src/integration.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/gcc-commit.ts src/gcc-commit.test.ts src/gcc-merge.ts src/gcc-merge.test.ts src/integration.test.ts
git rm src/agents-md.ts src/agents-md.test.ts
git commit -m "refactor: stop dynamic root AGENTS updates from GCC runtime"
```

---

### Task 5: Align init script/template with static root AGENTS contract

**Files:**

- Modify: `skills/gcc/scripts/gcc-init.sh`
- Modify: `skills/gcc/templates/root-agents-section.md`
- Modify: `src/init-script.test.ts`

**Step 1: Write failing tests**
Add/adjust tests in `src/init-script.test.ts`:

```ts
it("creates .gcc/main.md as empty file", () => {
  execFileSync("bash", [scriptPath], { cwd: tmpDir });
  expect(fs.existsSync(path.join(tmpDir, ".gcc/main.md"))).toBeTruthy();
});

it("writes static root GCC AGENTS section without branch/milestone state", () => {
  execFileSync("bash", [scriptPath], { cwd: tmpDir });
  const agents = fs.readFileSync(path.join(tmpDir, "AGENTS.md"), "utf8");
  expect(agents).toContain(
    "Tools: gcc_commit, gcc_branch, gcc_merge, gcc_switch, gcc_context"
  );
  expect(agents).not.toContain("Current branch:");
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm run test -- src/init-script.test.ts`
Expected: FAIL on new assertions.

**Step 3: Write minimal implementation**

- Ensure script creates `.gcc/main.md` if missing.
- Ensure script appends `.gcc/branches/*/log.md` to `.gitignore` idempotently.
- Update template to static instructions only.

**Step 4: Run test to verify it passes**
Run: `pnpm run test -- src/init-script.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add skills/gcc/scripts/gcc-init.sh skills/gcc/templates/root-agents-section.md src/init-script.test.ts
git commit -m "feat: make GCC init output cache-safe static AGENTS section"
```

---

### Task 6: Simplify `gcc_context` to status overview (detail via `read`)

**Files:**

- Modify: `src/gcc-context.ts`
- Modify: `src/gcc-context.test.ts`
- Modify: `src/types.ts`
- Modify: `src/index.ts`

**Step 1: Write failing tests**
Replace current multi-level tests with status-only behavior:

```ts
it("returns status overview when called with empty params", () => {
  const result = executeGccContext({}, state, branches, tmpDir);
  expect(result).toContain("# GCC Status");
  expect(result).toContain(
    "Use read .gcc/branches/<name>/commits.md for full history"
  );
});
```

And add:

```ts
it("ignores unsupported level params and still returns status", () => {
  const result = executeGccContext(
    { level: "branch" },
    state,
    branches,
    tmpDir
  );
  expect(result).toContain("# GCC Status");
});
```

**Step 2: Run tests to verify failure**
Run: `pnpm run test -- src/gcc-context.test.ts src/index.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**

- Make `executeGccContext` always return status overview.
- Remove level/branch/commit/segment branching logic.
- Keep parameters backward-tolerant in handler, but treat them as ignored.

**Step 4: Run tests to verify pass**
Run:

```bash
pnpm run test -- src/gcc-context.test.ts
pnpm run test -- src/index.test.ts
pnpm run test -- src/integration.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/gcc-context.ts src/gcc-context.test.ts src/types.ts src/index.ts src/index.test.ts src/integration.test.ts
git commit -m "refactor: reduce gcc_context to status overview contract"
```

---

## Phase 2 — State/Lifecycle + Documentation Parity

### Task 7: Add `sessions` support to state model and YAML handling

**Files:**

- Modify: `src/yaml.ts`
- Modify: `src/yaml.test.ts`
- Modify: `src/state.ts`
- Modify: `src/state.test.ts`
- Modify: `src/index.ts`
- Modify: `src/index.test.ts`

**Step 1: Write failing tests**

- In `src/yaml.test.ts`, add list parsing/serialization case for:

```yaml
sessions:
  - file: /tmp/session.jsonl
    branch: main
    started: "2026-02-23T00:00:00Z"
```

- In `src/state.test.ts`, assert sessions round-trip.
- In `src/index.test.ts`, assert `session_start` appends/updates a session record using `ctx.sessionManager.getSessionFile()`.

**Step 2: Run tests to verify failure**
Run:

```bash
pnpm run test -- src/yaml.test.ts src/state.test.ts src/index.test.ts
```

Expected: FAIL (lists unsupported today).

**Step 3: Write minimal implementation**

- Extend YAML parser/serializer for top-level `key -> list of one-level objects`.
- Add `sessions` field in `GccState` with load/save support.
- In `session_start`, register session metadata if GCC initialized and session file available.

**Step 4: Run tests to verify pass**
Run:

```bash
pnpm run test -- src/yaml.test.ts
pnpm run test -- src/state.test.ts
pnpm run test -- src/index.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/yaml.ts src/yaml.test.ts src/state.ts src/state.test.ts src/index.ts src/index.test.ts
git commit -m "feat: add state.yaml sessions tracking support"
```

---

### Task 8: Align lifecycle hooks to canonical spec scope

**Files:**

- Modify: `src/index.ts`
- Modify: `src/index.test.ts`
- Modify: `src/integration.test.ts`

**Step 1: Write failing tests**
In `src/index.test.ts`, tighten lifecycle assertions:

```ts
expect(handlerNames).toContain("turn_end");
expect(handlerNames).toContain("session_start");
expect(handlerNames).toContain("session_before_compact");
expect(handlerNames).not.toContain("before_agent_start");
```

If removing shutdown for parity:

```ts
expect(handlerNames).not.toContain("session_shutdown");
```

**Step 2: Run tests to verify failure**
Run: `pnpm run test -- src/index.test.ts`
Expected: FAIL until hook wiring is adjusted.

**Step 3: Write minimal implementation**

- Keep `turn_end`, `session_start`, `session_before_compact`, `resources_discover`.
- Remove `session_shutdown` if strict canonical parity is required.
- Keep compaction reminder optional/best-effort only.

**Step 4: Run tests to verify pass**
Run:

```bash
pnpm run test -- src/index.test.ts
pnpm run test -- src/integration.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add src/index.ts src/index.test.ts src/integration.test.ts
git commit -m "refactor: align GCC lifecycle hooks with canonical spec"
```

---

### Task 9: Resolve `gcc_commit` distillation model divergence (checkpoint)

**Files:**

- Decision doc update: `docs/specs/fix-specs-diff.md`
- Possible code: `src/gcc-commit.ts`, `src/commit-flow.ts`, `src/index.ts`, tests

**Step 1: Write failing contract test (selected option only)**
Create one test capturing the chosen behavior:

- **Option A (strict spec):** commit is fully distilled in one call via subagent path.
- **Option B (pragmatic):** keep current two-step flow and document approved divergence.

**Step 2: Run test to verify failure**
Run targeted test file and capture failure.

**Step 3: Implement minimal selected behavior**

- A: add distillation mechanism and remove `CommitFlowManager` if obsolete.
- B: retain two-step flow and mark canonical spec exception in docs.

**Step 4: Run tests to verify pass**
Run relevant tests + integration.

**Step 5: Commit**

```bash
git add <changed files>
git commit -m "feat: resolve gcc_commit distillation model divergence"
```

> **Checkpoint (required before Task 9 implementation):** choose Option A (strict subagent distillation) or Option B (intentional two-step divergence with docs update).

---

### Task 10: Update user/agent docs to match runtime + canonical spec

**Files:**

- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `skills/gcc/SKILL.md`
- Modify: `docs/specs/fix-specs-diff.md`

**Step 1: Write failing doc checks**
Use grep checks that should fail before edits:

```bash
rg -n "before_agent_start|gcc_context_injection|Current branch:" README.md AGENTS.md skills/gcc/SKILL.md
```

Expected: matches found (fail condition).

**Step 2: Run checks to confirm fail condition**
Run command and save output.

**Step 3: Write minimal implementation**

- Remove stale mentions of injection/dynamic root AGENTS behavior.
- Add guidance: use `gcc_context` + `read` for orientation.
- Mark each diff item in `fix-specs-diff.md` as done/deferred.

**Step 4: Run verification checks**

```bash
rg -n "before_agent_start|gcc_context_injection" README.md AGENTS.md skills/gcc/SKILL.md
```

Expected: no matches (unless explicitly in historical notes section).

**Step 5: Commit**

```bash
git add README.md AGENTS.md skills/gcc/SKILL.md docs/specs/fix-specs-diff.md
git commit -m "docs: align GCC guidance with canonical cache-safe spec"
```

---

## Phase 3 — Final Verification + Manual Validation

### Task 11: End-to-end verification before completion

**Files:**

- No new files (verification artifacts only)

**Step 1: Run targeted tests for touched modules**

```bash
pnpm run test -- src/index.test.ts src/init-script.test.ts src/gcc-context.test.ts src/gcc-commit.test.ts src/gcc-merge.test.ts src/state.test.ts src/yaml.test.ts
```

Expected: PASS.

**Step 2: Run full test suite**
Run: `pnpm run test`
Expected: PASS.

**Step 3: Run full quality gate**
Run: `pnpm run check`
Expected: all PASS (lint/typecheck/format/deadcode/duplicates/secrets/test).

**Step 4: Manual runtime check**

```bash
pi -e ./src/index.ts
```

In a temp project:

1. Run init script.
2. Confirm static root AGENTS section.
3. Confirm no per-turn injection events.
4. Confirm `gcc_context` status output + `read`-based detail workflow.

**Step 5: Commit final verification note**

```bash
git add -A
git commit -m "chore: final verification for GCC canonical spec sync"
```

(Only if any final doc/test metadata changed.)

---

## Notes for Executor

- Use a dedicated worktree before Task 1.
- Keep commits small and in task order.
- Do not skip failing-test-first steps.
- If Task 9 (commit distillation model) is blocked by extension API limits, stop and request decision before proceeding.
