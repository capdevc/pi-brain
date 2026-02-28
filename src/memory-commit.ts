import type { BranchManager } from "./branches.js";
import { generateHash } from "./hash.js";
import { buildStatusView } from "./memory-context.js";
import type { MemoryState } from "./state.js";
import { buildCommitterTask } from "./subagent.js";

interface MemoryCommitParams {
  summary: string;
  update_roadmap?: boolean;
}

/**
 * Build the subagent task string for commit distillation.
 * The subagent reads log.md and commits.md itself.
 */
export function executeMemoryCommit(
  params: MemoryCommitParams,
  state: MemoryState,
  _branches: BranchManager
): { task: string } {
  const branch = state.activeBranch;

  return {
    task: buildCommitterTask(branch, params.summary),
  };
}

/**
 * Step 2: Write the agent's commit content to commits.md,
 * clear log.md, update state, and return result with status.
 */
export function finalizeMemoryCommit(
  summary: string,
  commitContent: string,
  state: MemoryState,
  branches: BranchManager,
  projectDir: string,
  updateRoadmap?: boolean
): string {
  const branch = state.activeBranch;
  const hash = generateHash();
  const timestamp = new Date().toISOString();

  const entry = [
    "",
    "---",
    "",
    `## Commit ${hash} | ${timestamp}`,
    "",
    commitContent,
    "",
  ].join("\n");

  branches.appendCommit(branch, entry);
  branches.clearLog(branch);

  state.setLastCommit(branch, hash, timestamp, summary);
  state.save();

  const resultText = `Commit ${hash} written to branch "${branch}".`;
  const status = buildStatusView(state, branches, projectDir, {
    compact: true,
  });

  const roadmapReminder =
    updateRoadmap === false
      ? ""
      : "\n\n**Action required:** Re-read `.memory/main.md` in full and rewrite stale sections. Current State should describe what is true right now — curate, don't just append.";

  return `${resultText}\n\n${status}${roadmapReminder}`;
}
