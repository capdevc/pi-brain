# Phase 3 — Second-Order Connections

## Implicit Coupling & Shared State

- **Log Size Threshold**: `LOG_SIZE_WARNING_BYTES` (600 KB) is a shared constant used both by the `session_start` hook (via `index.ts`) and the `memory_status` tool (via `memory-context.ts`) to nudge agents toward committing.
- **Active Session Tracking**: The `MemoryState` object tracks active sessions in `state.yaml`. This is updated in the `session_start` hook and whenever the active branch changes (`memory_branch`, `memory_switch`). This creates a tight link between the extension's lifecycle and the persistent state file.

## Convention-Based Wiring

- **Agent Definition Resolution**: The `spawnCommitter` function in `src/subagent.ts` uses a specific resolution order for `memory-committer.md`, checking `agents/`, `.pi/agents/`, and local relative paths. This allows the extension to work in both development and installed environments without explicit configuration.
- **Initialization Protocol**: The `brain-init.sh` script (located in `skills/brain/scripts/`) is the source of truth for the `.memory/` directory structure. It also injects a "Brain" section into the project's root `AGENTS.md`, creating an explicit link between the project's documentation and the extension's existence.

## Side Effects & Lifecycle Hooks

- **Context Injection**: The `session_before_compact` hook in `src/index.ts` actively mutates the `event.customInstructions` to include a Brain-specific reminder. This ensures that even after a context compaction, the agent is reminded of its active branch and uncommitted turns.
- **Automatic Logging**: The `turn_end` hook in `src/index.ts` automatically captures turn data and appends it to the active branch's `log.md`. This happens silently in the background, ensuring no turn is lost.

## Hidden Dependencies

- **Minimal YAML**: The project uses a custom `src/yaml.ts` instead of a standard library like `js-yaml`. This is a deliberate design choice to minimize dependencies and control the specific YAML subset used for `state.yaml` and `metadata.yaml`.
- **Subagent Execution**: `memory_commit` relies on the presence of the `pi` CLI in the system path to spawn the distillation subagent. It assumes `pi` supports `--mode json` and the specified model/tools.
