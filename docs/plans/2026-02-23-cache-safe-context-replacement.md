# Cache-Safe Plan: Replace `before_agent_start` Context Injection

**Date:** 2026-02-23  
**Status:** Proposed  
**Goal:** Preserve GCC orientation behavior while removing per-turn context injection and protecting prompt-cache efficiency.

---

## 1) Problem Statement

Current behavior injects GCC context on `before_agent_start` each turn. You flagged this as incompatible with your cache policy in `~/.pi/agent/HOW-CACHING-WORKS.md` ("No per-turn injection").

We need a replacement that:

1. Keeps agents oriented (branch, latest commit, pending work).
2. Avoids per-turn prompt modifications/injections.
3. Remains simple, testable, and compatible with current GCC tools.

---

## 2) Design Constraints

- Do **not** use `before_agent_start` for dynamic per-turn context.
- Do **not** mutate system prompt per turn.
- Keep tool definitions static across session lifetime.
- Preserve existing GCC tool contracts (`gcc_context`, `gcc_commit`, etc.).
- Keep behavior auditable through tests and JSON event output.

---

## 3) Options Considered

### Option A — Keep `before_agent_start`, but make content static

- Pros: Minimal code changes.
- Cons: Still uses per-turn injection mechanism; violates your explicit policy direction.

### Option B — Session/Event-driven orientation (recommended)

- Orientation appears at `session_start` and after state-changing GCC actions (`branch`, `switch`, `commit`, `merge`).
- Agent retrieves full memory on demand via `gcc_context`.
- Pros: No per-turn injection; cache-safe by policy; clear event boundaries.
- Cons: Agent may need explicit reminder to call `gcc_context` in long sessions.

### Option C — Auto-run `gcc_context` internally on each tool call

- Pros: Always current context in results.
- Cons: Hidden coupling, noisy output, repeated token cost, harder to reason about.

**Recommendation:** Option B.

---

## 4) Proposed Replacement Architecture (Option B)

1. **Remove `before_agent_start` hook entirely.**
2. **Keep `session_start` notification** with branch + uncommitted turn count.
3. **Emit concise orientation notifications after GCC state changes**:
   - after `gcc_branch`
   - after `gcc_switch`
   - after commit finalization in `agent_end`
   - after `gcc_merge`
4. **Rely on `gcc_context` as explicit memory retrieval API** for detailed context.
5. **Strengthen skill guidance**: call `gcc_context` at session/task start and before major decisions.

This keeps context retrieval explicit and avoids hidden prompt churn.

---

## 5) Implementation Tasks

### Task 1 — Spec/Plan alignment

- Update `docs/specs/GCC-SPEC.md`:
  - remove `before_agent_start` injection behavior
  - document session/event-driven orientation model
- Update `docs/plans/2026-02-23-gcc-extension.md`:
  - remove Task 14 dependency on `before_agent_start`
  - replace with cache-safe orientation task

### Task 2 — Remove hook wiring

- In `src/index.ts`:
  - delete `pi.on("before_agent_start", ...)`
- In `src/index.test.ts`:
  - assert `before_agent_start` is **not** registered

### Task 3 — Repurpose context injector module

- Option 1: delete `context-injector.ts` + tests if unused
- Option 2: repurpose as `buildOrientationSummary(...)` helper used by notifications

### Task 4 — Strengthen event-driven orientation

- Ensure `session_start`, `agent_end` (commit finalize), and state-changing tool flows surface compact orientation summaries via UI notify.

### Task 5 — Skill/documentation updates

- Update `skills/gcc/SKILL.md` and `README.md`:
  - "call `gcc_context` at start of session/task"
  - "no automatic per-turn context injection"

---

## 6) Verification Plan

### Automated

1. `src/index.test.ts`
   - fails first: remove expectation for `before_agent_start` registration
   - add expectation that orientation notifications still occur on session/state changes
2. If context-injector removed:
   - remove/replace related tests cleanly
3. Full suite: `pnpm run check`

### Manual / JSON mode

1. Run `pi -e ./src/index.ts --mode json -p "..."`
2. Verify **no** `before_agent_start` / `gcc_context_injection` turn-time messages.
3. Verify `.gcc` workflows still function (`branch`, `switch`, `commit`, `merge`, `context`).

---

## 7) Success Criteria

- No `before_agent_start` hook in runtime wiring.
- No per-turn dynamic context injection.
- GCC workflows remain fully functional.
- Agents still receive orientation via session/event notifications and explicit `gcc_context` calls.
- `pnpm run check` passes.

---

## 8) Risks and Mitigations

- **Risk:** Agent forgets to call `gcc_context`.
  - **Mitigation:** stronger skill instructions + concise reminders in state-changing tool outputs.

- **Risk:** Reduced implicit context in long sessions.
  - **Mitigation:** encourage explicit checkpoints (`gcc_context`, `gcc_commit`) and branch-specific workflows.

- **Risk:** Behavior drift from existing spec text.
  - **Mitigation:** update plan/spec before implementation and verify via tests.
