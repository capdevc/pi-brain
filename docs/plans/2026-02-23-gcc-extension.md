# GCC Extension Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Build the GCC (Git Context Controller) extension — an agent-driven, version-controlled memory system that gives pi agents persistent, structured context across sessions, compactions, and model switches.

**Architecture:** The extension registers 5 tools (`gcc_commit`, `gcc_branch`, `gcc_merge`, `gcc_context`, `gcc_switch`) and hooks into pi's lifecycle events (`turn_end`, `before_agent_start`, `session_start`, `session_shutdown`, `session_before_compact`). Hooks are extracted into testable functions. File I/O operates on a `.gcc/` directory in the project root. A companion skill (`SKILL.md`) and init script (`gcc-init.sh`) are authored as static files and tested via automated bash execution.

**Tech Stack:** TypeScript, pi extension API (`@mariozechner/pi-coding-agent`), TypeBox schemas (`@sinclair/typebox`), Node `fs`/`child_process` modules, minimal flat YAML parser.

---

## Universal Verification Protocol (Apply to EVERY Task)

**Do not skip these steps.** Every task must follow this exact verification cycle:

1. **Write failing test first.**
2. **Run test to verify failure:** `pnpm run test -- <test-file>`
3. **Write implementation.**
4. **Run test to verify success:** `pnpm run test -- <test-file>`
   - **Recovery:** If FAIL, stop. Do not proceed to commit. Fix the implementation or the test until it passes. Use `systematic-debugging` if stuck.
5. **Run static checks:** `pnpm run check`
   - **Recovery:** If FAIL, fix all lint, formatting, deadcode, duplicate, or type errors before committing. The codebase must remain 100% clean at every commit.
6. **Commit** only when all the above pass.

---

## Phase 1: Foundation (State, File I/O, Init Script)

### Task 1: YAML Utility Module

Minimal YAML serializer/deserializer for `state.yaml` and `metadata.yaml`.

**Files:**

- Create: `src/yaml.ts`
- Create: `src/yaml.test.ts`

**Step 1: Write the failing tests**

```typescript
// src/yaml.test.ts
import { parseYaml, serializeYaml } from "./yaml.js";

describe("parseYaml", () => {
  it("parses flat key-value pairs", () => {
    const input = `active_branch: main\ninitialized: "2026-02-22T14:00:00Z"`;
    expect(parseYaml(input)).toEqual({
      active_branch: "main",
      initialized: "2026-02-22T14:00:00Z",
    });
  });

  it("parses nested objects (one level)", () => {
    const input = `last_commit:\n  branch: main\n  hash: a1b2c3d4\n  summary: "Decided X"`;
    expect(parseYaml(input)).toEqual({
      last_commit: { branch: "main", hash: "a1b2c3d4", summary: "Decided X" },
    });
  });

  it("returns empty object for empty or whitespace input", () => {
    expect(parseYaml("")).toEqual({});
    expect(parseYaml("  \n  ")).toEqual({});
  });
});

describe("serializeYaml", () => {
  it("serializes flat key-value pairs", () => {
    const obj = { active_branch: "main", initialized: "2026-02-22" };
    expect(serializeYaml(obj)).toBe(
      `active_branch: main\ninitialized: "2026-02-22"`
    );
  });

  it("serializes nested objects (one level)", () => {
    const obj = { last_commit: { branch: "main", hash: "a1b2c3d4" } };
    expect(serializeYaml(obj)).toBe(
      `last_commit:\n  branch: main\n  hash: a1b2c3d4`
    );
  });

  it("round-trips through parse and serialize", () => {
    const original = {
      active_branch: "main",
      last_commit: { branch: "main", hash: "abc" },
    };
    expect(parseYaml(serializeYaml(original))).toEqual(original);
  });
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm run test -- src/yaml.test.ts`

**Step 3: Write implementation**
Implement `parseYaml` and `serializeYaml` handling flat and one-level nested objects. Quote strings containing special characters or date-like formats.

