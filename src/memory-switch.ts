import type { BranchManager } from "./branches.js";
import type { GccState } from "./state.js";

interface GccSwitchParams {
  branch: string;
}

/**
 * Execute the gcc_switch tool — switch the active GCC branch.
 */
export function executeGccSwitch(
  params: GccSwitchParams,
  state: GccState,
  branches: BranchManager
): string {
  const { branch } = params;

  if (!branches.branchExists(branch)) {
    return `Branch "${branch}" not found. Available branches: ${branches.listBranches().join(", ")}`;
  }

  state.setActiveBranch(branch);
  state.save();

  const latest = branches.getLatestCommit(branch);
  const summary = latest ?? "No commits yet.";

  return `Switched to branch "${branch}".\n\n${summary}`;
}
