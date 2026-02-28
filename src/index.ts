import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  SessionBeforeCompactEvent,
} from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

import { BranchManager } from "./branches.js";
import { LOG_SIZE_WARNING_BYTES } from "./constants.js";
import { executeMemoryBranch } from "./memory-branch.js";
import { executeMemoryCommit, finalizeMemoryCommit } from "./memory-commit.js";
import { buildStatusView } from "./memory-context.js";
import { formatOtaEntry } from "./ota-formatter.js";
import { extractOtaInput } from "./ota-logger.js";
import { MemoryState } from "./state.js";
import { extractCommitBlocks, spawnCommitter } from "./subagent.js";

const MEMORY_NOT_INITIALIZED_MESSAGE =
  "Brain not initialized. Run brain-init.sh first.";

function createTextResult(text: string): AgentToolResult<unknown> {
  return {
    content: [{ type: "text", text }],
    details: {},
  };
}

function isMemoryReady(
  state: MemoryState | null,
  branchManager: BranchManager | null
): state is MemoryState {
  return state !== null && branchManager !== null && state.isInitialized;
}

function upsertCurrentSession(state: MemoryState, ctx: ExtensionContext): void {
  const sessionFile = ctx.sessionManager.getSessionFile();
  if (!sessionFile) {
    return;
  }

  state.upsertSession(
    sessionFile,
    state.activeBranch,
    new Date().toISOString()
  );
  state.save();
}

function buildCompactionReminder(
  state: MemoryState,
  branchManager: BranchManager
): string {
  const branch = state.activeBranch;
  const turns = branchManager.getLogTurnCount(branch);
  const summary = state.lastCommit?.summary ?? "No commits yet";

  return [
    `Brain memory active on branch "${branch}".`,
    `${turns} uncommitted turn${turns === 1 ? "" : "s"} in .memory/branches/${branch}/log.md.`,
    `Latest commit summary: ${summary}.`,
  ].join(" ");
}

function appendCompactionReminder(
  event: SessionBeforeCompactEvent,
  reminder: string
): void {
  event.customInstructions = event.customInstructions
    ? `${event.customInstructions}\n\n${reminder}`
    : reminder;
}

function resolveSkillPath(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  return path.resolve(currentDir, "../skills/brain");
}

export default function activate(pi: ExtensionAPI) {
  let state: MemoryState | null = null;
  let branchManager: BranchManager | null = null;
  let statusInjected = false;

  function tryLoad(ctx: ExtensionContext): boolean {
    if (isMemoryReady(state, branchManager)) {
      return true;
    }

    const candidate = new MemoryState(ctx.cwd);
    candidate.load();

    if (!candidate.isInitialized) {
      return false;
    }

    state = candidate;
    branchManager = new BranchManager(ctx.cwd);
    upsertCurrentSession(state, ctx);
    return true;
  }

  pi.registerTool({
    name: "memory_branch",
    label: "Memory Branch",
    description:
      "Manage memory branches. Actions: create (new branch), switch (change active branch), merge (synthesize branch into current).",
    parameters: Type.Object({
      action: Type.String({
        description: 'Action to perform: "create", "switch", or "merge"',
      }),
      name: Type.Optional(
        Type.String({ description: "Branch name (required for create)" })
      ),
      purpose: Type.Optional(
        Type.String({
          description: "Why this branch exists (required for create)",
        })
      ),
      branch: Type.Optional(
        Type.String({
          description: "Target branch (required for switch and merge)",
        })
      ),
      synthesis: Type.Optional(
        Type.String({ description: "Synthesized insight (required for merge)" })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      if (
        !tryLoad(ctx) ||
        !isMemoryReady(state, branchManager) ||
        !branchManager
      ) {
        return createTextResult(MEMORY_NOT_INITIALIZED_MESSAGE);
      }

      const previousBranch = state.activeBranch;
      const result = executeMemoryBranch(params, state, branchManager, ctx.cwd);

      if (state.activeBranch !== previousBranch) {
        upsertCurrentSession(state, ctx);
      }

      return createTextResult(result);
    },
  });

  pi.registerTool({
    name: "memory_commit",
    label: "Memory Commit",
    description: "Checkpoint a milestone in agent memory.",
    parameters: Type.Object({
      summary: Type.String({ description: "Short summary of this checkpoint" }),
      update_roadmap: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      if (
        !tryLoad(ctx) ||
        !isMemoryReady(state, branchManager) ||
        !branchManager
      ) {
        return createTextResult(MEMORY_NOT_INITIALIZED_MESSAGE);
      }

      const { task } = executeMemoryCommit(params, state, branchManager);

      const result = await spawnCommitter(ctx.cwd, task, signal);

      if (result.exitCode !== 0 || result.error) {
        return createTextResult(
          `Commit failed: ${result.error ?? "subagent exited with non-zero code"}`
        );
      }

      const commitContent = extractCommitBlocks(result.text);
      if (!commitContent) {
        return createTextResult(
          "Commit failed: could not extract commit blocks from subagent response."
        );
      }

      const message = finalizeMemoryCommit(
        params.summary,
        commitContent,
        state,
        branchManager,
        ctx.cwd
      );

      return createTextResult(message);
    },
  });

  pi.on("session_start", (_event, ctx) => {
    state = new MemoryState(ctx.cwd);
    state.load();
    branchManager = new BranchManager(ctx.cwd);
    statusInjected = false;

    if (!state.isInitialized) {
      return;
    }

    upsertCurrentSession(state, ctx);

    const turnCount = branchManager.getLogTurnCount(state.activeBranch);
    const logSizeBytes = branchManager.getLogSizeBytes(state.activeBranch);

    if (logSizeBytes >= LOG_SIZE_WARNING_BYTES) {
      const sizeKB = Math.round(logSizeBytes / 1024);
      ctx.ui.notify(
        `Brain: log.md is large (${sizeKB} KB). You should commit to distill this into structured memory.`,
        "warning"
      );
    }

    const branch = state.activeBranch;
    const turnLabel = `${turnCount} uncommitted turn${turnCount === 1 ? "" : "s"}`;
    ctx.ui.setStatus("brain", `Brain: ${branch} (${turnLabel})`);
  });

  pi.on("before_agent_start", (_event, ctx) => {
    if (statusInjected) {
      return;
    }

    if (
      !tryLoad(ctx) ||
      !isMemoryReady(state, branchManager) ||
      !branchManager
    ) {
      return;
    }

    statusInjected = true;

    const status = buildStatusView(state, branchManager, ctx.cwd);
    return {
      message: {
        customType: "brain-status",
        content: status,
        display: "tool" as const,
        details: {},
      },
    };
  });

  pi.on("session_compact", () => {
    statusInjected = false;
  });

  pi.on("resources_discover", () => ({
    skillPaths: [resolveSkillPath()],
  }));

  pi.on("turn_end", (event) => {
    if (!isMemoryReady(state, branchManager) || !branchManager) {
      return;
    }

    const input = extractOtaInput(event);
    if (!input) {
      return;
    }

    const entry = formatOtaEntry(input);
    branchManager.appendLog(state.activeBranch, entry);
  });

  pi.on("session_before_compact", (event) => {
    if (!isMemoryReady(state, branchManager) || !branchManager) {
      return;
    }

    const reminder = buildCompactionReminder(state, branchManager);
    appendCompactionReminder(event, reminder);
  });
}
