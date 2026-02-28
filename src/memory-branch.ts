import type { BranchManager } from "./branches.js";
import { generateHash } from "./hash.js";
import type { MemoryState } from "./state.js";

interface MemoryBranchParams {
  action: string;
  name?: string;
  purpose?: string;
  branch?: string;
  synthesis?: string;
}

function executeCreate(
  params: MemoryBranchParams,
  state: MemoryState,
  branches: BranchManager
): string {
  const { name, purpose } = params;

  if (!name || !purpose) {
    return '"name" and "purpose" are required for the create action.';
  }

  if (branches.branchExists(name)) {
    return `Branch "${name}" already exists. Use action "switch" to switch to it.`;
  }

  branches.createBranch(name, purpose);
  state.setActiveBranch(name);
  state.save();

  return `Created branch "${name}" and switched to it.\nPurpose: ${purpose}`;
}

function executeSwitch(
  params: MemoryBranchParams,
  state: MemoryState,
  branches: BranchManager
): string {
  const { branch } = params;

  if (!branch) {
    return '"branch" is required for the switch action.';
  }

  if (!branches.branchExists(branch)) {
    return `Branch "${branch}" not found. Available branches: ${branches.listBranches().join(", ")}`;
  }

  state.setActiveBranch(branch);
  state.save();

  const latest = branches.getLatestCommit(branch);
  const summary = latest ?? "No commits yet.";

  return `Switched to branch "${branch}".\n\n${summary}`;
}

function executeMerge(
  params: MemoryBranchParams,
  state: MemoryState,
  branches: BranchManager
): string {
  const { branch: sourceBranch, synthesis } = params;

  if (!sourceBranch || !synthesis) {
    return '"branch" and "synthesis" are required for the merge action.';
  }

  const targetBranch = state.activeBranch;

  if (sourceBranch === targetBranch) {
    return `Cannot merge branch "${sourceBranch}" into itself.`;
  }

  if (!branches.branchExists(sourceBranch)) {
    return `Branch "${sourceBranch}" not found. Available branches: ${branches.listBranches().join(", ")}`;
  }

  const hash = generateHash();
  const timestamp = new Date().toISOString();
  const summary = `Merge from ${sourceBranch}`;

  const entry = [
    "",
    "---",
    "",
    `## Commit ${hash} | ${timestamp}`,
    "",
    `### Merge from ${sourceBranch}`,
    "",
    synthesis,
    "",
  ].join("\n");

  branches.appendCommit(targetBranch, entry);

  state.setLastCommit(targetBranch, hash, timestamp, summary);
  state.save();

  return `Merge commit ${hash} written to branch "${targetBranch}" (merged from "${sourceBranch}").`;
}

/**
 * Execute the unified memory_branch tool.
 * Actions: create, switch, merge.
 */
export function executeMemoryBranch(
  params: MemoryBranchParams,
  state: MemoryState,
  branches: BranchManager
): string {
  switch (params.action) {
    case "create": {
      return executeCreate(params, state, branches);
    }
    case "switch": {
      return executeSwitch(params, state, branches);
    }
    case "merge": {
      return executeMerge(params, state, branches);
    }
    default: {
      return `Unknown action "${params.action}". Valid actions: create, switch, merge.`;
    }
  }
}