**Step 4: Run test to verify it passes**
Run: `pnpm run test -- src/yaml.test.ts`
_(Recovery: Fix implementation until pass)_

**Step 5: Run checks and Commit**
Run: `pnpm run check`
_(Recovery: Fix lint/types until pass)_
Command: `git commit -m "feat: add minimal YAML parser/serializer"`

---

### Task 2: State Manager Module

Manages `.gcc/state.yaml`. Must handle partial state files gracefully.

**Files:**

- Create: `src/state.ts`
- Create: `src/state.test.ts`

**Step 1: Write the failing tests**
Include tests for:

- Loading valid `state.yaml`
- Loading when `state.yaml` is empty or malformed (should not crash, fallback to defaults)
- Updating active branch and last commit
- `GccState.isInitialized` logic

**Step 2: Run test to verify it fails**
Run: `pnpm run test -- src/state.test.ts`

**Step 3: Write implementation**
Implement `GccState` class wrapping `parseYaml` / `serializeYaml` with file read/write operations.

**Step 4: Run test to verify it passes**
Run: `pnpm run test -- src/state.test.ts`

**Step 5: Run checks and Commit**
Run: `pnpm run check`
Command: `git commit -m "feat: add GCC state manager"`

---

### Task 3: Commit Hash Generator

**Files:**

- Create: `src/hash.ts`
- Create: `src/hash.test.ts`

**Step 1: Write the failing tests**
Assert output is exactly 8 lowercase hex chars. Do **not** assert strict uniqueness across 1000 random iterations (flaky with 32-bit hashes). Instead, add deterministic tests (e.g., mock `randomBytes` to verify hex formatting and call behavior).

**Step 2: Run test to verify it fails**
Run: `pnpm run test -- src/hash.test.ts`

**Step 3: Write implementation**
Use `node:crypto` `randomBytes(4).toString("hex")`.

**Step 4: Run test to verify it passes**
Run: `pnpm run test -- src/hash.test.ts`

**Step 5: Run checks and Commit**
Run: `pnpm run check`
Command: `git commit -m "feat: add commit hash generator"`

---

### Task 4: Branch Manager Module

Handles `.gcc/branches/` directory operations. Needs strong edge-case handling.

**Files:**

- Create: `src/branches.ts`
- Create: `src/branches.test.ts`

**Step 1: Write the failing tests**
Include tests for:

- Creating a branch creates `log.md`, `commits.md`, `metadata.yaml`.
- Appending log entries and commit entries.
- Reading logs/commits returns `""` if file missing.
- `listBranches` safely ignores non-directories in `.gcc/branches/`.
- `getLogTurnCount` accurately counts `^## Turn ` occurrences.
- `getLatestCommit` safely handles empty `commits.md` or files with only a header.

**Step 2: Run test to verify it fails**
Run: `pnpm run test -- src/branches.test.ts`

**Step 3: Write implementation**
Implement `BranchManager`.

**Step 4: Run test to verify it passes**
Run: `pnpm run test -- src/branches.test.ts`

**Step 5: Run checks and Commit**
Run: `pnpm run check`
Command: `git commit -m "feat: add branch manager"`

---

### Task 5: OTA Log Formatter

**Files:**

- Create: `src/ota-formatter.ts`
- Create: `src/ota-formatter.test.ts`

**Step 1: Write the failing tests**
Test full turn formatting, omitted thinking block (if empty), omitted action/observation (if no tools called).

**Step 2: Run test to verify it fails**
Run: `pnpm run test -- src/ota-formatter.test.ts`

**Step 3: Write implementation**
Implement `formatOtaEntry` matching the GCC spec.

**Step 4: Run test to verify it passes**
Run: `pnpm run test -- src/ota-formatter.test.ts`

**Step 5: Run checks and Commit**
Run: `pnpm run check`
Command: `git commit -m "feat: add OTA log entry formatter"`

---

### Task 6: Init Script & Automated Test

