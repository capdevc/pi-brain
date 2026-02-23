import * as fs from "node:fs";
import * as path from "node:path";

import { parseYaml, serializeYaml } from "./yaml.js";

interface LastCommit {
  branch: string;
  hash: string;
  summary: string;
}

export class GccState {
  private readonly statePath: string;
  private readonly gccDir: string;
  activeBranch = "main";
  initialized = "";
  lastCommit: LastCommit | null = null;

  constructor(projectDir: string) {
    this.gccDir = path.join(projectDir, ".gcc");
    this.statePath = path.join(this.gccDir, "state.yaml");
  }

  get isInitialized(): boolean {
    return this.initialized !== "";
  }

  load(): void {
    if (!fs.existsSync(this.statePath)) {
      return;
    }

    const content = fs.readFileSync(this.statePath, "utf8");
    if (content.trim() === "") {
      return;
    }

    const data = parseYaml(content);

    if (typeof data.active_branch === "string") {
      this.activeBranch = data.active_branch;
    }
    if (typeof data.initialized === "string") {
      this.initialized = data.initialized;
    }
    if (typeof data.last_commit === "object" && data.last_commit !== null) {
      const lc = data.last_commit as Record<string, string>;
      this.lastCommit = {
        branch: lc.branch ?? "",
        hash: lc.hash ?? "",
        summary: lc.summary ?? "",
      };
    }
  }

  setActiveBranch(branch: string): void {
    this.activeBranch = branch;
  }

  setLastCommit(branch: string, hash: string, summary: string): void {
    this.lastCommit = { branch, hash, summary };
  }

  save(): void {
    const data: Record<string, string | Record<string, string>> = {
      active_branch: this.activeBranch,
    };

    if (this.initialized) {
      data.initialized = this.initialized;
    }

    if (this.lastCommit) {
      data.last_commit = {
        branch: this.lastCommit.branch,
        hash: this.lastCommit.hash,
        summary: this.lastCommit.summary,
      };
    }

    fs.writeFileSync(this.statePath, serializeYaml(data));
  }
}
