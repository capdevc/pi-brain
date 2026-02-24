import * as fs from "node:fs";
import * as path from "node:path";

import type { BranchManager } from "./branches.js";
import type { GccState } from "./state.js";
import type { GccContextParams } from "./types.js";

function extractCommitSummaryLine(commitEntry: string): string {
  const marker = "### This Commit's Contribution";
  const markerIndex = commitEntry.indexOf(marker);

  if (markerIndex !== -1) {
    const afterMarker = commitEntry.slice(markerIndex + marker.length);
    const firstContentLine = afterMarker
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    if (firstContentLine) {
      return firstContentLine.slice(0, 100);
    }
  }

  const headerMatch = /## Commit ([a-f0-9]+)/.exec(commitEntry);
  if (headerMatch) {
    return `commit ${headerMatch[1]}`;
  }

  return "(unknown)";
}

function buildStatusView(
  state: GccState,
  branches: BranchManager,
  projectDir: string
): string {
  const lines = ["# GCC Status", ""];

  const mainMdPath = path.join(projectDir, ".gcc", "main.md");
  if (fs.existsSync(mainMdPath)) {
    const roadmap = fs.readFileSync(mainMdPath, "utf8").trim();
    if (roadmap) {
      lines.push(roadmap, "");
    } else {
      lines.push(
        "Roadmap is empty. Update `.gcc/main.md` with project goals and current state.",
        ""
      );
    }
  } else {
    lines.push(
      "No roadmap found. Create `.gcc/main.md` to set project goals.",
      ""
    );
  }

  lines.push(`Active branch: ${state.activeBranch}`, "");

  const branchList = branches.listBranches();
  if (branchList.length > 0) {
    lines.push("## Branches", "");

    for (const name of branchList) {
      const latest = branches.getLatestCommit(name);
      const summary = latest
        ? extractCommitSummaryLine(latest)
        : "(no commits)";
      const marker = name === state.activeBranch ? " (active)" : "";
      lines.push(`- **${name}**${marker}: ${summary}`);
    }

    lines.push("");
  }

  lines.push("## Deep Retrieval", "");
  lines.push("Use `read .gcc/branches/<name>/commits.md` for full history.");
  lines.push("Use `read .gcc/branches/<name>/log.md` for OTA trace.");
  lines.push("Use `read .gcc/branches/<name>/metadata.yaml` for metadata.");
  lines.push("Use `read .gcc/main.md` for roadmap.");
  lines.push("Use `read .gcc/AGENTS.md` for protocol details.");

  return lines.join("\n");
}

/**
 * Execute the gcc_context tool — status overview.
 * Additional parameters are accepted for backward compatibility but ignored.
 */
export function executeGccContext(
  _params: GccContextParams,
  state: GccState,
  branches: BranchManager,
  projectDir: string
): string {
  return buildStatusView(state, branches, projectDir);
}
