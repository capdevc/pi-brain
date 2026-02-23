import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { GccState } from "./state.js";

describe("gccState", () => {
  let tmpDir: string;
  let gccDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gcc-state-test-"));
    gccDir = path.join(tmpDir, ".gcc");
    fs.mkdirSync(gccDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("loads valid state.yaml", () => {
    fs.writeFileSync(
      path.join(gccDir, "state.yaml"),
      `active_branch: main\ninitialized: "2026-02-22T14:00:00Z"`
    );
    const state = new GccState(tmpDir);
    state.load();
    expect(state.activeBranch).toBe("main");
    expect(state.initialized).toBe("2026-02-22T14:00:00Z");
  });

  it("falls back to defaults when state.yaml is empty", () => {
    fs.writeFileSync(path.join(gccDir, "state.yaml"), "");
    const state = new GccState(tmpDir);
    state.load();
    expect(state.activeBranch).toBe("main");
  });

  it("falls back to defaults when state.yaml is missing", () => {
    const state = new GccState(tmpDir);
    state.load();
    expect(state.activeBranch).toBe("main");
  });

  it("reports isInitialized correctly", () => {
    const state = new GccState(tmpDir);
    expect(state.isInitialized).toBeFalsy();

    fs.writeFileSync(
      path.join(gccDir, "state.yaml"),
      `active_branch: main\ninitialized: "2026-02-22T14:00:00Z"`
    );
    state.load();
    expect(state.isInitialized).toBeTruthy();
  });

  it("updates active branch and persists", () => {
    fs.writeFileSync(
      path.join(gccDir, "state.yaml"),
      `active_branch: main\ninitialized: "2026-02-22T14:00:00Z"`
    );
    const state = new GccState(tmpDir);
    state.load();
    state.setActiveBranch("feature-x");
    state.save();

    const reloaded = new GccState(tmpDir);
    reloaded.load();
    expect(reloaded.activeBranch).toBe("feature-x");
  });

  it("updates last commit and persists", () => {
    fs.writeFileSync(
      path.join(gccDir, "state.yaml"),
      `active_branch: main\ninitialized: "2026-02-22T14:00:00Z"`
    );
    const state = new GccState(tmpDir);
    state.load();
    state.setLastCommit(
      "main",
      "a1b2c3d4",
      "2026-02-22T15:30:00Z",
      "Decided on X"
    );
    state.save();

    const reloaded = new GccState(tmpDir);
    reloaded.load();
    expect(reloaded.lastCommit).toStrictEqual({
      branch: "main",
      hash: "a1b2c3d4",
      timestamp: "2026-02-22T15:30:00Z",
      summary: "Decided on X",
    });
  });
});
