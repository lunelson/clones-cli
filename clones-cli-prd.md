# @lunelson/clones – Product Requirements Document

**Package**: `@lunelson/clones-cli`  
**Executable**: `clones`  
**Language**: TypeScript  
**UI Library**: `clack/prompts` for interactive prompts  
**Version**: 1.0.0  

---

## Overview

`@lunelson/clones` is a read-only Git repository manager for exploration and reference. It maintains a curated collection of clones under `~/Clones` (configurable via `CLONES_DIR` environment variable), with a registry-based state model that syncs across machines. The tool is designed for developers who maintain multiple read-only exploration repos and want to keep them synchronized, discoverable, and up-to-date across personal and work machines.

### Key Principles
- **Read-only by default**: All clones are exploration-only; local commits are not expected.
- **Registry as source of truth**: A `registry.json` file defines the canonical set of remotes to track.
- **Local branch choice**: Whichever branch is checked out locally remains a user concern; registry does not dictate branch state.
- **Destructive sync**: Updates use `git reset --hard` to align local branches with their upstream tracking branches, not `--ff-only`.
- **Submodule + LFS support**: Registry can declare whether a repo needs recursive submodule updates or LFS pulls.
- **Multi-machine sync**: Registry can be version-controlled or synced; each machine reconciles registry against on-disk state.

---

## Registry Schema

### `registry.json` Location
`$CLONES_DIR/registry.json` (e.g., `~/Clones/registry.json`)

### Schema (TypeScript interface)

```typescript
interface Registry {
  version: "1.0.0";
  lastUpdated: string; // ISO 8601 timestamp
  repos: RegistryEntry[];
}

interface RegistryEntry {
  // Identity
  id: string; // Unique stable identifier (e.g., "github.com:colinhacks/zsh")
  host: string; // github.com | gitlab.com | bitbucket.org | custom-host.com
  owner: string; // Organization or user
  repo: string; // Repository name
  cloneUrl: string; // Full HTTPS or SSH URL (e.g., git@github.com:colinhacks/zsh.git)
  
  // Local paths (derived, not persisted; shown for user reference)
  // localPath: "$CLONES_DIR/$owner/$repo"
  
  // Metadata (optional, can be stale)
  description?: string; // Human-readable description
  tags?: string[]; // User-defined tags for organization
  
  // Behavior
  defaultRemoteName: string; // Usually "origin"; can be custom for unusual setups
  updateStrategy: "hard-reset" | "ff-only"; // How to sync: destructive or safe
  submodules: "none" | "recursive"; // Whether to run `git submodule update --init --recursive`
  lfs: "auto" | "always" | "never"; // LFS behavior: auto-detect, always pull, or skip
  
  // Tracking
  addedAt: string; // ISO 8601 when this entry was added
  addedBy: string; // "manual" | "auto-discovered" | hostname where added
  lastSyncedAt?: string; // ISO 8601 when last successfully updated
  
  // Discovery / reconciliation
  managed: boolean; // If false, entry exists only as "desired but not yet cloned"
}
```

### Example `registry.json`
```json
{
  "version": "1.0.0",
  "lastUpdated": "2026-01-19T17:15:00Z",
  "repos": [
    {
      "id": "github.com:colinhacks/zsh",
      "host": "github.com",
      "owner": "colinhacks",
      "repo": "zsh",
      "cloneUrl": "git@github.com:colinhacks/zsh.git",
      "description": "Zsh shell improvements",
      "tags": ["shell", "zsh"],
      "defaultRemoteName": "origin",
      "updateStrategy": "hard-reset",
      "submodules": "none",
      "lfs": "auto",
      "addedAt": "2026-01-19T15:00:00Z",
      "addedBy": "manual",
      "lastSyncedAt": "2026-01-19T17:10:00Z",
      "managed": true
    },
    {
      "id": "github.com:torvalds/linux",
      "host": "github.com",
      "owner": "torvalds",
      "repo": "linux",
      "cloneUrl": "https://github.com/torvalds/linux.git",
      "description": "Linux kernel",
      "tags": ["kernel", "core"],
      "defaultRemoteName": "origin",
      "updateStrategy": "hard-reset",
      "submodules": "recursive",
      "lfs": "auto",
      "addedAt": "2026-01-18T10:00:00Z",
      "addedBy": "auto-discovered",
      "lastSyncedAt": "2026-01-19T17:05:00Z",
      "managed": true
    }
  ]
}
```

