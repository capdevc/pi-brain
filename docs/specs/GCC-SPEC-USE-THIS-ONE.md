# GCC — Git Context Controller for Pi

## Design Specification

**Date:** 2026-02-22
**Status:** Draft
**Based on:** [Git Context Controller paper](https://arxiv.org/html/2508.00031v1) (Wu, 2025)

---

## 1. Overview

GCC is a structured context management system for the [pi coding agent](https://github.com/badlogic/pi-mono). It gives agents version-controlled memory — persistent, navigable, and organized — that survives across sessions, compactions, and model switches.

GCC treats agent memory like a git repository. Commits capture what the agent learned and decided. Branches isolate exploratory lines of thinking. Merges synthesize conclusions. The agent owns its memory: it decides when to commit, what to name branches, and how to summarize its understanding.

**What GCC manages is agent memory, not code.** A GCC commit captures "I decided X because Y" — not file diffs. The codebase already has git for that. GCC is version control for reasoning, decisions, and context.

### 1.1 Problems Solved

1. **Cross-session continuity** — Agent picks up where it left off without re-explanation.
2. **Long-horizon project scaffolding** — Structured milestones, branching explorations, and an evolving roadmap across many sessions.
3. **Multi-resolution context retrieval** — Navigate from high-level roadmap down to fine-grained reasoning traces. Compaction no longer means lost detail.
4. **Multi-agent handoff** — New agents, different models, or subagents inherit structured project memory with minimal overhead.

### 1.2 Design Principles

- **Agent-driven memory.** The agent decides when to commit, what to summarize, when to branch. No automatic enrichment or summarization of the agent's own memory entries.
- **Automatic logging.** The raw OTA (Observation-Thought-Action) trace between commits is maintained automatically by extension hooks — the agent never writes to log.md directly.
- **Full fidelity.** Agent reasoning and thinking blocks are logged without truncation or collapsing. Patterns in tool sequences are signal, not noise.
- **Portable artifacts.** The `.gcc/` directory contains plain-text files readable by any agent, any model, any human. No dependency on pi internals.
- **Separation of concerns.** The extension handles mechanics (file I/O, hook processing, retrieval). The skill teaches judgment (when to commit, how to write good memory, when to branch).

---

## 2. Architecture

GCC is a pi community package consisting of:

| Component   | Type                                     | Purpose                              |
| ----------- | ---------------------------------------- | ------------------------------------ |
| Extension   | TypeScript (`extensions/gcc.ts`)         | Tools, event hooks, file management  |
| Skill       | Markdown (`skills/gcc/SKILL.md`)         | Cognitive instructions for the agent |
| Init script | Shell (`skills/gcc/scripts/gcc-init.sh`) | One-time mechanical project setup    |

### 2.1 Extension

Registers tools the agent calls to manage its memory. Hooks into pi's session lifecycle to maintain the OTA log automatically. Spawns a lightweight subagent for commit distillation.

### 2.2 Skill

Loaded into the agent's context when relevant. Teaches the agent:

- What constitutes a meaningful commit (milestone in understanding, not just activity)
- When to branch (exploring an alternative line of thinking)
- When to merge (synthesizing conclusions from an exploration)
- How to write good memory entries (decisions and rationale, not implementation details)

### 2.3 Init Script (`skills/gcc/scripts/gcc-init.sh`)

A shell script in the skill's `scripts/` subdirectory that handles the mechanical setup: creating the `.gcc/` directory structure, writing template files (`AGENTS.md`, `state.yaml`, empty `log.md`), and appending the GCC section to root `AGENTS.md`. Run once per project by the agent.

The agent's role in initialization is the project-specific part: writing `main.md` with actual goals, milestones, and context based on conversation with the user. The skill instructs the agent to run the init script first, then author `main.md`.

---

## 3. File System

```
<project>/
├── AGENTS.md              # Existing file; GCC appends a section on init
└── .gcc/
    ├── AGENTS.md           # Full GCC protocol reference for agents
    ├── main.md             # Evolving project understanding and roadmap
    └── branches/
        └── <branch-name>/
            ├── commits.md      # Milestone memory snapshots (appended)
            ├── log.md          # OTA trace since last commit (auto-maintained)
            └── metadata.yaml   # Structured context the agent wants to remember
```

### 3.1 Root AGENTS.md Section

The extension appends a static section to the project's root `AGENTS.md` on initialization. This is auto-loaded every session, so the agent always knows GCC exists. Contains:

- One-line statement that this project uses GCC
- Instruction to read `.gcc/AGENTS.md` for full protocol reference
- List of available tools (`gcc_commit`, `gcc_branch`, `gcc_merge`, `gcc_switch`)

This section is **static** — written once at init, never updated. No state, no current branch, no milestone summaries. State lives in `.gcc/` files. This preserves prompt cache stability: the root AGENTS.md content never changes between turns.

### 3.2 `.gcc/AGENTS.md`

Full protocol reference and current project state. Documents the GCC tools, file structure, conventions, and current state (active branch, latest milestone). The agent reads this on demand when it needs to understand GCC or orient itself. Not auto-loaded — requires the agent to read the file.

### 3.3 `main.md` — Project Roadmap

The agent's evolving understanding of the project. Contains:

- Project goals and intent
- Key milestones (completed and planned)
- Current state and priorities
- Important decisions and their rationale

Shared across all branches. Updated by the agent after commits, merges, or when the roadmap shifts. This is the highest-resolution view — a new agent reading only `main.md` should understand the project's purpose, state, and direction.

**Starts empty on init** — like `git init` creates an empty repo. There is nothing on `main.md` until the agent writes to it. The agent authors content when it has something worth recording, not at initialization time.

### 3.4 `commits.md` — Branch Memory

Each branch maintains a `commits.md` file. Each time the agent calls `gcc_commit`, a new entry is appended with three blocks:

```markdown
---

## Commit <hash> | <timestamp>

### Branch Purpose

Why this branch exists. The question being explored or the goal being pursued.
Inherited from the BRANCH command and optionally refined.

### Previous Progress Summary

Rolling compression of all prior commits on this branch.
Re-synthesized each commit by combining the previous summary with the latest contribution.
The latest commit entry always contains a self-contained summary of the full branch history.

### This Commit's Contribution

What was just learned, decided, or understood.
Focuses on reasoning, decisions, and insights — not implementation details.
```

The rolling summary is critical: the agent re-synthesizes all prior progress into a fresh summary with each commit. Reading only the latest commit entry gives you the complete compressed history of the branch plus the latest contribution. Earlier commits are available for detail but not required for continuity.

### 3.5 `log.md` — OTA Trace

Fine-grained reasoning trace maintained **automatically** by the extension via the `turn_end` hook. The agent never writes to this file directly but may prune or edit it as part of memory management.

Each agent turn appends an entry:

```markdown
## Turn <n> | <timestamp> | <provider/model>

**Thought**: <agent's text output — full, no truncation>
**Thinking**: <extended thinking/chain-of-thought block — full, no truncation>
**Action**: <tool-name>(key-arg), <tool-name>(key-arg), ...
**Observation**: <tool-name>: <compact result summary — success/fail, key detail>
```

Design rules for log.md:

- **Full reasoning text.** No truncation of the agent's text or thinking blocks. These are the raw signal.
- **Full tool sequences.** No collapsing of repetitive tool chains. `bash→bash→bash` is a pattern, not noise.
- **Model-tagged.** Each entry records which model produced it. Different models reason differently; the committing agent should know the provenance of each thought.
- **Compact tool results.** Tool output is summarized (tool name, success/fail, key metrics like line count or exit code) — not the full output, which lives in the session JSONL.
- **Reset on commit.** When the agent calls `gcc_commit`, the subagent reads log.md to produce the commit entry, then the extension clears it for the next cycle. Log contents are discarded after distillation into the commit — the session JSONL files serve as the permanent record if raw traces are ever needed.

#### Log.md vs Pi Session JSONL

Log.md and session JSONL are related but serve different purposes:

| Aspect        | log.md                       | Session JSONL                 |
| ------------- | ---------------------------- | ----------------------------- |
| Scope         | Since last GCC commit        | Single pi session             |
| Persistence   | Survives session boundaries  | Per-session file              |
| Content       | Processed OTA entries        | Raw entries with full content |
| Maintained by | Extension hook (automatic)   | Pi core (automatic)           |
| Purpose       | Raw material for GCC commits | Pi's conversation history     |

Key: there is no 1:1 mapping between sessions and commits. Multiple sessions can occur between commits. Multiple commits can occur within a session. Some sessions may have no GCC-worthy activity. Log.md tracks OTA cycles since the last commit, regardless of session boundaries.

### 3.6 `metadata.yaml` — Structured Context

Agent-managed structured metadata. Default sections include:

- `file_structure`: Project file layout and per-file responsibilities
- `env_config`: Environment, dependencies, build configuration
- Additional sections added by the agent as needed

Updated on demand — typically during or after a commit when the agent detects structural changes.

---

## 4. Tools

All tools are agent-driven. The agent provides all summaries, names, and content. The extension handles file I/O and state management.

### 4.1 `gcc_commit`

**Purpose:** Checkpoint a milestone in the agent's understanding.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `summary` | string | yes | What was learned/decided in this commit |
| `update_roadmap` | boolean | no | Whether to also update main.md (agent prompted if true) |

**Behavior:**

1. Extension spawns a lightweight subagent (cheap model) with:
   - The current branch's `log.md` (all OTA entries since last commit)
   - The latest commit entry from `commits.md` (rolling summary + branch purpose)
   - The agent's `summary` parameter
2. Subagent distills the log into the three-block commit entry (branch purpose, rolling progress summary, this contribution)
3. Extension appends the entry to `commits.md` with sequential number and short hash (e.g., `#3 (a1b2c3d)`) and timestamp
4. Extension clears `log.md` for the next cycle
5. If `update_roadmap` is true, agent updates `main.md` directly

**Subagent rationale:** The main agent may be deep into its context window with limited space remaining. The subagent operates in a fresh context, reads the log.md and previous commit from disk, and produces the distillation without consuming the main agent's context budget. The log.md _is_ the context — it contains the agent's full reasoning, thinking blocks, and tool sequences. The subagent doesn't need the main agent's context window to produce a good commit.

**Commit format:**

```markdown
---
## Commit #3 (a1b2c3d) | 2026-02-22T15:30:00Z

### Branch Purpose
...

### Previous Progress Summary

...

### This Commit's Contribution

...
```

### 4.2 `gcc_branch`

**Purpose:** Create a new memory branch to explore an alternative line of thinking.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | yes | Branch name (descriptive, kebab-case) |
| `purpose` | string | yes | Why this branch exists — the question or hypothesis |

**Behavior:**

1. Create `.gcc/branches/<name>/` directory
2. Initialize empty `log.md`
3. Initialize `commits.md` with the branch purpose
4. Initialize empty `metadata.yaml`
5. Set `<name>` as the current active branch (tracked in `.gcc/state.yaml`)
6. Begin appending OTA entries to this branch's `log.md`

**Notes:**

- GCC branches are independent from pi session branches (`/fork`, `/tree`). A pi session fork may signal a different line of thinking, but GCC branches are explicitly created by the agent for memory isolation.
- The agent can switch between GCC branches without switching pi sessions.
- A default branch (e.g., `main`) is created on initialization.

### 4.3 `gcc_merge`

**Purpose:** Synthesize conclusions from a branch back into the current branch.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `branch` | string | yes | Name of the branch to merge into the current branch |
| `synthesis` | string | yes | Agent's summary of what was learned and how it integrates |

**Behavior:**

1. Automatically read the target branch's latest commit from `commits.md` to surface its history
2. Agent provides synthesis (what was learned, what's being kept/discarded)
3. Extension appends a merge commit to the current branch's `commits.md`
4. Agent updates `main.md` with the branch outcome and its impact on the roadmap
5. Merged branch directory is retained (not deleted) for reference

### 4.4 `gcc_context`

**Purpose:** Quick orientation — assembles state from multiple `.gcc/` files into a single overview.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| (none) | | | Returns project status overview |

**Behavior:**

Returns a status overview assembled from multiple files:

- `main.md` content (roadmap, goals, current state)
- List of all branches with their purpose and latest commit summary
- Current active branch from `state.yaml`
- Uncommitted turns count (lines in current log.md)

**For all other retrieval, the agent uses pi's built-in `read` tool directly:**

- `read .gcc/branches/<name>/commits.md` — branch commit history
- `read .gcc/branches/<name>/log.md` — OTA trace since last commit
- `read .gcc/branches/<name>/metadata.yaml` — structured context
- `read .gcc/main.md` — project roadmap
- `read .gcc/AGENTS.md` — full protocol reference

This keeps the tool surface minimal. The agent navigates its own memory with the same tools it uses for everything else. `.gcc/AGENTS.md` documents which files to read and what they contain.

### 4.5 `gcc_switch`

**Purpose:** Switch the active GCC branch.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `branch` | string | yes | Branch name to switch to |

**Behavior:**

1. Validate the branch exists
2. Update active branch in `.gcc/state.yaml`
3. Begin appending OTA entries to the new branch's `log.md`
4. Return the new branch's latest commit summary for orientation

---

## 5. State File

`.gcc/state.yaml` tracks runtime state:

```yaml
active_branch: main
initialized: "2026-02-22T14:00:00Z"
last_commit:
  branch: main
  hash: a1b2c3d4
  timestamp: "2026-02-22T15:30:00Z"
  summary: "Decided on event sourcing for state sync"
sessions:
  - file: "~/.pi/agent/sessions/--project--/2026-02-22T14-00-00.jsonl"
    branch: main
    started: "2026-02-22T14:00:00Z"
```

The `sessions` list provides a lightweight reference linking pi sessions to GCC branches. This is informational — the extension records which session was active during which branch period, enabling drill-down to raw session data if needed.

---

## 6. Event Hooks

The extension hooks into pi's session lifecycle for two purposes: automatic OTA logging and session tracking.

### 6.1 `turn_end` — OTA Logging

After each agent turn, the extension:

1. Extracts the assistant's text content (full, no truncation)
2. Extracts thinking blocks (full, no truncation)
3. Extracts tool calls (name + key arguments)
4. Extracts tool results (name, success/fail, compact summary from `details`)
5. Tags the entry with provider/model
6. Appends the formatted OTA entry to the active branch's `log.md`

Processing rules:

- **No truncation** of agent text or thinking
- **No collapsing** of repetitive tool sequences
- **Compact tool results** — use structured `details` field (file path, line count, exit code), not full output content
- **Skip turns with no meaningful content** — e.g., aborted turns, error-only turns with no reasoning

### 6.2 `session_start` — Session Registration

When a new pi session starts:

1. Check for `.gcc/` directory
2. If present, register this session in `state.yaml`

No context injection. The agent learns about GCC from the static root AGENTS.md section (auto-loaded by pi). If it needs orientation, it calls `gcc_context` or reads `.gcc/` files directly. This preserves prompt cache stability — no dynamic content injected before the conversation.

### 6.3 `session_before_compact` — Compaction Awareness

Before pi compacts the session:

1. Check if there are uncommitted OTA entries
2. The log.md already captures the reasoning externally, so compaction doesn't lose GCC-relevant detail
3. Optionally inject a note into the compaction summary mentioning GCC state ("GCC: 8 uncommitted turns on branch 'main', see .gcc/branches/main/log.md")

---

## 7. Skill

The GCC skill (`skills/gcc/SKILL.md`) teaches the agent when and how to use GCC tools effectively. It is loaded into context when the agent's task matches its description.

### 7.1 Skill Description (for auto-discovery)

```
Use when working on a project with GCC (Git Context Controller) memory management.
Guides the agent on when to commit memory milestones, when to branch for exploratory
thinking, how to write effective memory entries, and how to use multi-resolution
context retrieval.
```

### 7.2 Skill Content Outline

**When to commit:**

- You've reached a stable understanding or decision
- You've completed an exploration and have a conclusion
- You're about to change direction significantly
- A meaningful amount of work has accumulated (use judgment, not a fixed interval)
- Before ending a session if significant progress was made

**How to write good commits:**

- Focus on decisions and rationale, not implementation details
- Capture "why" more than "what" — the code captures "what"
- The rolling progress summary should be self-contained — a new agent reading only the latest commit should understand the full branch history
- Be specific: "Chose PostgreSQL over MongoDB because ACID compliance is required for financial transactions" not "Chose database"

**When to branch:**

- You want to explore an alternative approach without contaminating current thinking
- You're prototyping something uncertain
- You want to compare two design hypotheses

**When to merge:**

- A branch has reached a conclusion (positive or negative)
- The branch's findings should inform the main line of thinking
- Include what was learned even if the approach was abandoned

**When to use context retrieval:**

- Starting a new session on an existing project — call `gcc_context` first
- Before making a decision that might conflict with earlier reasoning
- When you need to recall the rationale behind a previous decision

---

## 8. Initialization Flow

Initialization is split between a script (mechanical) and the agent (project-specific).

### 8.1 Init Script (`gcc-init.sh`)

Located at `skills/gcc/scripts/gcc-init.sh`. The agent runs this via bash. The script:

1. Creates `.gcc/` directory structure:
   - `.gcc/branches/main/` directory
   - `.gcc/branches/main/log.md` — empty
   - `.gcc/branches/main/commits.md` — header only
   - `.gcc/branches/main/metadata.yaml` — empty template
   - `.gcc/main.md` — empty (no content until first commit)
   - `.gcc/state.yaml` — initialized with `active_branch: main`

2. Writes `.gcc/AGENTS.md` from a bundled template (full GCC protocol reference)

3. Appends GCC section to root `AGENTS.md` (creates if doesn't exist):

   ```markdown
   ## GCC — Git Context Controller

   This project uses GCC for agent memory management.
   Read `.gcc/AGENTS.md` for full protocol reference.
   Tools: gcc_commit, gcc_branch, gcc_merge, gcc_switch, gcc_context
   ```

4. Adds `.gcc/branches/*/log.md` to `.gitignore` (transient logs not tracked)

5. Is idempotent — safe to run again without clobbering existing content

### 8.2 Agent Begins Working

After the script runs, `.gcc/` exists with an empty `main.md` and an empty `main` branch — like `git init` creates an empty repo. The agent begins working normally. The skill guides it to commit when milestones are reached and to update `main.md` when the project roadmap takes shape.

### 8.3 `.gitignore` Considerations

Default: track `.gcc/` in git (enables cross-agent collaboration) **except** `log.md` files which are transient working state. The init script adds `.gcc/branches/*/log.md` to `.gitignore` automatically.

Tracked: `main.md`, `commits.md`, `metadata.yaml`, `state.yaml`, `AGENTS.md`
Ignored: `log.md` (transient OTA trace, cleared on commit)

---

## 9. Data Flow

```
User prompt
    │
    ▼
Agent reasons, calls tools
    │
    ├──► turn_end hook ──► append OTA entry to .gcc/branches/<active>/log.md
    │                       (automatic, full fidelity, model-tagged)
    │
    ▼
Agent decides to commit
    │
    ▼
gcc_commit(summary)
    │
    ├──► Extension spawns subagent with log.md + latest commit + summary
    ├──► Subagent distills three-block commit entry
    ├──► Extension appends to commits.md with #N (hash)
    ├──► Extension clears log.md
    └──► Agent optionally updates main.md

Agent decides to explore
    │
    ▼
gcc_branch(name, purpose)
    │
    ├──► Extension creates branch directory
    ├──► OTA logging switches to new branch
    └──► Agent works on branch, commits as needed

Agent concludes exploration
    │
    ▼
gcc_merge(branch, synthesis)
    │
    ├──► Extension reads target branch's latest commit
    ├──► Agent provides synthesis
    ├──► Extension writes merge commit
    └──► Agent updates main.md

New session starts
    │
    ▼
session_start hook
    │
    ├──► Register session in state.yaml
    └──► Agent reads .gcc/ files as needed (via root AGENTS.md awareness)
```

---

## 10. Edge Cases

### 10.1 Log.md Exceeds Context Window

Based on session analysis (98 sessions, 6110 turns), log.md with full reasoning + thinking averages ~510 chars/turn. Even at 50 turns between commits, log.md would be ~25k chars (~6k tokens) — well within any modern context window.

For extreme cases (200+ turns without a commit):

- The `gcc_commit` tool should warn the agent if log.md exceeds a threshold (e.g., 100k chars)
- The agent can choose to commit more frequently, summarize selectively, or prune log.md directly
- The skill teaches that committing regularly is good practice
- The subagent-based commit architecture handles this gracefully — the subagent reads the log in a fresh context window, so the main agent's context budget is unaffected

### 10.2 Multiple Sessions Between Commits

Log.md persists on disk. When a new session starts, the extension continues appending. The agent can check log.md size via `gcc_context` or by reading the file directly.

### 10.3 Session Compaction

Pi's compaction summarizes old messages and discards detail. GCC's log.md is external to the session — compaction doesn't affect it. The `session_before_compact` hook optionally notes GCC state in the compaction summary.

### 10.4 Model Switches Mid-Session

Each OTA entry in log.md is tagged with provider/model. When the agent reads log.md at commit time, it can see which model produced which reasoning. No special handling needed — model diversity is captured naturally.

### 10.5 Concurrent Agents (Subagents)

If subagents are active, they operate in their own sessions. The main agent's GCC state is unaffected. Subagent output reaches the main agent through tool results, which are captured in log.md's Observation field.

Future extension: subagents could have their own GCC branches, merged back by the orchestrator. Not in scope for v1.

### 10.6 Abandoned Branches

Branches are never auto-deleted. An abandoned branch's commits and log remain for reference. The agent can note abandonment reasons in a final commit before switching away.

---

## 11. Empirical Basis

Design decisions informed by analysis of 98 pi sessions (6110 agent turns, 679 user messages, $264.71 total cost):

| Metric                                | Value                  | Implication                                                  |
| ------------------------------------- | ---------------------- | ------------------------------------------------------------ |
| Median agent text per turn            | 117 chars              | Full reasoning fits easily in log.md                         |
| Median thinking per turn              | 44 chars               | Including thinking adds minimal overhead                     |
| Thinking as % of combined output      | 45%                    | Significant reasoning signal; must include                   |
| Median agentic depth                  | 4 turns/prompt         | Moderate OTA volume between user interactions                |
| P90 agentic depth                     | 24 turns/prompt        | Deep chains exist but log stays manageable                   |
| Sessions with model switching         | 7%                     | Tag entries with model; per-model branches unnecessary       |
| Log.md est. (20 turns, with thinking) | ~10k chars (~2.5k tok) | Well within context limits                                   |
| Log.md est. (50 turns, with thinking) | ~25k chars (~6k tok)   | Still comfortable                                            |
| Cache efficiency                      | 95% median             | GCC's static AGENTS.md design preserves this high cache rate |
| Median session duration               | 13 min                 | Sessions are short; cross-session memory matters             |
| Mean session duration                 | 97 min                 | Some sessions are long; within-session commits matter too    |

---

## 12. Package Structure

```
pi-gcc/
├── package.json
├── extensions/
│   └── gcc.ts              # Main extension: tools + hooks
├── skills/
│   └── gcc/
│       ├── SKILL.md        # Cognitive instructions
│       ├── scripts/
│       │   └── gcc-init.sh # One-time project initialization script
│       └── templates/
│           ├── agents-md.md            # Template for .gcc/AGENTS.md content
│           └── root-agents-section.md  # Template for root AGENTS.md section
├── tests/
│   └── gcc.test.ts
└── README.md
```

Installable via:

```bash
pi install npm:pi-gcc
# or
pi install git:github.com/<user>/pi-gcc
```

---

## 13. Out of Scope (v1)

- Semantic search over GCC memory (future: integrate with zvec + self-hosted embedding model for vector search over commits and logs)
- Subagent GCC branches (subagents contribute through tool results)
- Automatic commit suggestions (agent decides; skill guides judgment)
- GCC diff/blame (version history is in commits.md, not per-line tracking)
- Remote GCC sync beyond git push/pull of `.gcc/` directory
- GUI/TUI visualization of GCC branch history

---

## 14. Resolved Design Decisions

| Decision                  | Resolution                                                         | Rationale                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Commit identifier format  | `#N (a1b2c3d)` — sequential + short hash                           | Sequential for human reference ("show me commit #3"), hash for dedup/verification                                                                       |
| Log.md archival on commit | Discard                                                            | Session JSONL is the permanent record. Archive grows unboundedly and nobody reads it                                                                    |
| gcc_commit flow           | Subagent distillation                                              | Main agent may be near context limit. Subagent reads log.md + last commit in fresh context. Main agent decides _when_ to commit; subagent handles _how_ |
| Root AGENTS.md content    | Static instructions only, no state                                 | Preserves prompt cache. State lives in `.gcc/` files                                                                                                    |
| `.gcc/` in `.gitignore`   | Track everything except `log.md`                                   | Persistent memory shared via git; transient log is working state                                                                                        |
| Memory mutability         | Agent can prune, edit, rewrite any `.gcc/` file                    | Memory is not append-only. Forgetting is valuable. The agent manages its own memory                                                                     |
| Context retrieval         | `gcc_context` for status overview only; `read` for everything else | Minimal tool surface. Agent navigates its own memory with standard tools                                                                                |

---

## 15. Prompt Cache Considerations

GCC is designed to avoid breaking prompt caching. Key constraints from the Claude Code team and inference research:

1. **Prefix stability** — Prompt caching matches from the start of the request. Any change in the prefix invalidates everything after it.
2. **Static content first, dynamic last** — System prompt, tools, and AGENTS.md must be stable across turns.
3. **Append-only conversation** — Don't modify or reorder earlier messages.
4. **Tool definitions are prefix** — Adding or removing tools mid-conversation breaks the cache.

**How GCC complies:**

- **Root AGENTS.md is static** — Written once at init, never updated. No dynamic state (branch names, milestone summaries, commit counts). This means the AGENTS.md content in the system prompt prefix is identical across all turns and sessions.
- **No per-turn context injection** — No `before_agent_start` hook injecting changing content. The agent learns about GCC from the static AGENTS.md and retrieves state on demand via tool calls (which appear as conversation messages, appended at the end).
- **Tool definitions are fixed** — The GCC tools (`gcc_commit`, `gcc_branch`, `gcc_merge`, `gcc_switch`, `gcc_context`) are registered at extension load and never change mid-conversation.
- **State retrieval is append-only** — When the agent calls `gcc_context` or `read .gcc/main.md`, the results appear as new messages appended to the conversation. They don't modify the prefix.
- **Subagent commits don't touch the main context** — The commit subagent operates in its own API call with its own cache. The main agent's cache is unaffected.

**What would break the cache (and we avoid):**

- ~~Injecting dynamic GCC state into system prompt~~ → Static AGENTS.md only
- ~~Updating root AGENTS.md after every commit~~ → Root AGENTS.md never changes
- ~~Adding/removing GCC tools based on state~~ → All tools always registered
- ~~Modifying earlier conversation messages with GCC metadata~~ → Append-only
