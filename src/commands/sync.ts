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
  filterByPattern,
  findEntry,
} from "../lib/registry.js";
import {
  readLocalState,
  writeLocalState,
  updateRepoLocalState,
  updateLastSyncRun,
} from "../lib/local-state.js";
import {
  fetchWithPrune,
  resetHard,
  pullFastForward,
  getRepoStatus,
  updateSubmodules,
  usesLfs,
  pullLfs,
  cloneRepo,
  getRemoteUrl,
} from "../lib/git.js";
import { getRepoPath, getClonesDir, DEFAULTS } from "../lib/config.js";
import { scanClonesDir, isNestedRepo } from "../lib/scan.js";
import { parseGitUrl, generateRepoId } from "../lib/url-parser.js";
import { fetchGitHubMetadata } from "../lib/github.js";
import type { RegistryEntry, UpdateResult, Registry, LocalState } from "../types/index.js";

interface UpdateSummary {
  name: string;
  action: "adopted" | "cloned" | "updated" | "skipped" | "refreshed" | "error";
  detail?: string;
}

export default defineCommand({
  meta: {
    name: "sync",
    description: "Synchronize registry and clones (adopt, clone missing, fetch/reset)",
  },
  args: {
    filter: {
      type: "string",
      description: "Filter by owner/repo pattern (supports wildcards)",
    },
    "dry-run": {
      type: "boolean",
      description: "Show what would happen without making changes",
    },
    force: {
      type: "boolean",
      description: "Proceed even if working tree is dirty",
    },
    refresh: {
      type: "boolean",
      description: "Refresh metadata (description, tags) from GitHub for all repos",
    },
  },
  async run({ args }) {
    p.intro("clones sync");

    const dryRun = args["dry-run"] || false;
    const force = args.force || false;

    if (dryRun) {
      p.log.warn("Dry run mode - no changes will be made");
    }

    let registry = await readRegistry();
    let localState = await readLocalState();
    const summaries: UpdateSummary[] = [];

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 1: ADOPT - Discover untracked repos on disk
    // ═══════════════════════════════════════════════════════════════════
    p.log.step("Phase 1: Discovering untracked repos...");

    const { adopted, registry: registryAfterAdopt } = await adoptPhase(
      registry,
      { dryRun }
    );
    registry = registryAfterAdopt;

    for (const repo of adopted) {
      summaries.push({
        name: `${repo.owner}/${repo.repo}`,
        action: "adopted",
      });
    }

    if (adopted.length === 0) {
      p.log.info("  No untracked repos found");
    } else {
      p.log.success(`  ${adopted.length} repo(s) ${dryRun ? "would be" : ""} adopted`);
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 2: CLONE - Clone repos in registry but missing from disk
    // ═══════════════════════════════════════════════════════════════════
    p.log.step("Phase 2: Cloning missing repos...");

    const { cloned, errors: cloneErrors } = await clonePhase(registry, { dryRun });

    for (const repo of cloned) {
      summaries.push({
        name: `${repo.owner}/${repo.repo}`,
        action: "cloned",
      });
    }

    for (const err of cloneErrors) {
      summaries.push({
        name: err.name,
        action: "error",
        detail: err.error,
      });
    }

    if (cloned.length === 0 && cloneErrors.length === 0) {
      p.log.info("  No missing repos to clone");
    } else {
      if (cloned.length > 0) {
        p.log.success(`  ${cloned.length} repo(s) ${dryRun ? "would be" : ""} cloned`);
      }
      if (cloneErrors.length > 0) {
        p.log.error(`  ${cloneErrors.length} clone error(s)`);
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 3: UPDATE - Fetch and reset all tracked repos
    // ═══════════════════════════════════════════════════════════════════
    p.log.step("Phase 3: Updating repos...");

    // Apply filter if specified
    let reposToUpdate = registry.repos.filter((r) => r.managed);

    if (args.filter) {
      reposToUpdate = filterByPattern({ ...registry, repos: reposToUpdate }, args.filter);
      p.log.info(`  Filtering to: ${args.filter}`);
    }

    if (reposToUpdate.length === 0) {
      p.log.info("  No repos to update");
    } else {
      for (const entry of reposToUpdate) {
        const result = await updateRepo(entry, { dryRun, force });
        const name = `${entry.owner}/${entry.repo}`;

        if (result.status === "updated") {
          summaries.push({
            name,
            action: "updated",
            detail: result.commits ? `${result.commits} commits` : undefined,
          });

          // Update lastSyncedAt in local state
          if (!dryRun) {
            localState = updateRepoLocalState(localState, entry.id, {
              lastSyncedAt: new Date().toISOString(),
            });
          }
        } else if (result.status === "skipped") {
          summaries.push({
            name,
            action: "skipped",
            detail: result.reason,
          });
        } else {
          summaries.push({
            name,
            action: "error",
            detail: result.error,
          });
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // PHASE 4: REFRESH METADATA (optional)
    // ═══════════════════════════════════════════════════════════════════
    if (args.refresh) {
      p.log.step("Phase 4: Refreshing metadata from GitHub...");

      const githubRepos = registry.repos.filter((r) => r.host === "github.com");

      if (githubRepos.length === 0) {
        p.log.info("  No GitHub repos to refresh");
      } else {
        for (const entry of githubRepos) {
          const name = `${entry.owner}/${entry.repo}`;

          if (dryRun) {
            p.log.info(`  ↻ ${name} (would refresh)`);
            summaries.push({ name, action: "refreshed" });
            continue;
          }

          const metadata = await fetchGitHubMetadata(entry.owner, entry.repo);

          if (metadata) {
            const newDescription = metadata.description || undefined;
            const newTags = metadata.topics.length > 0 ? metadata.topics : undefined;

            // Only update if something changed
            const descChanged = entry.description !== newDescription;
            const tagsChanged = JSON.stringify(entry.tags) !== JSON.stringify(newTags);

            if (descChanged || tagsChanged) {
              registry = updateEntry(registry, entry.id, {
                description: newDescription,
                tags: newTags,
              });
              p.log.info(`  ↻ ${name} (refreshed)`);
              summaries.push({ name, action: "refreshed" });
            } else {
              p.log.info(`  ○ ${name} (unchanged)`);
            }
          } else {
            p.log.warn(`  ○ ${name} (could not fetch)`);
          }
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════
    // SAVE & SUMMARY
    // ═══════════════════════════════════════════════════════════════════
    if (!dryRun) {
      await writeRegistry(registry);
      // Update lastSyncRun and save local state
      localState = updateLastSyncRun(localState);
      await writeLocalState(localState);
    }

    console.log();
    printSummary(summaries, dryRun);

    p.outro("Done!");
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 1: ADOPT
// ─────────────────────────────────────────────────────────────────────────────

interface AdoptResult {
  adopted: { owner: string; repo: string }[];
  registry: Registry;
}

async function adoptPhase(
  registry: Registry,
  options: { dryRun: boolean }
): Promise<AdoptResult> {
  const adopted: { owner: string; repo: string }[] = [];
  let updatedRegistry = registry;

  const { discovered } = await scanClonesDir();

  for (const repo of discovered) {
    // Check if already in registry
    const existing = registry.repos.find(
      (e) => e.owner === repo.owner && e.repo === repo.repo
    );

    if (existing) {
      continue; // Already tracked
    }

    // Check if nested repo
    if (await isNestedRepo(repo.localPath)) {
      continue;
    }

    // Get remote URL
    const remoteUrl = await getRemoteUrl(repo.localPath);
    if (!remoteUrl) {
      continue; // No origin remote
    }

    // Parse URL
    let parsed;
    try {
      parsed = parseGitUrl(remoteUrl);
    } catch {
      continue; // Can't parse URL
    }

    const repoId = generateRepoId(parsed);

    // Check if ID already exists (different owner/repo but same ID)
    if (findEntry(updatedRegistry, repoId)) {
      continue;
    }

    if (!options.dryRun) {
      // Fetch GitHub metadata if applicable
      let description: string | undefined;
      let tags: string[] | undefined;

      if (parsed.host === "github.com") {
        const metadata = await fetchGitHubMetadata(parsed.owner, parsed.repo);
        if (metadata) {
          description = metadata.description || undefined;
          tags = metadata.topics.length > 0 ? metadata.topics : undefined;
        }
      }

      const entry: RegistryEntry = {
        id: repoId,
        host: parsed.host,
        owner: parsed.owner,
        repo: parsed.repo,
        cloneUrl: parsed.cloneUrl,
        description,
        tags,
        defaultRemoteName: DEFAULTS.defaultRemoteName,
        updateStrategy: DEFAULTS.updateStrategy,
        submodules: DEFAULTS.submodules,
        lfs: DEFAULTS.lfs,
        addedAt: new Date().toISOString(),
        managed: true,
      };

      updatedRegistry = addEntry(updatedRegistry, entry);
    }

    adopted.push({ owner: repo.owner, repo: repo.repo });
    p.log.info(`  + ${repo.owner}/${repo.repo}`);
  }

  return { adopted, registry: updatedRegistry };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: CLONE
// ─────────────────────────────────────────────────────────────────────────────

interface CloneResult {
  cloned: { owner: string; repo: string }[];
  errors: { name: string; error: string }[];
}

async function clonePhase(
  registry: Registry,
  options: { dryRun: boolean }
): Promise<CloneResult> {
  const cloned: { owner: string; repo: string }[] = [];
  const errors: { name: string; error: string }[] = [];

  for (const entry of registry.repos) {
    if (!entry.managed) continue;

    const localPath = getRepoPath(entry.owner, entry.repo);
    const status = await getRepoStatus(localPath);

    if (status.exists && status.isGitRepo) {
      continue; // Already exists
    }

    const name = `${entry.owner}/${entry.repo}`;

    if (options.dryRun) {
      p.log.info(`  + ${name} (would clone)`);
      cloned.push({ owner: entry.owner, repo: entry.repo });
      continue;
    }

    // Track what exists before clone for rollback
    const ownerDir = join(getClonesDir(), entry.owner);
    const ownerExistedBefore = existsSync(ownerDir);

    // Clone the repo
    const s = p.spinner();
    s.start(`  Cloning ${name}...`);

    try {
      await cloneRepo(entry.cloneUrl, localPath, {
        remoteName: entry.defaultRemoteName,
      });
      s.stop(`  + ${name} (cloned)`);
      cloned.push({ owner: entry.owner, repo: entry.repo });
    } catch (error) {
      s.stop(`  ✗ ${name} (clone failed)`);

      // Rollback: remove directories created by the failed clone
      if (!ownerExistedBefore && existsSync(ownerDir)) {
        try {
          await rm(ownerDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }

      errors.push({
        name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { cloned, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3: UPDATE (existing logic, slightly refactored)
// ─────────────────────────────────────────────────────────────────────────────

async function updateRepo(
  entry: RegistryEntry,
  options: { dryRun: boolean; force: boolean }
): Promise<UpdateResult> {
  const localPath = getRepoPath(entry.owner, entry.repo);
  const repoName = `${entry.owner}/${entry.repo}`;

  // Check status
  const status = await getRepoStatus(localPath);

  if (!status.exists) {
    p.log.error(`  ✗ ${repoName} (missing)`);
    return { status: "skipped", reason: "directory missing" };
  }

  if (!status.isGitRepo) {
    p.log.error(`  ✗ ${repoName} (not a git repo)`);
    return { status: "skipped", reason: "not a git repo" };
  }

  if (status.isDetached) {
    p.log.warn(`  ○ ${repoName} (detached HEAD)`);
    return { status: "skipped", reason: "detached HEAD" };
  }

  if (!status.tracking) {
    p.log.warn(`  ○ ${repoName} (no upstream)`);
    return { status: "skipped", reason: "no upstream tracking" };
  }

  if (status.isDirty && !options.force) {
    p.log.warn(`  ○ ${repoName} (dirty, use --force)`);
    return { status: "skipped", reason: "dirty working tree" };
  }

  if (options.dryRun) {
    p.log.info(`  ✓ ${repoName} (would update)`);
    return { status: "updated", commits: 0 };
  }

  try {
    // Fetch
    const s = p.spinner();
    s.start(`  ${repoName}: fetching...`);
    await fetchWithPrune(localPath, entry.defaultRemoteName);

    // Reset or pull based on strategy
    let commits = 0;
    if (entry.updateStrategy === "hard-reset") {
      commits = await resetHard(localPath);
      s.stop(`  ✓ ${repoName} (reset${commits > 0 ? `, ${commits} commits` : ""})`);
    } else {
      commits = await pullFastForward(localPath);
      s.stop(`  ✓ ${repoName} (ff-only${commits > 0 ? `, ${commits} commits` : ""})`);
    }

    // Submodules
    if (entry.submodules === "recursive") {
      try {
        await updateSubmodules(localPath);
      } catch {
        // Silent fail for submodules
      }
    }

    // LFS
    if (entry.lfs === "always" || (entry.lfs === "auto" && (await usesLfs(localPath)))) {
      try {
        await pullLfs(localPath, entry.defaultRemoteName);
      } catch {
        // Silent fail for LFS
      }
    }

    return { status: "updated", commits };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    p.log.error(`  ✗ ${repoName}: ${message}`);
    return { status: "error", error: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

function printSummary(summaries: UpdateSummary[], dryRun: boolean): void {
  const adopted = summaries.filter((s) => s.action === "adopted").length;
  const cloned = summaries.filter((s) => s.action === "cloned").length;
  const updated = summaries.filter((s) => s.action === "updated").length;
  const refreshed = summaries.filter((s) => s.action === "refreshed").length;
  const skipped = summaries.filter((s) => s.action === "skipped").length;
  const errors = summaries.filter((s) => s.action === "error").length;

  console.log("─".repeat(50));

  if (dryRun) {
    console.log("Would:");
  }

  const parts: string[] = [];
  if (adopted > 0) parts.push(`${adopted} adopted`);
  if (cloned > 0) parts.push(`${cloned} cloned`);
  if (refreshed > 0) parts.push(`${refreshed} refreshed`);
  if (updated > 0) parts.push(`${updated} updated`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  if (errors > 0) parts.push(`${errors} errors`);

  if (parts.length === 0) {
    console.log("Nothing to do.");
  } else {
    console.log(parts.join(", "));
  }
}