Write the bash script, markdown templates, and an automated integration test.

**Files:**

- Create: `skills/gcc/scripts/gcc-init.sh`
- Create: `skills/gcc/SKILL.md`
- Create: `skills/gcc/templates/agents-md.md`
- Create: `skills/gcc/templates/root-agents-section.md`
- Create: `src/init-script.test.ts`

**Step 1: Write the automated test first**

```typescript
// src/init-script.test.ts
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

describe("gcc-init.sh", () => {
  it("initializes project structure", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcc-init-test-"));
    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const scriptPath = path.resolve(
      testDir,
      "../skills/gcc/scripts/gcc-init.sh"
    );

    try {
      // Execute script in tmpDir
      execFileSync("bash", [scriptPath], { cwd: tmpDir });

      expect(fs.existsSync(path.join(tmpDir, ".gcc/state.yaml"))).toBe(true);
      expect(
        fs.existsSync(path.join(tmpDir, ".gcc/branches/main/log.md"))
      ).toBe(true);

      // test idempotency
      execFileSync("bash", [scriptPath], { cwd: tmpDir });
      expect(
        fs
          .readFileSync(path.join(tmpDir, "AGENTS.md"), "utf-8")
          .match(/## GCC/g)?.length
      ).toBe(1);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm run test -- src/init-script.test.ts`

**Step 3: Write scripts and templates**
Implement `gcc-init.sh` and the templates as specified in the previous plan.
**CRITICAL:** In `SKILL.md`:

1. Explicitly instruct the agent on how to run the script using the absolute path derived from the skill's location: _"To initialize GCC, run the init script using the absolute path derived from this skill's location. Example: `bash $(dirname "/path/to/this/SKILL.md")/scripts/gcc-init.sh`"_
2. Instruct the agent: _"Always call `gcc_context --branch <target>` to review the history BEFORE calling `gcc_merge`."_

**Step 4: Run test to verify it passes**
Run: `pnpm run test -- src/init-script.test.ts`

**Step 5: Run checks and Commit**
Run: `pnpm run check`
Command: `git commit -m "feat: add gcc-init script and automated verification test"`

---

## Phase 2: Core Utilities & Tools

### Task 7: AGENTS.md Updater

Used by commit and merge tools to update the root `AGENTS.md` file.

**Files:**

- Create: `src/agents-md.ts`
- Create: `src/agents-md.test.ts`

**Step 1: Write the failing tests**
Ensure regex correctly replaces existing GCC sections without touching surrounding content, appends if missing, and creates the file if `AGENTS.md` doesn't exist.

**Step 2: Run test to verify it fails**
Run: `pnpm run test -- src/agents-md.test.ts`

**Step 3: Write implementation**
Implement `updateRootAgentsMd(projectDir, branch, summary)`.

**Step 4: Run test to verify it passes**
Run: `pnpm run test -- src/agents-md.test.ts`

**Step 5: Run checks and Commit**
Run: `pnpm run check`
Command: `git commit -m "feat: add AGENTS.md updater utility"`

---

### Task 8: `gcc_context` Tool

**Files:** `src/tools/gcc-context.ts`, `src/tools/gcc-context.test.ts`
Implement read-only context retrieval. Test all 5 levels (`status`, `branch`, `commit`, `log`, `metadata`).
**CRITICAL:** When extracting metadata segments, do not rely on indentation regex (which breaks on nested YAML). Extract everything from `^segment:` until the next top-level key (`^(?=[a-zA-Z0-9_-]+:)`) or EOF.
**Verification:** `pnpm run test -- src/tools/gcc-context.test.ts` then `pnpm run check`. Commit.

### Task 9: `gcc_branch` Tool

**Files:** `src/tools/gcc-branch.ts`, `src/tools/gcc-branch.test.ts`
Implement branch creation. Test for success and duplicate branch rejection.
**Verification:** `pnpm run test -- src/tools/gcc-branch.test.ts` then `pnpm run check`. Commit.

