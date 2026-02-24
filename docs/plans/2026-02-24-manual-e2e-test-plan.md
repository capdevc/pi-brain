# Manual End-to-End Test Plan

Run with: `pi -e ./src/index.ts`

Test in a **scratch project directory** (not in pi-gcc itself).

**Model notes:** If using `zai/glm-4.7`, add
`--append-system-prompt 'Always think, reason, and respond in English only.'`

---

## 1. Extension Load + Skill Discovery

**What to verify:**

- Extension loads without errors
- No "description is required" or skill conflict warnings
- GCC skill appears in available skills list

**How:**

- Launch pi with the extension
- Check startup output for errors

---

## 2. Pre-Init Guard

**What to verify:**

- All 5 tools return "GCC not initialized" when `.gcc/` doesn't exist
- OTA logging silently no-ops (no crash)

**How:**

- Call `gcc_context` before init — expect "not initialized" message
- Call `gcc_branch` with name/purpose — expect "not initialized" message
- Have a normal conversation turn — confirm no crash from `turn_end` hook

---

## 3. Initialization

**What to verify:**

- Init script creates correct directory structure
- `state.yaml` has `active_branch: main` and `initialized` timestamp
- `.gcc/AGENTS.md` contains tool reference table
- `.gcc/main.md` exists (empty)
- `.gcc/branches/main/` has `log.md`, `commits.md`, `metadata.yaml`
- `commits.md` has "main" header and purpose line
- Root `AGENTS.md` has "## GCC" section appended
- `.gitignore` has `.gcc/branches/*/log.md` pattern

**How:**

- Run the init script: `bash "<skill-dir>/scripts/gcc-init.sh"`
- Inspect all files with `read`

---

## 4. Session Start Hook

**What to verify:**

- After init, restarting pi shows notification: `GCC active: branch "main" (0 uncommitted turns).`
- `state.yaml` has a `sessions:` entry with the current session file, branch "main", and a started timestamp

**How:**

- Restart pi (or start a new session in same pi instance)
- Check notification
- Read `.gcc/state.yaml` and confirm session entry

---

## 5. gcc_context — Status Overview

**What to verify:**

- Returns "# GCC Status" header
- Shows "Roadmap is empty" guidance (since `main.md` is empty)
- Shows "Active branch: main"
- Lists main branch with "(no commits)" or latest commit summary
- Shows deep retrieval instructions

**How:**

- Call `gcc_context`
- Verify all sections present

**Then:**

- Write content to `.gcc/main.md` (a short roadmap)
- Call `gcc_context` again — roadmap content should appear instead of "empty" message

---

## 6. OTA Logging (turn_end hook)

**What to verify:**

- Each assistant turn appends an entry to `.gcc/branches/main/log.md`
- Entry contains turn number, timestamp, model info
- Entry contains assistant text and/or tool calls
- Entry contains tool result observations (success/error)

**How:**

- Have 2-3 conversation turns (ask questions, use tools)
- Read `.gcc/branches/main/log.md`
- Confirm entries are structured OTA format with correct turn numbers

---

## 7. gcc_branch — Create Branch

**What to verify:**

- Creates `.gcc/branches/<name>/` with `log.md`, `commits.md`, `metadata.yaml`
- `commits.md` has branch header and purpose
- `state.yaml` updates `active_branch` to new branch name
- `state.yaml` session entry updates branch mapping to new branch
- Returns confirmation message with branch name and purpose

**How:**

- Call `gcc_branch` with name "explore-auth" and a purpose
- Read `.gcc/branches/explore-auth/commits.md` — confirm header/purpose
- Read `.gcc/state.yaml` — confirm `active_branch: explore-auth` and session branch updated
- Subsequent OTA logging should write to `explore-auth/log.md`, not `main/log.md`

**Error case:**

- Call `gcc_branch` with same name again — expect "already exists" message

---

## 8. gcc_switch — Switch Branch

**What to verify:**

- Updates `active_branch` in `state.yaml`
- Updates session branch mapping in `state.yaml`
- Returns confirmation with latest commit content (or "No commits yet")
- Subsequent OTA logging targets the switched-to branch

**How:**

- Call `gcc_switch` to branch "main"
- Verify `state.yaml` shows `active_branch: main`
- Have a conversation turn, verify log entry goes to `main/log.md`

**Error case:**

- Call `gcc_switch` to nonexistent branch — expect "not found" with available branches listed

---

## 9. gcc_commit — Commit Flow

