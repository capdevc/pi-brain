# pi-brain Orientation Report

## Project

`pi-brain` is a persistent, versioned memory extension for the `pi` coding agent, enabling structured history tracking through branches and distilled commits.

## Structural Map

- `.memory/` — Core data storage.
  - `state.yaml` — Global state, tracking active branch and session history.
  - `main.md` — Project roadmap and high-level goal tracker.
  - `branches/` — Individual branch storage.
    - `<name>/log.md` — Raw "Over-the-Air" (OTA) turn data.
    - `<name>/commits.md` — Structured milestones distilled from logs.
- `src/` — Core TypeScript implementation (flat structure).
  - `index.ts` — Main entry point; registers tools and lifecycle hooks.
  - `memory-*.ts` — Tool implementations (`status`, `branch`, `switch`, `commit`, `merge`).
  - `ota-*.ts` — Logic for capturing and formatting turn-end events.
  - `state.ts` / `branches.ts` — Data management for state and branch files.
  - `subagent.ts` — Spawner for the commit distillation subagent.
- `skills/brain/` — Guidance for agents using Brain and initialization scripts.
- `agents/` — Definitions for specialized subagents (e.g., `memory-committer`).

## Semantic Summary

- **Architecture**: The extension integrates with the `pi` SDK, automatically capturing turn data via the `turn_end` hook. It maintains a "Brain" metaphor where agents checkpoint rationale rather than just code changes.
- **Distillation Process**: The `memory_commit` tool delegates log summarization to a dedicated subagent. This process extracts decisions and rationale from raw traces, appending them to `commits.md` while clearing the active log.
- **Agent Workflow**: Agents orient themselves using `memory_status`, manage task isolation with `memory_branch` and `memory_switch`, and preserve context using `memory_commit`.
- **Tech Stack**: Built with Node.js (ESM) and TypeScript, using `@mariozechner/pi-coding-agent` for extension capabilities and `vitest` for its comprehensive test suite.

## Hidden Connections

- **Log Size Threshold**: A shared constant, `LOG_SIZE_WARNING_BYTES` (600 KB), triggers warnings in both the `session_start` hook and `memory_status` output, nudging agents to distill large logs.
- **Context Preservation**: The `session_before_compact` hook mutates `customInstructions` to inject Brain-specific reminders, ensuring the agent retains its active branch context after compaction.
- **Convention-Based Discovery**: The subagent spawner uses a specific resolution order for `memory-committer.md`, enabling seamless operation in both local development and installed environments.

## Working State

- **Current Branch**: `main`
- **Uncommitted Changes**: `.pi/tmp/` (exploration artifacts)
- **Last 5 Commits**:
  - `5746033` docs: update plan — robust statusInjected flag with lifecycle resets
  - `c58f489` docs: update plan — keep skill global, remove init script task
  - `960b146` docs: add tool consolidation implementation plan
  - `47f0de1` fix: use setStatus for persistent Brain footer status
  - `23d07c0` chore(release): v0.1.3
