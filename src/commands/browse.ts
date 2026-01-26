import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
  readRegistry,
  writeRegistry,
  updateEntry,
  addEntry,
  removeTombstone,
} from "../lib/registry.js";
import {
  readLocalState,
  writeLocalState,
  updateRepoLocalState,
  getLastSyncedAt,
} from "../lib/local-state.js";
import { getRepoStatus, cloneRepo } from "../lib/git.js";
import { getRepoPath, getClonesDir, DEFAULTS, ensureClonesDir } from "../lib/config.js";
import { parseGitUrl, generateRepoId } from "../lib/url-parser.js";
import { fetchGitHubMetadata } from "../lib/github.js";
import {
  autocompleteMultiselect,
  isCancel,
  type Option,
} from "../lib/autocomplete-multiselect.js";
import { toUserPath, formatRelativeTime, copyToClipboard } from "../lib/ui-utils.js";
import { showBatchActions, type RepoInfo } from "../lib/browse/batch-actions.js";
import type { RegistryEntry, Registry } from "../types/index.js";

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
// BROWSE REPOS (with multiselect search)
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

  // Build options for autocomplete multiselect
  const options: Option<RepoInfo>[] = repos.map((r) => {
    const hints: string[] = [];
    if (!r.status.exists) {
      hints.push("missing");
    } else if (r.status.isDirty) {
      hints.push("dirty");
    }

    return {
      value: r,
      label: `${r.entry.owner}/${r.entry.repo}`,
      hint: hints.length > 0 ? hints.join(", ") : undefined,
    };
  });

  // Custom filter that searches owner/repo, tags, and description
  const repoInfoFilter = (searchText: string, option: Option<RepoInfo>): boolean => {
    if (!searchText) return true;
    const term = searchText.toLowerCase();
    const entry = option.value.entry;
    const label = `${entry.owner}/${entry.repo}`.toLowerCase();
    const tags = entry.tags?.join(" ").toLowerCase() ?? "";
    const desc = entry.description?.toLowerCase() ?? "";
    return label.includes(term) || tags.includes(term) || desc.includes(term);
  };

  const selected = await autocompleteMultiselect({
    message: "Select repositories (type to filter, Tab to select)",
    options,
    placeholder: "Type to search...",
    filter: repoInfoFilter,
  });

  if (isCancel(selected)) {
    requestExit();
  }

  if (selected.length === 0) {
    p.log.info("No repositories selected.");
    return;
  }

  // Branch based on selection count
  if (selected.length === 1) {
    await showRepoDetails(selected[0]);
  } else {
    await showBatchActions(selected);
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
    managed: true,
  };

  let updatedRegistry = addEntry(registry, entry);
  updatedRegistry = removeTombstone(updatedRegistry, repoId);
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