> **NOTE:** When subagent-driven `gcc_commit` lands, re-run tests 9-12
> to validate the new flow. The subagent approach makes commit a single
> tool call (no `agent_end` extraction), which is a fundamentally
> different code path.

This is the most complex flow.

### With 2-step flow (current `main`):

Two steps happen across a tool call boundary.

**Step 1: Tool Call**

- Returns log contents for distillation
- Shows commit preparation header with branch name and summary
- Shows OTA entry count
- Shows previous commit content (if any) for rolling summary
- Prompts agent for three commit blocks

**Step 2: Agent Response + agent_end Hook**

- Agent writes the three commit blocks in its response
- `agent_end` hook extracts blocks and writes to `commits.md`
- `log.md` is cleared after successful commit
- `state.yaml` updates `last_commit` with hash, timestamp, branch, summary
- UI notification confirms commit hash and branch

### With subagent flow (once landed):

Single tool call that spawns a subagent to distill the log.

- Tool call triggers subagent, returns commit result inline
- `commits.md` written, `log.md` cleared, `state.yaml` updated
- No `agent_end` hook involvement

**How:**

- Make sure there are log entries (from earlier turns)
- Call `gcc_commit` with a summary
- Verify `commits.md` has new entry with hash, timestamp, three blocks
- Verify `log.md` is cleared
- Verify `state.yaml` `last_commit` populated

---

## 10. gcc_commit — Empty Log Edge Case

**What to verify:**

- Committing with an empty `log.md` does not crash
- Tool returns "No log entries since last commit" message
- Agent can still write commit blocks and finalize (or subagent handles gracefully)

**How:**

- Commit right after a previous commit (log is empty)
- Call `gcc_commit` — verify the "no log entries" message appears
- Verify no crash or partial state corruption

---

## 11. gcc_commit — Step 2 Failure (2-step flow only)

> **NOTE:** Skip if using subagent flow (failure handling differs).

**What to verify:**

- If agent response doesn't contain valid commit blocks, commit stays pending (not lost)
- No partial write to `commits.md`

**How:**

- Call `gcc_commit`, then manually respond without the three headings
- Verify `commits.md` unchanged, `log.md` not cleared

---

## 12. Second Commit — Rolling Summary

**What to verify:**

- Second commit's preparation includes the previous commit content for rolling summary context
- Agent produces an updated "Previous Progress Summary" that synthesizes both commits
- Latest commit in `commits.md` is self-contained

**How:**

- Have more conversation turns after first commit
- Call `gcc_commit` again
- Verify tool response includes "Previous Commit" section
- Verify `commits.md` now has two commit entries (separated by `---`)

---

## 13. gcc_merge — Merge Branch

**What to verify:**

- Writes merge commit to target branch's `commits.md`
- Merge entry has "Merge from <source>" heading and synthesis content
- Updates `state.yaml` `last_commit`
- Does NOT delete or modify source branch

**How:**

- Switch to main: `gcc_switch` to "main"
- Call `gcc_merge` with branch "explore-auth" and a synthesis paragraph
- Read `main/commits.md` — confirm merge commit entry
- Read `explore-auth/commits.md` — confirm unchanged

**Error cases:**

- Merge branch into itself — expect "Cannot merge" error
- Merge nonexistent branch — expect "not found" with available branches

---

## 14. gcc_context After Activity

**What to verify:**

- Shows all branches with their latest commit summaries
- Active branch marked with "(active)"
- Roadmap content shown if `main.md` was populated
- Deep retrieval instructions still present

**How:**

- Call `gcc_context` after commits and merges
- Verify branch list shows main and explore-auth with meaningful summaries

---

## 15. session_before_compact Hook

> **NOTE:** Hard to trigger manually. Validate when a session is long
> enough to trigger compaction, or verify via unit tests.

**What to verify:**

- When context compaction triggers, GCC state reminder is injected
- Reminder contains branch name, uncommitted turn count, and latest commit summary

**How:**

- This is hard to trigger manually — may need a long conversation or check that the hook is registered
- At minimum, verify the hook doesn't crash by having a long enough session

---

## 16. Idempotent Re-Init

**What to verify:**

