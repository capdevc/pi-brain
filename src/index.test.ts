import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type {
  AgentToolResult,
  ExtensionAPI,
  ExtensionContext,
  ToolDefinition,
} from "@mariozechner/pi-coding-agent";

import activate from "./index.js";

// Helpers

interface RegisteredHandler {
  event: string;
  handler: (event: unknown, ctx: ExtensionContext) => unknown;
}

interface MockUi {
  notifications: { message: string; type: "info" | "warning" | "error" }[];
  statuses: Map<string, string | undefined>;
  notify: (message: string, type?: "info" | "warning" | "error") => void;
  setStatus: (key: string, text: string | undefined) => void;
}

interface MockPi {
  tools: ToolDefinition[];
  handlers: RegisteredHandler[];
  api: ExtensionAPI;
}

function createMockUi(): MockUi {
  const notifications: {
    message: string;
    type: "info" | "warning" | "error";
  }[] = [];
  const statuses = new Map<string, string | undefined>();
  return {
    notifications,
    statuses,
    notify(message: string, type: "info" | "warning" | "error" = "info") {
      notifications.push({ message, type });
    },
    setStatus(key: string, text: string | undefined) {
      if (text === undefined) {
        statuses.delete(key);
      } else {
        statuses.set(key, text);
      }
    },
  };
}

function createMockPi(): MockPi {
  const tools: ToolDefinition[] = [];
  const handlers: RegisteredHandler[] = [];

  const api = {
    registerTool(def: ToolDefinition) {
      tools.push(def);
    },
    on(
      event: string,
      handler: (event: unknown, ctx: ExtensionContext) => unknown
    ) {
      handlers.push({ event, handler });
    },
  } as unknown as ExtensionAPI;

  return { tools, handlers, api };
}

function getHandler(
  handlers: RegisteredHandler[],
  eventName: string
): ((event: unknown, ctx: ExtensionContext) => unknown) | undefined {
  return handlers.find((h) => h.event === eventName)?.handler;
}

function setupInitializedProject(): {
  projectDir: string;
  cleanup: () => void;
} {
  const projectDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "memory-index-test-")
  );
  const memoryDir = path.join(projectDir, ".memory");
  const branchDir = path.join(memoryDir, "branches", "main");

  fs.mkdirSync(branchDir, { recursive: true });
  fs.writeFileSync(
    path.join(memoryDir, "state.yaml"),
    [
      "active_branch: main",
      'initialized: "2026-02-23T00:00:00Z"',
      "last_commit:",
      "  branch: main",
      "  hash: a1b2c3d4",
      '  timestamp: "2026-02-23T00:30:00Z"',
      '  summary: "Initial foundation"',
    ].join("\n")
  );

  fs.writeFileSync(
    path.join(branchDir, "log.md"),
    "## Turn 1 | 2026-02-23T02:00:00Z | anthropic/claude\n\n**Thought**: setup\n\n"
  );
  fs.writeFileSync(
    path.join(branchDir, "commits.md"),
    "# main\n\n**Purpose:** Main branch\n"
  );
  fs.writeFileSync(path.join(branchDir, "metadata.yaml"), "");

  return {
    projectDir,
    cleanup: () => fs.rmSync(projectDir, { recursive: true, force: true }),
  };
}

function getFirstText(result: AgentToolResult<unknown> | undefined): string {
  const first = result?.content[0];
  if (first?.type !== "text") {
    return "";
  }

  return first.text;
}

function createCtx(projectDir: string): ExtensionContext {
  const ui = createMockUi();
  return {
    cwd: projectDir,
    ui,
    sessionManager: {
      getSessionFile: () => "/tmp/pi-session-test.jsonl",
    },
  } as unknown as ExtensionContext;
}

