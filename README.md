# @lunelson/clones-cli

A read-only Git repository manager for exploration and reference. Keep a tidy collection of cloned repos you want to study, search, or reference—without the overhead of managing them manually.

## Why?

When exploring codebases for learning or reference, you often end up with repos scattered across your filesystem. `clones` gives you:

- **One location** (`~/Clones`) for all reference repositories
- **A registry** tracking metadata, tags, and sync status
- **Fast clones** using shallow + single-branch by default
- **Easy sync** to keep everything up-to-date
- **Interactive browser** with type-ahead search

## Install

```bash
npm install -g @lunelson/clones-cli
```

Requires Node.js 18+.

## Quick Start

```bash
# Add a repository
clones add https://github.com/unjs/citty

# Browse interactively
clones

# List all repos
clones list

# Sync everything (fetch updates, adopt new repos, clone missing)
clones sync
```

## Commands

### `clones` (no args)

Opens the interactive browser with type-ahead search. Filter by name or tags, view details, copy paths, edit metadata.

### `clones add <url>`

Clone a repository to `~/Clones/<owner>/<repo>`.

```bash
clones add https://github.com/owner/repo
clones add git@github.com:owner/repo.git

# With metadata
clones add https://github.com/owner/repo --tags "cli,typescript" --description "My notes"

# Clone full history (default is shallow)
clones add https://github.com/owner/repo --full

# Clone all branches (default is single branch)
clones add https://github.com/owner/repo --all-branches
```

**URL normalization**: GitHub web UI URLs work too—`/tree/main`, `/blob/main/file.ts`, etc. are stripped automatically.

**Metadata**: For GitHub repos, description and topics are fetched automatically.

### `clones list`

Show all tracked repositories with status.

```bash
clones list                      # Pretty output
clones list --json               # JSON output
clones list --filter "unjs/*"    # Filter by pattern
clones list --tags cli,typescript # Filter by tags
```

### `clones sync`

Synchronize registry with filesystem:

1. **Adopt** untracked repos found in `~/Clones`
2. **Clone** repos in registry that are missing from disk
3. **Fetch** and **reset** existing repos to upstream

```bash
clones sync                  # Sync all
clones sync --filter "unjs/*" # Sync matching repos only
clones sync --dry-run        # Preview changes
clones sync --force          # Sync even if working tree is dirty
clones sync --refresh        # Re-fetch metadata from GitHub
```

**Update strategies** (per-repo, set on add):
- `hard-reset` (default): Reset to upstream, discarding local changes
- `ff-only`: Fast-forward only, fail if diverged

### `clones rm <repo>`

Remove a repository from the registry.

```bash
clones rm owner/repo           # Remove from registry, keep files
clones rm owner/repo --purge   # Remove from registry AND delete files
clones rm owner/repo --yes     # Skip confirmation
```

## Directory Structure

```
~/Clones/
├── owner1/
│   ├── repo1/
│   └── repo2/
├── owner2/
│   └── repo3/
└── .clones-registry.json
```

The registry tracks:
- Clone URL and host
- Description and tags
- Update strategy and sync timestamps
- Submodule and LFS preferences

## Clone Behavior

By default, clones are:
- **Shallow** (`--depth 1`): Only the latest commit
- **Single-branch**: Only the default branch

This makes cloning fast—even multi-GB repos clone in seconds. Use `--full` and `--all-branches` if you need history or other branches.

To expand a shallow clone later:
```bash
cd ~/Clones/owner/repo
git fetch --unshallow
```

## Transactional Safety

Failed operations roll back cleanly:
- If a clone fails, created directories are removed
- The registry only updates after successful operations
- No partial state left behind

## License

MIT
