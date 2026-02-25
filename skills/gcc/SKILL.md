---
name: gcc
description: Use when working on a project with GCC (Git Context Controller) memory management. Triggers on gcc_context, gcc_commit, gcc_branch, gcc_merge, gcc_switch tool usage, or when the project has a .gcc/ directory.
---

# GCC — Git Context Controller

## Initialization

When the `<skill>` tag loads this file, it includes a `location` attribute with the
absolute path to this SKILL.md. Use that to derive the init script path:

```bash
bash "/absolute/path/to/skills/gcc/scripts/gcc-init.sh"
```

Replace `/absolute/path/to/skills/gcc` with the skill directory shown in the
`<skill>` tag's `location` attribute (strip the `/SKILL.md` suffix).

### After Init

1. **Write `.gcc/main.md`** — the project roadmap (see below).
2. **Call `gcc_context`** to verify GCC is active.
3. **Make your first commit** when you reach a meaningful milestone.

### Writing main.md — Greenfield vs Brownfield

**New project (no existing code):** Write goals, intended architecture, and open
questions as you understand them from conversation with the user.

**Existing project:** Orient yourself first:

- Read `AGENTS.md`, `README.md`, `package.json` (or equivalent)
- Scan recent git history (`git log --oneline -20`)
- Read any specs or plans in `docs/`

Then write the roadmap covering: project purpose, current state, key decisions
already made, completed milestones, and planned work.

## When to Commit

- You've reached a stable understanding or decision
- You've completed an exploration and have a conclusion
- You're about to change direction significantly
- A meaningful amount of work has accumulated (use judgment, not a fixed interval)
- Before ending a session if significant progress was made

## How to Write Good Commits

- Focus on decisions and rationale, not implementation details
- Capture "why" more than "what" — the code captures "what"
- Be specific: "Chose PostgreSQL over MongoDB because ACID compliance is required
  for financial transactions" not "Chose database"

A subagent handles commit distillation — it reads your `log.md` and prior commits,
then produces the structured commit entry. You just provide a good `summary` string.

## When to Branch

- You want to explore an alternative approach without contaminating current thinking
- You're prototyping something uncertain
- You want to compare two design hypotheses

## When to Merge

- A branch has reached a conclusion (positive or negative)
- The branch's findings should inform the main line of thinking
- Include what was learned even if the approach was abandoned

**Important:** Always review the source branch history BEFORE calling `gcc_merge`.
Use:

- `gcc_context` for high-level status
- `read .gcc/branches/<target>/commits.md` for full branch history

You need the full context to write a good synthesis.

## When to Use Context Retrieval

- Starting a new session on an existing project — call `gcc_context` first
- Before making a decision that might conflict with earlier reasoning
- When you need to recall the rationale behind a previous decision

## Context Retrieval

Use `gcc_context` for high-level status only.

For deep retrieval, use `read` directly:

- `read .gcc/branches/<name>/commits.md` — full branch history
- `read .gcc/branches/<name>/log.md` — OTA trace since last commit
- `read .gcc/branches/<name>/metadata.yaml` — structured metadata
- `read .gcc/main.md` — project roadmap
- `read .gcc/AGENTS.md` — full protocol reference