describe("extensionWiring", () => {
  it("should register 2 memory tools and required event handlers", () => {
    // Arrange
    const mockPi = createMockPi();

    // Act
    activate(mockPi.api);

    // Assert
    const toolNames = mockPi.tools.map((t) => t.name);
    expect(toolNames).toHaveLength(2);
    expect(toolNames).toContain("memory_branch");
    expect(toolNames).toContain("memory_commit");

    const handlerNames = mockPi.handlers.map((h) => h.event);
    expect(handlerNames).toContain("turn_end");
    expect(handlerNames).toContain("before_agent_start");
    expect(handlerNames).toContain("session_start");
    expect(handlerNames).toContain("session_compact");
    expect(handlerNames).toContain("session_before_compact");
    expect(handlerNames).toContain("resources_discover");
  });

  it("should return tool result shape and guard when memory is uninitialized", async () => {
    // Arrange
    const mockPi = createMockPi();
    activate(mockPi.api);

    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-uninit-"));

    try {
      const ctx = createCtx(projectDir);

      const sessionStart = getHandler(mockPi.handlers, "session_start");
      await sessionStart?.({ type: "session_start" }, ctx);

      const memoryBranch = mockPi.tools.find((t) => t.name === "memory_branch");
      expect(memoryBranch).toBeDefined();

      // Act
      const result = await memoryBranch?.execute(
        "tc1",
        { action: "create", name: "test", purpose: "test" },
        undefined,
        undefined,
        ctx
      );

      // Assert
      expect(result?.content[0]?.type).toBe("text");
      expect(result?.details).toStrictEqual({});
      expect(getFirstText(result)).toContain("Brain not initialized");
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("should register session file in state.yaml on session_start", async () => {
    // Arrange
    const { projectDir, cleanup } = setupInitializedProject();
    try {
      const mockPi = createMockPi();
      activate(mockPi.api);

      const ctx = createCtx(projectDir);

      const sessionStart = getHandler(mockPi.handlers, "session_start");

      // Act
      await sessionStart?.({ type: "session_start" }, ctx);
      await sessionStart?.({ type: "session_start" }, ctx);

      // Assert
      const stateYaml = fs.readFileSync(
        path.join(projectDir, ".memory", "state.yaml"),
        "utf8"
      );

      expect(stateYaml).toContain("sessions:");
      expect(stateYaml).toContain("/tmp/pi-session-test.jsonl");
      const matches = stateYaml.match(/\/tmp\/pi-session-test\.jsonl/g);
      expect(matches?.length).toBe(1);
    } finally {
      cleanup();
    }
  });

  it("should show warning notification when log.md exceeds size threshold", async () => {
    // Arrange
    const { projectDir, cleanup } = setupInitializedProject();
    try {
      const mockPi = createMockPi();
      activate(mockPi.api);

      const logPath = path.join(
        projectDir,
        ".memory",
        "branches",
        "main",
        "log.md"
      );
      fs.writeFileSync(logPath, "x".repeat(700 * 1024));

      const ui = createMockUi();
      const ctx = {
        cwd: projectDir,
        ui,
        sessionManager: {
          getSessionFile: () => "/tmp/pi-session-large-log.jsonl",
        },
      } as unknown as ExtensionContext;

      const sessionStart = getHandler(mockPi.handlers, "session_start");

      // Act
      await sessionStart?.({ type: "session_start" }, ctx);

      // Assert
      expect(ui.notifications).toHaveLength(1);
      expect(ui.notifications[0].type).toBe("warning");
      expect(ui.notifications[0].message).toContain("log.md is large");
      expect(ui.notifications[0].message).toContain("should commit");
    } finally {
      cleanup();
    }
  });

  it("should set footer status on session_start for initialized project", async () => {
    // Arrange
    const { projectDir, cleanup } = setupInitializedProject();
    try {
      const mockPi = createMockPi();
      activate(mockPi.api);

      const ui = createMockUi();
      const ctx = {
        cwd: projectDir,
        ui,
        sessionManager: {
          getSessionFile: () => "/tmp/pi-session-status.jsonl",
        },
      } as unknown as ExtensionContext;

      const sessionStart = getHandler(mockPi.handlers, "session_start");

      // Act
      await sessionStart?.({ type: "session_start" }, ctx);

      // Assert — should set persistent footer status
      expect(ui.statuses.get("brain")).toContain("main");
      expect(ui.statuses.get("brain")).toContain("1 uncommitted turn");
    } finally {
      cleanup();
    }
  });

  it("should set footer status even when log.md is large", async () => {
    // Arrange
    const { projectDir, cleanup } = setupInitializedProject();
    try {
      const mockPi = createMockPi();
      activate(mockPi.api);

      const logPath = path.join(
        projectDir,
        ".memory",
        "branches",
        "main",
        "log.md"
      );
      fs.writeFileSync(logPath, "x".repeat(700 * 1024));

      const ui = createMockUi();
      const ctx = {
        cwd: projectDir,
        ui,
        sessionManager: {
          getSessionFile: () => "/tmp/pi-session-large-status.jsonl",
        },
      } as unknown as ExtensionContext;

      const sessionStart = getHandler(mockPi.handlers, "session_start");

      // Act
      await sessionStart?.({ type: "session_start" }, ctx);

      // Assert — warning notification AND footer status
      expect(ui.notifications).toHaveLength(1);
      expect(ui.notifications[0].type).toBe("warning");
      expect(ui.statuses.get("brain")).toContain("main");
    } finally {
      cleanup();
    }
  });

  it("should update the active session branch mapping after memory_branch", async () => {
    // Arrange
    const { projectDir, cleanup } = setupInitializedProject();
    try {
      const mockPi = createMockPi();
      activate(mockPi.api);

      const ctx = {
        cwd: projectDir,
        ui: createMockUi(),
        sessionManager: {
          getSessionFile: () => "/tmp/pi-session-branch-sync.jsonl",
        },
      } as unknown as ExtensionContext;

      const sessionStart = getHandler(mockPi.handlers, "session_start");
      await sessionStart?.({ type: "session_start" }, ctx);

      const memoryBranch = mockPi.tools.find((t) => t.name === "memory_branch");
      expect(memoryBranch).toBeDefined();

      // Act
      await memoryBranch?.execute(
        "tc-branch-sync",
        {
          action: "create",
          name: "feature-x",
          purpose: "Investigate branch sync",
        },
        undefined,
        undefined,
        ctx
      );

      // Assert
      const stateYaml = fs.readFileSync(
        path.join(projectDir, ".memory", "state.yaml"),
        "utf8"
      );

      expect(stateYaml).toMatch(
        /sessions:[\s\S]*file: "\/tmp\/pi-session-branch-sync\.jsonl"[\s\S]*branch: "feature-x"/
      );
    } finally {
      cleanup();
    }
  });

  it("should discover Brain skill path with ESM-safe resolution", async () => {
    // Arrange
    const mockPi = createMockPi();
    activate(mockPi.api);

    const resourcesDiscover = getHandler(mockPi.handlers, "resources_discover");
    expect(resourcesDiscover).toBeDefined();

    const ctx = createCtx(process.cwd());

    // Act
    const result = (await resourcesDiscover?.(
      { type: "resources_discover", cwd: process.cwd(), reason: "startup" },
      ctx
    )) as { skillPaths?: string[] } | undefined;

    // Assert
    expect(result?.skillPaths?.length).toBe(1);
    expect(result?.skillPaths?.[0]).toContain("skills/brain");
  });

  it("should lazily load state when .memory/ is created after session_start", async () => {
    // Arrange
    const projectDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "memory-lazy-init-")
    );

    try {
      const mockPi = createMockPi();
      activate(mockPi.api);

      const ctx = createCtx(projectDir);

      // session_start fires with no .memory/ directory
      const sessionStart = getHandler(mockPi.handlers, "session_start");
      await sessionStart?.({ type: "session_start" }, ctx);

      const memoryBranch = mockPi.tools.find((t) => t.name === "memory_branch");

      // Tool returns "not initialized" before .memory/ exists
      const before = await memoryBranch?.execute(
        "tc-lazy-before",
        { action: "create", name: "test", purpose: "test" },
        undefined,
        undefined,
        ctx
      );
      expect(getFirstText(before)).toContain("Brain not initialized");

      // Simulate mid-session init: create .memory/ structure
      const branchDir = path.join(projectDir, ".memory", "branches", "main");
      fs.mkdirSync(branchDir, { recursive: true });
      fs.writeFileSync(
        path.join(projectDir, ".memory", "state.yaml"),
        ["active_branch: main", 'initialized: "2026-02-25T00:00:00Z"'].join(
          "\n"
        )
      );
      fs.writeFileSync(path.join(branchDir, "log.md"), "");
      fs.writeFileSync(
        path.join(branchDir, "commits.md"),
        "# main\n\n**Purpose:** Main branch\n"
      );
      fs.writeFileSync(path.join(branchDir, "metadata.yaml"), "");

      // Act — switch action to verify lazy loading
      const after = await memoryBranch?.execute(
        "tc-lazy-after",
        { action: "switch", branch: "main" },
        undefined,
        undefined,
        ctx
      );

      // Assert
      expect(getFirstText(after)).not.toContain("Brain not initialized");
      expect(getFirstText(after)).toContain("Active branch: main");

      const stateYaml = fs.readFileSync(
        path.join(projectDir, ".memory", "state.yaml"),
        "utf8"
      );
      expect(stateYaml).toContain("/tmp/pi-session-test.jsonl");
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }
  });

  it("should return error from memory_commit when subagent fails", async () => {
    // Arrange
    const { projectDir, cleanup } = setupInitializedProject();
    try {
      const mockPi = createMockPi();
      activate(mockPi.api);

      const ctx = createCtx(projectDir);

      const sessionStart = getHandler(mockPi.handlers, "session_start");
      await sessionStart?.({ type: "session_start" }, ctx);

      const memoryCommit = mockPi.tools.find((t) => t.name === "memory_commit");
      expect(memoryCommit).toBeDefined();

      const controller = new AbortController();
      controller.abort();

      // Act
      const result = await memoryCommit?.execute(
        "tc-commit",
        { summary: "Test commit" },
        controller.signal,
        undefined,
        ctx
      );

      // Assert
      expect(result?.content[0]?.type).toBe("text");
      expect(result?.details).toStrictEqual({});
    } finally {
      cleanup();
    }
  });

  // --- before_agent_start hook ---

  it("should inject status message on first before_agent_start", async () => {
    const { projectDir, cleanup } = setupInitializedProject();
    try {
      const mockPi = createMockPi();
      activate(mockPi.api);

      const ctx = createCtx(projectDir);
      const sessionStart = getHandler(mockPi.handlers, "session_start");
      await sessionStart?.({ type: "session_start" }, ctx);

      const beforeStart = getHandler(mockPi.handlers, "before_agent_start");
      const result = (await beforeStart?.(
        { type: "before_agent_start", prompt: "hello", systemPrompt: "..." },
        ctx
      )) as { message?: { content: string } } | undefined;

      expect(result).toBeDefined();
      expect(result?.message?.content).toContain("# Memory Status");
      expect(result?.message?.content).toContain("Active branch:");
    } finally {
      cleanup();
    }
  });

  it("should NOT inject status on subsequent before_agent_start calls", async () => {
    const { projectDir, cleanup } = setupInitializedProject();
    try {
      const mockPi = createMockPi();
      activate(mockPi.api);

      const ctx = createCtx(projectDir);
      const sessionStart = getHandler(mockPi.handlers, "session_start");
      await sessionStart?.({ type: "session_start" }, ctx);

      const beforeStart = getHandler(mockPi.handlers, "before_agent_start");
      const event = {
        type: "before_agent_start",
        prompt: "hello",
        systemPrompt: "...",
      };

      // First call injects
      await beforeStart?.(event, ctx);
      // Second call should not inject
      const result2 = await beforeStart?.(event, ctx);

      expect(result2).toBeUndefined();
    } finally {
      cleanup();
    }
  });

  it("should re-inject status after session_start resets the flag", async () => {
    const { projectDir, cleanup } = setupInitializedProject();
    try {
      const mockPi = createMockPi();
      activate(mockPi.api);

      const ctx = createCtx(projectDir);
      const sessionStart = getHandler(mockPi.handlers, "session_start");
      const beforeStart = getHandler(mockPi.handlers, "before_agent_start");
      const event = {
        type: "before_agent_start",
        prompt: "hello",
        systemPrompt: "...",
      };

      // First session: inject status
      await sessionStart?.({ type: "session_start" }, ctx);
      await beforeStart?.(event, ctx);

      // Second call should not inject
      const result2 = await beforeStart?.(event, ctx);
      expect(result2).toBeUndefined();

      // session_start fires again (session switch / reload) — resets the flag
      await sessionStart?.({ type: "session_start" }, ctx);

      // Now it should inject again
      const result3 = (await beforeStart?.(event, ctx)) as
        | { message?: { content: string } }
        | undefined;
      expect(result3).toBeDefined();
      expect(result3?.message?.content).toContain("# Memory Status");
    } finally {
      cleanup();
    }
  });

  it("should re-inject status after session_compact resets the flag", async () => {
    const { projectDir, cleanup } = setupInitializedProject();
    try {
      const mockPi = createMockPi();
      activate(mockPi.api);

      const ctx = createCtx(projectDir);
      const sessionStart = getHandler(mockPi.handlers, "session_start");
      const beforeStart = getHandler(mockPi.handlers, "before_agent_start");
      const sessionCompact = getHandler(mockPi.handlers, "session_compact");
      const event = {
        type: "before_agent_start",
        prompt: "hello",
        systemPrompt: "...",
      };

      // Initial session + first injection
      await sessionStart?.({ type: "session_start" }, ctx);
      await beforeStart?.(event, ctx);

      // Compaction resets the flag
      await sessionCompact?.({ type: "session_compact" }, ctx);

      // Should inject again
      const result = (await beforeStart?.(event, ctx)) as
        | { message?: { content: string } }
        | undefined;
      expect(result).toBeDefined();
      expect(result?.message?.content).toContain("# Memory Status");
    } finally {
      cleanup();
    }
  });
});
