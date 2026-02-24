import type { BranchManager } from "./branches.js";
import { generateHash } from "./hash.js";
import type { GccState } from "./state.js";

interface GccCommitParams {
  summary: string;
  update_roadmap?: boolean;
}

/**
 * Step 1: Read log.md and return it to the agent for distillation.
 * The agent uses this content to write the three-block commit entry.
 */
export function executeGccCommit(
  params: GccCommitParams,
  state: GccState,
  branches: BranchManager
): string {
  const branch = state.activeBranch;
  const log = branches.readLog(branch);
  const turnCount = branches.getLogTurnCount(branch);

  if (!log.trim()) {
    return [
      `No log entries since last commit on branch "${branch}".`,
      "",
      "You can still commit if you have meaningful progress to record.",
      `Summary: ${params.summary}`,
      "",
      "Please provide the commit content with three blocks:",
      "### Branch Purpose",
      "### Previous Progress Summary",
      "### This Commit's Contribution",
    ].join("\n");
  }

  const latestCommit = branches.getLatestCommit(branch);
  const previousContext = latestCommit
    ? `\n\n## Previous Commit (for rolling summary):\n\n${latestCommit}`
    : "";

  return [
    `## Commit Preparation — Branch: ${branch}`,
    "",
    `Summary: ${params.summary}`,
    `OTA entries since last commit: ${turnCount} turns`,
    "",
    "## Log Contents (distill into commit):",
    "",
    log,
    previousContext,
    "",
    "Please provide the commit content with three blocks:",
    "### Branch Purpose",
    "### Previous Progress Summary",
    "### This Commit's Contribution",
  ].join("\n");
}

/**
 * Step 2: Write the agent's commit content to commits.md,
 * clear log.md, and update state.
 */
export function finalizeGccCommit(
  summary: string,
  commitContent: string,
  state: GccState,
  branches: BranchManager
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

  return `Commit ${hash} written to branch "${branch}".`;
}