### Task 10: `gcc_switch` Tool

**Files:** `src/tools/gcc-switch.ts`, `src/tools/gcc-switch.test.ts`
Implement branch switching. Test success and nonexistent branch rejection.
**Verification:** `pnpm run test -- src/tools/gcc-switch.test.ts` then `pnpm run check`. Commit.

### Task 11: `gcc_commit` Tool

**Files:** `src/tools/gcc-commit.ts`, `src/tools/gcc-commit.test.ts`
Implement the 2-step commit process logic (`executeGccCommit` for prompt, `finalizeGccCommit` for writing). Uses `updateRootAgentsMd`.
**Verification:** `pnpm run test -- src/tools/gcc-commit.test.ts` then `pnpm run check`. Commit.

### Task 12: `gcc_merge` Tool

**Files:** `src/tools/gcc-merge.ts`, `src/tools/gcc-merge.test.ts`
Implement merging. Reject merging into self, reject missing branches. Uses `updateRootAgentsMd`.
**CRITICAL:** Ignore the spec's requirement that the tool "automatically call gcc*context". It is logically impossible since the user must provide `synthesis` upfront. Instead, update `SKILL.md` (in Task 6) to instruct the agent: *"Always call `gcc_context --branch <target>` to review the history BEFORE calling `gcc_merge`."\_
**Verification:** `pnpm run test -- src/tools/gcc-merge.test.ts` then `pnpm run check`. Commit.

---

## Phase 3: Hook Extractors & Wiring

To ensure 100% testability, extension hook logic is extracted into pure functions/classes that can be tested without mocking the complex `ExtensionAPI`.

### Task 13: OTA Logger Hook Extractor

Extracts `TurnEndEvent` processing logic.

**Files:**

- Create: `src/hooks/ota-logger.ts`
- Create: `src/hooks/ota-logger.test.ts`

**Step 1: Write the failing tests**
Mock a `TurnEndEvent` payload (import types from `@mariozechner/pi-coding-agent`). Test `extractOtaInput(event)` returns correct `OtaEntryInput` or `null` if no meaningful content exists (e.g., UI notifications).

**Step 2: Run test to verify it fails**
Run: `pnpm run test -- src/hooks/ota-logger.test.ts`

**Step 3: Write implementation**
Implement `extractOtaInput`.

**Step 4: Run test to verify it passes**
Run: `pnpm run test -- src/hooks/ota-logger.test.ts`

**Step 5: Run checks and Commit**
Run: `pnpm run check`
Command: `git commit -m "feat: add OTA logger hook extractor"`

---

### Task 14: Context Injector Hook Extractor

Builds the system prompt addition.

**Files:**

- Create: `src/hooks/context-injector.ts`
- Create: `src/hooks/context-injector.test.ts`

**Step 1: Write the failing tests**
Test `buildContextInjection(state, branches)` returns the correct markdown string based on current state.

**Step 2: Run test to verify it fails**
Run: `pnpm run test -- src/hooks/context-injector.test.ts`

**Step 3: Write implementation**
Implement `buildContextInjection`.

**Step 4: Run test to verify it passes**
Run: `pnpm run test -- src/hooks/context-injector.test.ts`

**Step 5: Run checks and Commit**
Run: `pnpm run check`
Command: `git commit -m "feat: add context injector hook logic"`

---

### Task 15: Commit Flow Hook Extractor

Manages the 2-step commit flow state.

**Files:**

- Create: `src/hooks/commit-flow.ts`
- Create: `src/hooks/commit-flow.test.ts`

**Step 1: Write the failing tests**
Test `CommitFlowManager`:

1. `setPendingCommit(params)`
2. `handleAgentEnd(messages)` returns extracted commit content and resets pending state.
   Test extraction regex/logic against mock agent responses containing `### Branch Purpose`, etc.

**Step 2: Run test to verify it fails**
Run: `pnpm run test -- src/hooks/commit-flow.test.ts`

