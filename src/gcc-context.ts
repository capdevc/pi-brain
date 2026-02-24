import * as fs from "node:fs";
import * as path from "node:path";

import type { BranchManager } from "./branches.js";
import type { GccState } from "./state.js";
import type { GccContextParams } from "./types.js";

// --- Helper functions (defined before use) ---

function escapeRegex(str: string): string {
  return str.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function listMetadataSegments(metadata: string): string {
  const keys = metadata.match(/^[a-zA-Z0-9_-]+(?=:)/gm);
  return keys ? keys.join(", ") : "(none)";
}

function extractMetadataSegment(metadata: string, segment: string): string {
  const pattern = new RegExp(
    `^(${escapeRegex(segment)}:.*(?:\n(?![a-zA-Z0-9_-]+:).*)*)`,
    "m"
  );
  const match = pattern.exec(metadata);
  if (!match) {
    return `Segment "${segment}" not found. Available segments: ${listMetadataSegments(metadata)}`;
  }
  return match[1].trim();
}

function extractCommitByHash(commits: string, hash: string): string | null {
  const parts = commits.split(/\n---\n/);
  for (const part of parts) {
    if (part.includes(`## Commit ${hash}`)) {
      return part.trim();
    }
  }
  return null;
}

function extractCommitSummaryLine(commitEntry: string): string {
  const contributionMatch = /### This Commit's Contribution\n\n(.+)/m.exec(
    commitEntry
  );
  if (contributionMatch) {
    return contributionMatch[1].slice(0, 100);
  }
  const headerMatch = /## Commit ([a-f0-9]+)/.exec(commitEntry);
  if (headerMatch) {
    return `commit ${headerMatch[1]}`;
  }
  return "(unknown)";
}

// --- View builders ---

function buildStatusView(
  state: GccState,
  branches: BranchManager,
  projectDir: string
): string {
  const lines = ["# GCC Status", ""];

  const mainMdPath = path.join(projectDir, ".gcc", "main.md");
  if (fs.existsSync(mainMdPath)) {
    const roadmap = fs.readFileSync(mainMdPath, "utf8").trim();
    lines.push(roadmap, "");
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
  }

  return lines.join("\n");
}

function buildBranchView(branch: string, branches: BranchManager): string {
  if (!branches.branchExists(branch)) {
    return `Branch "${branch}" not found.`;
  }

  const lines = [`# Branch: ${branch}`, ""];

  const commits = branches.readCommits(branch);
  const latest = branches.getLatestCommit(branch);

  if (latest) {
    lines.push("## Latest Commit", "", latest, "");
  } else {
    lines.push("No commits yet.", "");
  }

  const hashPattern = /^## Commit ([a-f0-9]+)/gm;
  let match = hashPattern.exec(commits);
  const hashes: string[] = [];
  while (match) {
    hashes.push(match[1]);
    match = hashPattern.exec(commits);
  }

  if (hashes.length > 0) {
    lines.push("## Commit History", "");
    for (const hash of hashes) {
      lines.push(`- ${hash}`);
    }
  }

  return lines.join("\n");
}

function buildCommitView(
  commitHash: string,
  branch: string,
  branches: BranchManager
): string {
  if (!commitHash) {
    return "No commit hash specified. Use commit parameter to specify a hash.";
  }

  const branchesToSearch = branches.branchExists(branch)
    ? [branch, ...branches.listBranches().filter((b) => b !== branch)]
    : branches.listBranches();

  for (const b of branchesToSearch) {
    const commits = branches.readCommits(b);
    const entry = extractCommitByHash(commits, commitHash);
    if (entry) {
      return entry;
    }
  }

  return `Commit "${commitHash}" not found.`;
}

function buildLogView(branch: string, branches: BranchManager): string {
  const log = branches.readLog(branch);
  if (!log.trim()) {
    return "No log entries since last commit.";
  }
  return log;
}

function buildMetadataView(
  branch: string,
  segment: string | undefined,
  branches: BranchManager
): string {
  const metadata = branches.readMetadata(branch);
  if (!metadata.trim()) {
    return "No metadata recorded.";
  }

  if (!segment) {
    return metadata;
  }

  return extractMetadataSegment(metadata, segment);
}

// --- Main entry point ---

/**
 * Execute the gcc_context tool — multi-resolution retrieval of project memory.
 */
export function executeGccContext(
  params: GccContextParams,
  state: GccState,
  branches: BranchManager,
  projectDir: string
): string {
  const level = params.level ?? "status";
  const branch = params.branch ?? state.activeBranch;

  switch (level) {
    case "status": {
      return buildStatusView(state, branches, projectDir);
    }
    case "branch": {
      return buildBranchView(branch, branches);
    }
    case "commit": {
      return buildCommitView(params.commit ?? "", branch, branches);
    }
    case "log": {
      return buildLogView(branch, branches);
    }
    case "metadata": {
      return buildMetadataView(branch, params.segment, branches);
    }
    default: {
      return `Unknown context level: ${level}. Valid levels: status, branch, commit, log, metadata.`;
    }
  }
}
