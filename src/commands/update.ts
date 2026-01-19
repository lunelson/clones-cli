import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import {
  readRegistry,
  writeRegistry,
  updateEntry,
  filterByPattern,
} from "../lib/registry.js";
import {
  fetchWithPrune,
  resetHard,
  pullFastForward,
  getRepoStatus,
  updateSubmodules,
  usesLfs,
  pullLfs,
} from "../lib/git.js";
import { getRepoPath } from "../lib/config.js";
import type { RegistryEntry, UpdateResult } from "../types/index.js";

interface UpdateSummary {
  entry: RegistryEntry;
  result: UpdateResult;
}

export default defineCommand({
  meta: {
    name: "update",
    description: "Sync all tracked repositories",
  },
  args: {
    filter: {
      type: "string",
      description: "Filter by owner/repo pattern (supports wildcards)",
    },
    "dry-run": {
      type: "boolean",
      description: "Show what would be updated without making changes",
    },
    force: {
      type: "boolean",
      description: "Proceed even if working tree is dirty",
    },
  },
  async run({ args }) {
    p.intro("clones update");

    let registry = await readRegistry();

    if (registry.repos.length === 0) {
      p.log.info("No repositories in registry.");
      p.log.info("Use 'clones add <url>' to add a repository.");
      p.outro("Done!");
      return;
    }

    // Apply filter
    let repos = registry.repos.filter((r) => r.managed);

    if (args.filter) {
      repos = filterByPattern({ ...registry, repos }, args.filter);
    }

    if (repos.length === 0) {
      p.log.info("No repositories match the filter.");
      p.outro("Done!");
      return;
    }

    const dryRun = args["dry-run"] || false;
    const force = args.force || false;

    if (dryRun) {
      p.log.warn("Dry run mode - no changes will be made");
    }

    const summaries: UpdateSummary[] = [];

    for (const entry of repos) {
      const result = await updateRepo(entry, { dryRun, force });
      summaries.push({ entry, result });

      // Update registry with lastSyncedAt if successful
      if (!dryRun && result.status === "updated") {
        registry = updateEntry(registry, entry.id, {
          lastSyncedAt: new Date().toISOString(),
        });
      }
    }

    // Save registry
    if (!dryRun) {
      await writeRegistry(registry);
    }

    // Print summary
    console.log();
    printSummary(summaries);

    p.outro("Done!");
  },
});

async function updateRepo(
  entry: RegistryEntry,
  options: { dryRun: boolean; force: boolean }
): Promise<UpdateResult> {
  const localPath = getRepoPath(entry.owner, entry.repo);
  const repoName = `${entry.owner}/${entry.repo}`;

  console.log();
  console.log(repoName);

  // Check status
  const status = await getRepoStatus(localPath);

  if (!status.exists) {
    p.log.error("  \u2717 SKIPPED (directory missing)");
    return { status: "skipped", reason: "directory missing" };
  }

  if (!status.isGitRepo) {
    p.log.error("  \u2717 SKIPPED (not a git repo)");
    return { status: "skipped", reason: "not a git repo" };
  }

  if (status.isDetached) {
    p.log.error("  \u2717 SKIPPED (detached HEAD)");
    return { status: "skipped", reason: "detached HEAD" };
  }

  if (!status.tracking) {
    p.log.error("  \u2717 SKIPPED (no upstream tracking)");
    return { status: "skipped", reason: "no upstream tracking" };
  }

  if (status.isDirty && !options.force) {
    p.log.error("  \u2717 SKIPPED (dirty working tree)");
    p.log.info("    Use --force to update anyway");
    return { status: "skipped", reason: "dirty working tree" };
  }

  if (options.dryRun) {
    p.log.info("  \u2713 Would fetch and reset");
    return { status: "updated", commits: 0 };
  }

  try {
    // Fetch
    const s = p.spinner();
    s.start("  Fetching...");
    await fetchWithPrune(localPath, entry.defaultRemoteName);
    s.stop("  Fetched");

    // Reset or pull based on strategy
    let commits = 0;
    if (entry.updateStrategy === "hard-reset") {
      commits = await resetHard(localPath);
      p.log.success(
        `  \u2713 Reset to ${status.tracking}${commits > 0 ? ` (${commits} commits)` : ""}`
      );
    } else {
      commits = await pullFastForward(localPath);
      p.log.success(
        `  \u2713 Pulled (ff-only)${commits > 0 ? ` (${commits} commits)` : ""}`
      );
    }

    // Submodules
    if (entry.submodules === "recursive") {
      try {
        await updateSubmodules(localPath);
        p.log.info("  \u2713 Submodules updated");
      } catch (error) {
        p.log.warn("  \u26A0 Submodule update failed");
      }
    }

    // LFS
    if (entry.lfs === "always" || (entry.lfs === "auto" && (await usesLfs(localPath)))) {
      try {
        await pullLfs(localPath, entry.defaultRemoteName);
        p.log.info("  \u2713 LFS pulled");
      } catch (error) {
        p.log.warn("  \u26A0 LFS pull failed (is git-lfs installed?)");
      }
    }

    return { status: "updated", commits };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    p.log.error(`  \u2717 ERROR: ${message}`);
    return { status: "error", error: message };
  }
}

function printSummary(summaries: UpdateSummary[]): void {
  const updated = summaries.filter((s) => s.result.status === "updated").length;
  const skipped = summaries.filter((s) => s.result.status === "skipped").length;
  const errors = summaries.filter((s) => s.result.status === "error").length;

  console.log("─".repeat(40));
  console.log(
    `Result: ${updated} updated, ${skipped} skipped, ${errors} errors`
  );
}
