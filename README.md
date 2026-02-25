# pi-gcc

`pi-gcc` is a **memory extension** for the [pi coding agent](https://github.com/badlogic/pi-mono).

It gives an agent a versioned memory in a `.gcc/` folder, so it can keep context across sessions.

---

## Quick start

```bash
pi install git:github.com/Whamp/pi-gcc
```

Then open pi in the project where you want GCC memory and either ask it to
initialize GCC or run `/skill:gcc`.

---

## Install options

```bash
# From git (latest)
pi install git:github.com/Whamp/pi-gcc

# From git (pinned version)
pi install git:github.com/Whamp/pi-gcc@v0.1.0

# Project-local (shared with team via .pi/settings.json)
pi install -l git:github.com/Whamp/pi-gcc

# Try without installing
pi -e git:github.com/Whamp/pi-gcc
```

### Local development

```bash
git clone https://github.com/Whamp/pi-gcc.git
cd pi-gcc
pnpm install --prod=false    # .npmrc omits dev deps by default
pnpm run check

# Run pi with the extension loaded from source
pi -e ./src/index.ts
```

---

## What this project does

It adds 5 tools to pi:

- `gcc_context` — read a status overview (use `read` for deep file-level retrieval)
- `gcc_branch` — create a memory branch
- `gcc_switch` — switch memory branch
- `gcc_commit` — checkpoint what the agent learned
- `gcc_merge` — merge branch insights back into the active branch

It also uses hooks to:

- auto-log turns to `.gcc/branches/<branch>/log.md`
- register/update session mapping in `.gcc/state.yaml` (on `session_start` and branch changes via `gcc_branch`/`gcc_switch`)
- warn when `log.md` exceeds 600 KB (~150-175k tokens), nudging the agent to commit

---

## If you are a total novice: start here

### 1) Install requirements

You need:

- Node.js 20+
- pi CLI
- git

Check quickly:

```bash
node -v
pi --help
git --version
```

### 2) Install the extension

```bash
pi install git:github.com/Whamp/pi-gcc
```

---

## Run the extension locally (development)

From the cloned repository root:

```bash
pi -e ./src/index.ts
```

This starts pi with the GCC extension loaded.

---

## Initialize GCC memory in a project

Inside pi, tell the agent to initialize GCC or run `/skill:gcc`.
The agent loads the skill, resolves the init script path, and runs it.
No manual bash invocation needed.

The init script creates:

- `.gcc/state.yaml`
- `.gcc/branches/main/log.md`
- `.gcc/branches/main/commits.md`
- `.gcc/branches/main/metadata.yaml`
- `.gcc/main.md`
- `.gcc/AGENTS.md`
- static GCC section in root `AGENTS.md` (if missing)

---

## First-time workflow example

Inside pi (with extension loaded), try this order:

1. `gcc_context` (no args) — see current memory state
2. `gcc_branch` with name + purpose — create exploration branch
3. Do normal work (read/edit/test)
4. `gcc_commit` with a summary — a subagent distills your log into a structured commit

---

## Development commands

| Goal                   | Command              |
| ---------------------- | -------------------- |
| Full validation        | `pnpm run check`     |
| Tests                  | `pnpm run test`      |
| Type check             | `pnpm run typecheck` |
| Lint                   | `pnpm run lint`      |
| Format                 | `pnpm run format`    |
| Auto-fix lint + format | `pnpm run fix`       |
| Release new version    | `pnpm run release`   |

---

## Common problems

### "GCC not initialized. Run gcc-init.sh first."

You are in a project that does not have `.gcc/` yet. Ask the agent to initialize GCC, or load the `gcc` skill.

### I do not see notifications in print/json mode

That is expected. In non-UI mode, verify by checking files in `.gcc/` and emitted events.

---

## Releasing

Uses [changelogen](https://github.com/unjs/changelogen) with conventional commits.

```bash
pnpm run release
```

This bumps the version in `package.json`, updates `CHANGELOG.md` from your commit history, creates a git tag, and pushes everything.

---

## Project status

Under active development.