**Step 3: Write implementation**
Implement `CommitFlowManager`.

**Step 4: Run test to verify it passes**
Run: `pnpm run test -- src/hooks/commit-flow.test.ts`

**Step 5: Run checks and Commit**
Run: `pnpm run check`
Command: `git commit -m "feat: add commit flow manager hook logic"`

---

### Task 16: Extension Entry Point

Wire the tested components into `pi.registerTool` and `pi.on`.

**Files:**

- Modify: `src/index.ts`
- Modify: `src/index.test.ts` (or create `src/index.wiring.test.ts`)

**Step 1: Write the failing tests first**
Add focused wiring tests that fail against the scaffold and verify:

- all 5 tools are registered (`gcc_commit`, `gcc_branch`, `gcc_merge`, `gcc_context`, `gcc_switch`)
- handlers are registered for `turn_end`, `before_agent_start`, `agent_end`, `session_start`, `session_shutdown`, `session_before_compact`, and `resources_discover`
- `agent_end` follow-up path sends a message with `deliverAs: "followUp"` when commit finalization returns content

**Step 2: Run test to verify it fails**
Run: `pnpm run test -- src/index.test.ts`
_(or `pnpm run test -- src/index.wiring.test.ts` if split)_

**Step 3: Write implementation**
Replace the scaffold.

- Declare `let state: GccState`, `let branchManager: BranchManager`, `const commitFlow = new CommitFlowManager()`.
- Register 5 tools via `pi.registerTool` with `TypeBox` schemas. Tool executes delegate to `src/tools/*`.
- Wire `turn_end` to `extractOtaInput` -> `formatOtaEntry` -> `branchManager.appendLog`.
- Wire `before_agent_start` to `buildContextInjection`.
- Wire `agent_end` to `commitFlow.handleAgentEnd`. If it returns data, call `finalizeGccCommit` and `pi.sendMessage` with `deliverAs: "followUp"`.
- Wire `session_start`, `session_shutdown`, `session_before_compact`, and `resources_discover`.

**Step 4: Run Typecheck and Tests**
Run: `pnpm run test -- src/index.test.ts`
_(or `pnpm run test -- src/index.wiring.test.ts` if split)_
Run: `pnpm run test` (Ensures nothing else broke)
Run: `pnpm run typecheck` (Ensures extension API types match)

**Step 5: Run checks and Commit**
Run: `pnpm run check`
Command: `git commit -m "feat: wire all tools and hooks into extension entry point"`

---

## Phase 4: Integration & Polish

### Task 17: Module Integration Tests

Test the state, branches, and tools operating together against a real filesystem.

**Files:**

- Create: `src/integration.test.ts`

**Step 1: Write the failing tests**
Write a single end-to-end test that creates a temp dir, initializes state, executes `gccBranch`, logs some OTA entries, executes `gccCommit`, and executes `gccContext` to verify the state chain holds together.

**Step 2: Run test to verify it fails**
Run: `pnpm run test -- src/integration.test.ts`

**Step 3: Write implementation**
Fix any integration bugs discovered between modules.

**Step 4: Run test to verify it passes**
Run: `pnpm run test -- src/integration.test.ts`

**Step 5: Run checks and Commit**
Run: `pnpm run check`
Command: `git commit -m "test: add module integration tests"`

---

### Task 18: Manual Integration Test

Test the full extension end-to-end interactively.

1. Start pi: `pi -e ./src/index.ts`
2. Ask the agent to initialize GCC. Verify `.gcc/` is created and AGENTS.md is updated.
3. Have the agent perform some tool calls. Verify `log.md` populates.
4. Ask the agent to run `gcc_commit` with a summary. Verify it completes the 2-step flow.
5. Exit pi and restart. Verify the GCC notification appears on load.

---

### Task 19: Final Check Suite

Run the full validation suite to ensure no edge cases were missed.

```bash
pnpm run check
```

If anything fails, fix and commit.
Command: `git commit -m "chore: polish and finalize GCC extension"`
