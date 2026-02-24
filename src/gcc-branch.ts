import type { BranchManager } from "./branches.js";
import type { GccState } from "./state.js";

interface GccBranchParams {
  name: string;
  purpose: string;
}

/**
 * Execute the gcc_branch tool — create a new memory branch.
 */
export function executeGccBranch(
  params: GccBranchParams,
  state: GccState,
  branches: BranchManager
): string {
  const { name, purpose } = params;

  if (branches.branchExists(name)) {
    return `Branch "${name}" already exists. Use gcc_switch to switch to it.`;
  }

  branches.createBranch(name, purpose);
  state.setActiveBranch(name);
  state.save();

  return `Created branch "${name}" and switched to it.\nPurpose: ${purpose}`;
}