---

## Commands

### 1. `clones add <url> [--tags tag1,tag2] [--description "..."]`

**Purpose**: Add a new clone by Git URL (HTTPS or SSH).

**Behavior**:
- Parse the URL to extract `host`, `owner`, `repo`.
- Validate that the local directory does not already exist.
- Clone the repo with `git clone --origin origin <url> <local-path>`.
- Create a registry entry with `managed: true`, `addedBy: "manual"`, `updateStrategy: "hard-reset"`, `submodules: "none"`, `lfs: "auto"` (defaults).
- Write updated `registry.json`.

**Input**:
- `<url>`: Full Git URL (https://github.com/OWNER/REPO.git or git@github.com:OWNER/REPO.git).
- `--tags`: Optional comma-separated tags.
- `--description`: Optional description string.
- `--update-strategy`: Optional; "hard-reset" (default) or "ff-only".
- `--submodules`: Optional; "none" (default) or "recursive".
- `--lfs`: Optional; "auto" (default), "always", or "never".

**Error cases**:
- Invalid URL format → prompt user to verify.
- Repo already exists locally → error, suggest `clones update` or manual removal.
- Clone fails (network, auth) → report error; do not add registry entry.
- Directory creation fails → error, check permissions.

**Interactive**:
- If URL is ambiguous (e.g., missing `.git`), offer corrections.
- If repo already has local changes/dirty state post-clone, warn but proceed (caller can investigate).

**Output**:
```
✓ Cloned colinhacks/zsh to ~/Clones/colinhacks/zsh
✓ Registry updated: 1 new entry
```

---

### 2. `clones adopt [--scan]`

**Purpose**: Auto-discover Git repos in `$CLONES_DIR` and add them to the registry if they're not already tracked.

**Behavior**:
- Scan `$CLONES_DIR` recursively for `.git/` directories at depth 2 (i.e., `$CLONES_DIR/OWNER/REPO/.git`).
- For each repo found, derive the canonical URL from `remote.origin.url`.
- If URL is not in registry: create a new entry with `managed: true`, `addedBy: "auto-discovered"`, other defaults as above.
- Write updated `registry.json`.
- Report summary: "X repos adopted, Y already known, Z skipped (reason)".

**Error cases**:
- Repo without `origin` remote → skip with warning (message: "no origin remote").
- Multiple remotes but `origin` missing → skip with warning.
- Invalid local Git repo (corrupt `.git/`) → skip with warning.
- Nested repos (e.g., submodules checked out as full repos, worktrees) → skip (log reason).

**Output**:
```
Scanning ~/Clones...
✓ Adopted colinhacks/zsh
✓ Already known: torvalds/linux
⊘ Skipped (no origin): local-test-repo (reason: no origin remote)
Result: 1 adopted, 1 known, 1 skipped
```

---

### 3. `clones update [--filter OWNER/REPO] [--dry-run] [--force]`

**Purpose**: Sync all tracked repos (or a subset) by fetching and hard-resetting tracked branches.

**Behavior** (per repo):
1. Skip if not `managed: true`.
2. Verify repo directory exists; if missing, log and skip (optionally offer re-clone in future).
3. Verify `.git/` is a valid Git repo; skip if corrupt.
4. Enter repo directory.
5. Run `git fetch --prune <remote-name>` (e.g., `git fetch --prune origin`).
6. Detect current branch: `git symbolic-ref --quiet HEAD`.
   - If detached HEAD: log "detached HEAD", skip.
7. Verify current branch has upstream: `git rev-parse --abbrev-ref --symbolic-full-name @{u}`.
   - If no upstream: log "no upstream", skip.
8. Verify clean working tree: `git diff --quiet && git diff --cached --quiet`.
   - If dirty: log "dirty working tree", skip (unless `--force`; see below).
9. Perform sync per `updateStrategy`:
   - **"hard-reset"**: `git reset --hard @{u}`.
   - **"ff-only"**: `git pull --ff-only` (abort if diverged).
10. If `submodules == "recursive"`: run `git submodule update --init --recursive`.
11. If `lfs == "always"` or (`lfs == "auto"` and repo uses LFS, detected by checking `.gitattributes` or `git lfs install` state): run `git lfs pull origin`.
12. Update registry: set `lastSyncedAt` to current timestamp.
13. Log result: success, skipped (reason), or error.

**Flags**:
- `--filter OWNER/REPO`: Only update matching repos (supports glob, e.g., `github.com/*/zsh` or `colinhacks/*`).
- `--dry-run`: Show what would be updated, don't actually modify anything.
- `--force`: Proceed even if working tree is dirty (use with caution).

**Error cases**:
- Network failure during fetch → log and skip (transient).
- Auth failure → log and skip (likely auth misconfiguration).
- `git reset --hard` fails → log error; do not update `lastSyncedAt`.
- Submodule update fails → log warning; still consider update partially successful.
- LFS pull fails → log warning; still consider update partially successful.
- Detached HEAD, no upstream, dirty working tree → skip with specific reason logged.

**Output** (with `--dry-run` prefix if enabled):
```
Updating ~/Clones...

colinhacks/zsh
  ✓ Fetched, reset to origin/main (1 new commit)
  
torvalds/linux
  ✓ Fetched, reset to origin/master (47 new commits)
  ⊘ Submodule update: 3 modules updated
  ⊘ LFS: 12 objects downloaded (4.2 MB)
  
local-test-repo
  ✗ SKIPPED (detached HEAD)

Result: 2 updated, 1 skipped, 0 errors
```

---

### 4. `clones list [--json] [--tags tag1,tag2] [--filter OWNER/REPO]`

**Purpose**: List all tracked repos with metadata and sync status.

**Behavior**:
- Read `registry.json`.
- Optionally filter by tags or repo pattern.
- Display repos with local path, description, last sync time, sync status (dirty, detached, no upstream, etc.), and branch info.

**Flags**:
- `--json`: Output as JSON (useful for scripting).
- `--tags`: Filter to repos with *any* of the listed tags.
- `--filter`: Filter by `OWNER/REPO` pattern.

**Output** (default):
```
Clones Registry (~25 repos, last updated 2026-01-19 17:15)

colinhacks/zsh
  Path: ~/Clones/colinhacks/zsh
  URL: git@github.com:colinhacks/zsh.git
  Tags: shell, zsh
  Branch: main (up-to-date, synced 2h ago)
  Status: ✓ Clean

torvalds/linux
  Path: ~/Clones/torvalds/linux
  URL: https://github.com/torvalds/linux.git
  Tags: kernel, core
  Branch: master (1 commit behind origin/master)
  Status: ✗ Not synced (4 days)

...
```

**Output** (`--json`):
```json
{
  "version": "1.0.0",
  "repos": [
    {
      "id": "github.com:colinhacks/zsh",
      "owner": "colinhacks",
      "repo": "zsh",
      "localPath": "/Users/user/Clones/colinhacks/zsh",
      "branch": "main",
      "tracking": "origin/main",
      "behindCount": 0,
      "isDirty": false,
      "isDetached": false,
      "hasUpstream": true,
      "lastSyncedAt": "2026-01-19T15:15:00Z",
      "tags": ["shell", "zsh"]
    }
  ]
}
```

---

### 5. `clones doctor [--repair]`

**Purpose**: Diagnose and optionally repair issues in the registry and clones.

**Checks**:
- Registry file exists and is valid JSON; if not, offer recovery (backup + initialize).
- All `managed: true` repos exist locally.
- All local repos at depth 2 are in registry (mismatches suggested for adoption).
- Each repo's `origin` remote is valid.
- Each repo's current branch (if not detached) has an upstream.
- No corrupt `.git/` directories.
- No stale `lastSyncedAt` (older than N days; configurable, default 30).

**Behavior**:
- Report each issue with severity (warning, error).
- If `--repair`, offer fixes (e.g., re-clone missing repos, remove orphaned entries).
- Prompt user before making changes.

**Output**:
```
Registry Doctor

✓ registry.json valid
✗ 1 repo managed but missing: github.com:colinhacks/zsh
  → Path ~/Clones/colinhacks/zsh does not exist
  → Suggestion: Remove from registry or re-clone manually

✗ 1 local repo not in registry: ~/Clones/torvalds/linux
  → Suggestion: Run 'clones adopt' to add it

⊘ 2 repos stale (not synced >30 days):
  → colinhacks/broken (last synced 60 days ago)
  → torvalds/old (last synced 90 days ago)

✓ All remotes (origin) valid
✗ 1 repo with issues: torvalds/broken
  → detached HEAD; no upstream on current branch

Summary: 4 warnings, 1 error
Run 'clones doctor --repair' to attempt fixes.
```

---

### 6. `clones rm <OWNER/REPO> [--keep-disk]`

**Purpose**: Remove a repo from tracking.

**Behavior**:
- Find and remove entry from `registry.json`.
- By default, also delete the local directory (prompt for confirmation).
- If `--keep-disk`, only remove from registry (local files remain).
- Write updated `registry.json`.

**Error cases**:
- Repo not in registry → error.
- Local directory doesn't exist (registry is stale) → warn, remove from registry anyway (if `--repair` context).

**Output**:
```
✓ Removed colinhacks/zsh from registry
✓ Deleted ~/Clones/colinhacks/zsh
```

---

### 7. `clones edit <OWNER/REPO> [--tags ...] [--description ...] [--update-strategy ...]`

**Purpose**: Modify a repo's registry entry (metadata, behavior flags).

**Behavior**:
- Find repo in registry.
- Update specified fields (tags, description, updateStrategy, submodules, lfs).
- Validate new values.
- Write updated `registry.json`.

**Output**:
```
✓ Updated colinhacks/zsh
  tags: shell, zsh
  updateStrategy: hard-reset
  submodules: recursive
```

---

### 8. `clones gc [--aggressive]`

**Purpose**: Garbage-collect and optimize the clones collection.

**Behavior**:
- Remove untracked local repos (exist on disk but not in registry).
- Offer to re-clone missing repos that are in registry but not on disk.
- Run `git gc` in each repo if `--aggressive` (optimize storage).
- Validate registry after operations.
- Report summary of changes.

**Output**:
```
Garbage collection

⊘ Found 2 untracked local repos:
  → ~/Clones/test/junk (suggest: clones adopt or delete)
  → ~/Clones/local/experiment (suggest: clones adopt or delete)

✓ Found 1 missing repo in registry:
  → github.com:colinhacks/archived (suggest: re-clone, delete from registry)

Result: 0 deleted, 0 re-cloned (prompt mode)
```

---

### 9. `clones sync [--bi-directional] [--export-to PATH]`

**Purpose**: Sync the registry across machines (export/import).

**Behavior**:
- `sync` (no flags): Report which repos differ across machines (requires shared storage or manual sync).
- `--export-to PATH`: Write a portable snapshot of registry + metadata (JSON + optional bundle info).
- `--import-from PATH`: Merge an exported registry into the current one, reconciling conflicts.

**Notes**:
- This is a bridge feature for manual sync workflows (e.g., Git-tracking registry, cloud sync, manual file transfer).
- Does not sync Git object databases, only the registry metadata.
- For future: `git bundle` support to create portable repo snapshots.

**Output**:
```
✓ Registry exported to ~/Documents/clones-backup-2026-01-19.json
  25 repos included
  
Use 'clones sync --import-from' on another machine to merge.
```

---

## Initialization and Configuration

### Init (implicit)
- First run of any command: check if `~/.zshrc` (or `~/.bashrc`, `~/.config/fish/config.fish`) has been pre-configured with `CLONES_DIR` env var.
- If `$CLONES_DIR` not set, default to `~/Clones`.
- If `~/Clones/registry.json` doesn't exist, create it with `version: "1.0.0"`, `repos: []`.

### Environment Variables
- `CLONES_DIR`: Path to clones collection (default: `~/Clones`).
- `CLONES_UPDATE_STRATEGY`: Default update strategy for new repos (default: `hard-reset`).
- `CLONES_LFS`: Default LFS behavior (default: `auto`).

### Config File (future)
- `~/.config/clones/config.json` for persistent options (update frequency, default tags, etc.).

---

## Edge Cases and Exception Handling

### Detached HEAD
**Scenario**: Repo is in detached HEAD state.  
**Handling**: Skip during `update`. Log reason: "detached HEAD".  
**Recovery**: User must manually `git checkout <branch>` to restore tracking state.

### No Upstream Tracking
**Scenario**: Current branch exists locally but has no corresponding remote tracking branch.  
**Handling**: Skip during `update`. Log reason: "no upstream tracking".  
**Recovery**: User can set upstream manually: `git branch -u origin/<branch>` or `git switch --track origin/<branch>`.

### Dirty Working Tree
**Scenario**: Uncommitted changes or staged changes exist.  
**Handling**: Skip during `update` by default. Log reason: "dirty working tree".  
**Recovery**: Use `--force` flag if confident, or manually stash/discard changes.

### Force-Push / Diverged Default Branch
**Scenario**: Remote has been rewritten; local branch has commits not in remote.  
**Handling with `updateStrategy: "hard-reset"`**: `git reset --hard @{u}` will discard local commits (as intended for read-only repos).  
**Handling with `updateStrategy: "ff-only"`**: `git pull --ff-only` will abort. Log reason: "non-fast-forward".  
**User action**: Decide whether to switch strategy or manually inspect/reset.

### Corrupt `.git/`
**Scenario**: `.git/` directory is present but Git operations fail.  
**Handling**: Log error during discovery/update. Skip repo. Suggest `clones doctor --repair`.  
**Recovery**: User can manually remove repo or repair Git refs.

### Missing Local Directory (Registry Stale)
**Scenario**: Registry entry exists but local directory was deleted.  
**Handling during `update`**: Log and skip.  
**Handling during `doctor`**: Detect mismatch; suggest re-clone or remove from registry.

### Untracked Local Repo
**Scenario**: A Git repo exists at depth 2 but is not in registry.  
**Handling**: Ignore by default; `clones adopt` will discover it.  
**Handling in `doctor`**: Flag as "not tracked"; suggest `clones adopt`.

### Nested Repositories
**Scenario**: Submodule or worktree is checked out as a full `.git/` directory.  
**Handling**: Skip during adoption (do not add to registry as a top-level clone).  
**Rationale**: Submodules are managed by superproject; worktrees are project-local.

### Submodule Update Failures
**Scenario**: `git submodule update --init --recursive` fails partway through.  
**Handling**: Log warning but continue (mark `lastSyncedAt` as partial success).  
**Rationale**: Main branch sync may still be valid; submodule sync is secondary.

### LFS Not Installed
**Scenario**: Registry says `lfs: "always"` but `git lfs` is not available.  
**Handling**: Log warning and skip LFS pull. Continue with Git sync.  
**Alternative**: Fail fast if LFS is required (future config option).

### Multiple Remotes
**Scenario**: Repo has remotes other than `origin` (e.g., `upstream`).  
**Handling**: Registry tracks the primary `defaultRemoteName` (usually `origin`). Other remotes are user's responsibility.  
**Future**: Support primary + secondary remote tracking.

### URL Changes
**Scenario**: Repository URL changes (e.g., rename, host migration).  
**Handling**: Next fetch will fail due to auth/URL mismatch. Log error.  
**Recovery**: User must update registry entry with new URL: `clones edit OWNER/REPO --url <new-url>` (command TBD).

### Auth Failures
**Scenario**: SSH key missing, GitHub PAT expired, private repo access denied.  
**Handling**: `git fetch` fails; log error. Skip repo.  
**Recovery**: Fix auth (add SSH key, refresh PAT, etc.) and run `clones update` again.

### Stale Registry Timestamps
**Scenario**: `lastSyncedAt` is very old (e.g., >30 days).  
**Handling**: `doctor` will flag as "stale". No automatic action.  
**Rationale**: Staleness may be intentional (paused project); warn but don't auto-update.

### Large Repos / Submodules / LFS
**Scenario**: Clone or update takes excessive time/bandwidth.  
**Handling**: LFS + submodules can be toggled per-repo via registry. User controls scope.  
**Future**: Progress indicators, resumable transfers, offline mode.

---

## Implementation Notes

### Technology Stack
- **Language**: TypeScript (strict mode).
- **Runtime**: Node.js 18+ (modern async/await, Promise.all, etc.).
- **CLI Framework**: `clack/prompts` for interactive prompts + `@oclif/core` or `commander.js` for command routing.
- **Git Operations**: `simple-git` (Node.js wrapper) or direct `child_process` spawning of `git` CLI (more transparent, better for edge cases).
- **File I/O**: `fs.promises` for async operations.
- **Config/Registry**: JSON files (no external DB).

### Testing Strategy
- Unit tests: Parsing, URL normalization, registry operations (read/write/merge).
- Integration tests: Git operations (clone, fetch, reset) against real remotes or `git init` fixtures.
- E2E tests: Workflow scenarios (add, adopt, update, sync) with mock Git repos.

### Error Handling
- All Git commands wrapped with try/catch; detailed error messages logged.
- Registry writes use atomic file operations (write to temp file, rename on success).
- User-facing errors are friendly; technical errors logged to file or stderr.

### Performance
- `clones update` should parallelize repo fetches (fan-out, N workers).
- Registry reads/writes should be fast (<100ms for typical collections).
- Discovery (`clones adopt`, `clones doctor`) may be slower for large collections; offer `--verbose` progress.

### Security
- SSH keys managed by user's Git/SSH config; tool does not store credentials.
- Registry file contains only URLs and metadata; no secrets.
- `--force` and destructive operations prompt for confirmation.

---

## User Workflows

### Workflow 1: Initial Setup
```bash
export CLONES_DIR=~/Clones
clones add https://github.com/colinhacks/zsh.git --tags shell,zsh
clones add git@github.com:torvalds/linux.git --tags kernel --submodules recursive
clones list
clones update
```

### Workflow 2: Sync Across Machines
```bash
# Machine A: Export registry
clones sync --export-to ~/Dropbox/clones-registry.json

# Machine B: Import registry
clones sync --import-from ~/Dropbox/clones-registry.json
clones adopt  # Auto-discover any already-cloned repos
clones update # Sync everything
```

### Workflow 3: Explore a New Repo
```bash
clones add https://github.com/facebook/react.git
cd ~/Clones/facebook/react
git switch --track origin/experimental-feature  # User explores a branch
# Later, on other machine:
clones update  # Syncs react on current branch (not necessarily experimental-feature)
```

### Workflow 4: Maintenance
```bash
clones doctor  # Check health
clones doctor --repair  # Fix issues
clones gc  # Optimize storage
```

---

## Success Criteria

- ✓ CLI is usable and intuitive (all commands have `--help`).
- ✓ Registry is portable and can be version-controlled / synced across machines.
- ✓ `clones update` reliably syncs all repos in seconds (for typical collections of 10–50 repos).
- ✓ Edge cases (detached HEAD, dirty trees, force-pushes) are handled gracefully.
- ✓ User never loses local work by default (`--force` is explicit).
- ✓ Submodules and LFS are supported transparently.
- ✓ `clones doctor` catches and suggests remedies for common issues.

---

## Out of Scope (v2.0+)

- Git bundle support for offline cloning.
- GitHub/GitLab API integration for fetching repo descriptions, topics, or PR status.
- Multi-remote orchestration (e.g., tracking both `origin` and `upstream`).
- Shallow clones / --depth optimization.
- Monorepo / workspace-aware features (e.g., linking to Yarn/Nx workspaces).
- Web UI or TUI dashboard.
- Scheduled auto-updates or daemon mode.