- Running `gcc-init.sh` a second time doesn't overwrite `state.yaml`, `main.md`, `commits.md`, or branch files
- Root `AGENTS.md` doesn't get duplicate "## GCC" section
- `.gitignore` doesn't get duplicate pattern
- `.gcc/AGENTS.md` IS overwritten (it's a reference doc, always refreshed)

**How:**

- Run `gcc-init.sh` again after all the above activity
- Verify existing data preserved
- Verify no duplicates in root `AGENTS.md` and `.gitignore`

---

## 17. Subagent gcc_commit (when landed)

> **NOTE:** Run after `feat/gcc-committer-subagent` merges to `main`.

**What to verify:**

- `gcc_commit` tool call spawns subagent and returns result inline
- Subagent produces well-structured commit with all three blocks
- `commits.md` written correctly
- `log.md` cleared
- `state.yaml` `last_commit` updated
- No `agent_end` hook involvement (hook should be removed or no-op)
- Error handling when subagent fails or produces malformed output

**How:**

- Re-run tests 9, 10, 12 against the new implementation
- Verify `agent_end` handler is absent or inert for commit flow

---

## Summary Checklist

| #   | Area                                                                        | Pass? |
| --- | --------------------------------------------------------------------------- | ----- |
| 1   | Extension load + skill discovery                                            |       |
| 2   | Pre-init guard (all tools)                                                  |       |
| 3   | Init script (all artifacts)                                                 |       |
| 4   | Session start hook (notification + session tracking)                        |       |
| 5   | gcc_context (status + empty roadmap + populated roadmap)                    |       |
| 6   | OTA logging (turn_end → log.md entries)                                     |       |
| 7   | gcc_branch (create + state update + session sync + error)                   |       |
| 8   | gcc_switch (switch + state update + session sync + error)                   |       |
| 9   | gcc_commit (log prep + commit write + clear)                                |       |
| 10  | gcc_commit empty log edge case                                              |       |
| 11  | gcc_commit step 2 failure (2-step only: pending retained, no partial write) |       |
| 12  | Second commit (rolling summary with previous)                               |       |
| 13  | gcc_merge (write + state + source preserved + errors)                       |       |
| 14  | gcc_context after activity (branch summaries + active marker)               |       |
| 15  | session_before_compact (no crash, reminder injected)                        |       |
| 16  | Idempotent re-init                                                          |       |
| 17  | Subagent gcc_commit (when landed)                                           |       |

---

## Test Run History

### 2026-02-24 — main branch (2-step commit flow)

**Model:** `zai/glm-4.7:high` (with English-only append prompt)
**Extension source:** `main` @ `01c5fce`

| #   | Result             | Notes                                                                                                                                                                                       |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | PASS               | Skill discovered, no errors                                                                                                                                                                 |
| 2   | PASS               | All 5 tools return "not initialized"                                                                                                                                                        |
| 3   | PASS               | All artifacts correct                                                                                                                                                                       |
| 4   | PASS               | Notification shown, session tracked                                                                                                                                                         |
| 5   | PASS               | All sections present, empty roadmap guidance                                                                                                                                                |
| 6   | PASS               | Turn numbers, timestamps, model, actions, observations                                                                                                                                      |
| 7   | PASS               | Files, state, session sync, duplicate error                                                                                                                                                 |
| 8   | PASS               | State/session sync, "not found" with branch list                                                                                                                                            |
| 9   | PASS               | Log prep returned, agent wrote blocks, agent_end extracted, commits.md written, log cleared                                                                                                 |
| 10  | PASS (with caveat) | "No log entries" message returned correctly, no crash. However, agent echoed template headings back, causing `agent_end` to extract empty blocks as a valid commit. See quality note below. |
| 11  | SKIPPED            | Hard to force agent to omit blocks                                                                                                                                                          |
| 12  | PASS               | Previous commit hash referenced, summary synthesized                                                                                                                                        |
| 13  | PASS               | Merge commit written, source preserved, self-merge rejected                                                                                                                                 |
| 14  | PASS               | Roadmap, branch summaries, active marker correct                                                                                                                                            |
| 15  | SKIPPED            | Cannot trigger compaction in short session                                                                                                                                                  |
| 16  | PASS               | No duplicates, existing data preserved                                                                                                                                                      |
| 17  | —                  | Subagent flow not yet on main                                                                                                                                                               |

**Bugs found:** 0
**Quality findings:**

- glm-4.7 occasionally reasons in Chinese without English-only prompt instruction.
- Commit distillation quality is good — structured blocks, meaningful rolling summaries, correct hash references.
- **Empty log commit (test 10):** When committing with empty log, the tool returns the template headings (`### Branch Purpose` etc.) in its response. If the agent echoes those headings back verbatim, `agent_end` extracts them as valid (but empty) commit blocks, producing a hollow commit. This is a 2-step flow design weakness — the extraction can't distinguish template echo from intentional blocks. The subagent approach will eliminate this class of issue since extraction happens within the tool call boundary.
