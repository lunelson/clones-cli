import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import search from "@inquirer/search";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  readRegistry,
  writeRegistry,
  updateEntry,
  addEntry,
} from "../lib/registry.js";
import {
  readLocalState,
  writeLocalState,
  updateRepoLocalState,
  getLastSyncedAt,
} from "../lib/local-state.js";
import { getRepoStatus, cloneRepo, getRemoteUrl } from "../lib/git.js";
import { getRepoPath, getClonesDir, DEFAULTS, ensureClonesDir } from "../lib/config.js";
import { parseGitUrl, generateRepoId } from "../lib/url-parser.js";
import { fetchGitHubMetadata } from "../lib/github.js";
import type { RegistryEntry, RepoStatus, Registry, LocalState } from "../types/index.js";

const execAsync = promisify(exec);

// Custom error for clean exit propagation through nested async calls
class ExitRequestedError extends Error {
  constructor() {
    super("Exit requested");
    this.name = "ExitRequestedError";
  }
}

function requestExit(): never {
  throw new ExitRequestedError();
}

interface RepoInfo {
  entry: RegistryEntry;
  status: RepoStatus;
  localPath: string;
}

export default defineCommand({
  meta: {
    name: "browse",
    description: "Interactively browse and manage clones",
  },
  args: {},
  async run() {
    await mainMenu();
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN MENU
// ─────────────────────────────────────────────────────────────────────────────

async function mainMenu(): Promise<void> {
  p.intro("clones");

  try {
    while (true) {
      const registry = await readRegistry();
      const repoCount = registry.repos.length;

      const action = await p.select({
        message: "What would you like to do?",
        options: [
          {
            value: "browse",
            label: "Browse repositories",
            hint: repoCount > 0 ? `${repoCount} repos` : "none yet",
          },
          { value: "add", label: "Add a new clone" },
          { value: "sync", label: "Sync all clones" },
          { value: "exit", label: "Exit" },
        ],
      });

      if (p.isCancel(action) || action === "exit") {
        requestExit();
      }

      switch (action) {
        case "browse":
          if (repoCount === 0) {
            p.log.warn("No repositories yet. Add one first!");
          } else {
            await browseRepos(registry);
          }
          break;

        case "add":
          await addNewClone();
          break;

        case "sync":
          await runSync();
          break;
      }
    }
  } catch (error) {
    if (error instanceof ExitRequestedError) {
      p.outro("Goodbye!");
      return;
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BROWSE REPOS (with search)
// ─────────────────────────────────────────────────────────────────────────────

async function browseRepos(registry: Registry): Promise<void> {
  // Load status for all repos
  const s = p.spinner();
  s.start("Loading repositories...");

  const repos: RepoInfo[] = await Promise.all(
    registry.repos.map(async (entry) => {
      const localPath = getRepoPath(entry.owner, entry.repo);
      const status = await getRepoStatus(localPath);
      return { entry, status, localPath };
    })
  );

  s.stop(`${repos.length} repositories loaded`);

  // Use inquirer search for type-ahead filtering
  try {
    const selected = await search<RepoInfo>({
      message: "Select a repository (type to filter)",
      source: async (input) => {
        const term = (input || "").toLowerCase();
        const filtered = repos.filter((r) => {
          const name = `${r.entry.owner}/${r.entry.repo}`.toLowerCase();
          const tags = r.entry.tags?.join(" ").toLowerCase() || "";
          return name.includes(term) || tags.includes(term);
        });

        return filtered.map((r) => {
          const hints: string[] = [];
          if (r.entry.tags && r.entry.tags.length > 0) {
            hints.push(r.entry.tags.join(", "));
          }
          if (!r.status.exists) {
            hints.push("missing");
          } else if (r.status.isDirty) {
            hints.push("dirty");
          }

          return {
            name: `${r.entry.owner}/${r.entry.repo}`,
            value: r,
            description: hints.length > 0 ? hints.join(" · ") : undefined,
          };
        });
      },
    });

    await showRepoDetails(selected);
  } catch (error) {
    // User cancelled (Ctrl+C/ESC in inquirer throws) - propagate as exit
    if ((error as Error).message?.includes("User force closed")) {
      requestExit();
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REPO DETAILS & ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function showRepoDetails(repo: RepoInfo): Promise<void> {
  const shortPath = repo.localPath.replace(process.env.HOME || "", "~");

  // Display repo info
  console.log();
  console.log(`  ${repo.entry.owner}/${repo.entry.repo}`);
  console.log(`  ${"─".repeat(40)}`);
  console.log(`  Path: ${shortPath}`);
  console.log(`  URL:  ${repo.entry.cloneUrl}`);

  if (repo.entry.tags && repo.entry.tags.length > 0) {
    console.log(`  Tags: ${repo.entry.tags.join(", ")}`);
  } else {
    console.log(`  Tags: (none)`);
  }

  if (repo.entry.description) {
    console.log(`  Desc: ${repo.entry.description}`);
  } else {
    console.log(`  Desc: (none)`);
  }

  // Status
  if (!repo.status.exists) {
    console.log(`  Status: ✗ Missing`);
  } else if (!repo.status.isGitRepo) {
    console.log(`  Status: ✗ Not a git repo`);
  } else if (repo.status.isDirty) {
    console.log(`  Status: ● Dirty`);
  } else {
    console.log(`  Status: ✓ Clean`);
  }

  // Get lastSyncedAt from local state
  const localState = await readLocalState();
  const lastSyncedAt = getLastSyncedAt(localState, repo.entry.id);
  if (lastSyncedAt) {
    console.log(`  Synced: ${formatRelativeTime(lastSyncedAt)}`);
  }

  console.log();

  // Action menu
  const action = await p.select({
    message: "What would you like to do?",
    options: [
      { value: "copy", label: "Copy path to clipboard" },
      { value: "edit-tags", label: "Edit tags" },
      { value: "edit-desc", label: "Edit description" },
      { value: "back", label: "Back to menu" },
      { value: "exit", label: "Exit" },
    ],
  });

  if (p.isCancel(action) || action === "exit") {
    requestExit();
  }

  if (action === "back") {
    return;
  }

  const registry = await readRegistry();

  switch (action) {
    case "copy":
      const userPath = toUserPath(repo.localPath);
      await copyToClipboard(userPath);
      p.log.success(`Copied: ${userPath}`);
      break;

    case "edit-tags":
      await editTags(repo, registry);
      break;

    case "edit-desc":
      await editDescription(repo, registry);
      break;
  }
}

async function editTags(repo: RepoInfo, registry: Registry): Promise<void> {
  const currentTags = repo.entry.tags?.join(", ") || "";

  const newTags = await p.text({
    message: "Enter tags (comma-separated)",
    initialValue: currentTags,
    placeholder: "cli, typescript, framework",
  });

  if (p.isCancel(newTags)) {
    return;
  }

  const tags = newTags
    ? newTags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    : undefined;

  const updatedRegistry = updateEntry(registry, repo.entry.id, { tags });
  await writeRegistry(updatedRegistry);

  p.log.success(`Tags updated for ${repo.entry.owner}/${repo.entry.repo}`);
}

async function editDescription(repo: RepoInfo, registry: Registry): Promise<void> {
  const newDesc = await p.text({
    message: "Enter description",
    initialValue: repo.entry.description || "",
    placeholder: "A brief description of this repository",
  });

  if (p.isCancel(newDesc)) {
    return;
  }

  const description = newDesc || undefined;

  const updatedRegistry = updateEntry(registry, repo.entry.id, { description });
  await writeRegistry(updatedRegistry);

  p.log.success(`Description updated for ${repo.entry.owner}/${repo.entry.repo}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// ADD NEW CLONE
// ─────────────────────────────────────────────────────────────────────────────

async function addNewClone(): Promise<void> {
  const url = await p.text({
    message: "Enter Git URL (HTTPS or SSH)",
    placeholder: "https://github.com/owner/repo",
  });

  if (p.isCancel(url) || !url) {
    return;
  }

  let parsed;
  try {
    parsed = parseGitUrl(url);
  } catch (error) {
    p.log.error(`Invalid Git URL: ${url}`);
    return;
  }

  const repoId = generateRepoId(parsed);
  const localPath = getRepoPath(parsed.owner, parsed.repo);

  p.log.info(`Repository: ${parsed.owner}/${parsed.repo}`);
  p.log.info(`Host: ${parsed.host}`);

  // Check if already exists
  const registry = await readRegistry();
  if (registry.repos.find((e) => e.id === repoId)) {
    p.log.error(`Already in registry: ${repoId}`);
    return;
  }

  const status = await getRepoStatus(localPath);
  if (status.exists) {
    p.log.error(`Directory already exists: ${localPath}`);
    p.log.info("It will be adopted on next sync.");
    return;
  }

  // Fetch GitHub metadata before cloning
  await ensureClonesDir();

  const s = p.spinner();
  let autoDescription: string | undefined;
  let autoTopics: string[] | undefined;

  if (parsed.host === "github.com") {
    s.start(`Fetching metadata from GitHub...`);
    const metadata = await fetchGitHubMetadata(parsed.owner, parsed.repo);
    if (metadata) {
      autoDescription = metadata.description || undefined;
      autoTopics = metadata.topics.length > 0 ? metadata.topics : undefined;
      s.stop("Metadata fetched");
    } else {
      s.stop("Could not fetch metadata (continuing without)");
    }
  }

  // Track what exists before clone for rollback
  const ownerDir = join(getClonesDir(), parsed.owner);
  const ownerExistedBefore = existsSync(ownerDir);

  // Clone
  s.start(`Cloning ${parsed.owner}/${parsed.repo}...`);

  try {
    await cloneRepo(parsed.cloneUrl, localPath);
    s.stop(`Cloned to ${localPath}`);
  } catch (error) {
    s.stop("Clone failed");

    // Rollback: remove directories created by the failed clone
    if (!ownerExistedBefore && existsSync(ownerDir)) {
      try {
        await rm(ownerDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    p.log.error(error instanceof Error ? error.message : String(error));
    return;
  }

  // Add to registry
  const entry: RegistryEntry = {
    id: repoId,
    host: parsed.host,
    owner: parsed.owner,
    repo: parsed.repo,
    cloneUrl: parsed.cloneUrl,
    description: autoDescription,
    tags: autoTopics,
    defaultRemoteName: DEFAULTS.defaultRemoteName,
    updateStrategy: DEFAULTS.updateStrategy,
    submodules: DEFAULTS.submodules,
    lfs: DEFAULTS.lfs,
    addedAt: new Date().toISOString(),
    addedBy: "manual",
    managed: true,
  };

  const updatedRegistry = addEntry(registry, entry);
  await writeRegistry(updatedRegistry);

  // Update local state with initial lastSyncedAt
  let localState = await readLocalState();
  localState = updateRepoLocalState(localState, repoId, {
    lastSyncedAt: new Date().toISOString(),
  });
  await writeLocalState(localState);

  p.log.success(`Added ${parsed.owner}/${parsed.repo} to registry`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNC
// ─────────────────────────────────────────────────────────────────────────────

async function runSync(): Promise<void> {
  p.log.info("Running sync...");
  console.log();

  // Import and run the sync command
  const { default: syncCommand } = await import("./sync.js");
  await syncCommand.run?.({ args: {} } as any);
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────

async function copyToClipboard(text: string): Promise<void> {
  const platform = process.platform;
  // Use printf for reliable output without trailing newline
  const escaped = text.replace(/'/g, "'\\''"); // Escape single quotes for shell

  try {
    if (platform === "darwin") {
      await execAsync(`printf '%s' '${escaped}' | pbcopy`);
    } else if (platform === "linux") {
      try {
        await execAsync(`printf '%s' '${escaped}' | xclip -selection clipboard`);
      } catch {
        await execAsync(`printf '%s' '${escaped}' | xsel --clipboard --input`);
      }
    } else if (platform === "win32") {
      // Windows clip adds a newline anyway, but at least avoid the -n issue
      await execAsync(`echo ${JSON.stringify(text)} | clip`);
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (error) {
    throw new Error(`Could not copy to clipboard. Path: ${text}`);
  }
}

function toUserPath(absolutePath: string): string {
  const home = process.env.HOME;
  if (home && absolutePath.startsWith(home)) {
    return "~" + absolutePath.slice(home.length);
  }
  return absolutePath;
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
