import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  readRegistry,
  writeRegistry,
  removeEntry,
  findEntryByOwnerRepo,
  addTombstone,
} from "../lib/registry.js";
import { readLocalState, writeLocalState, removeRepoLocalState } from "../lib/local-state.js";
import { getRepoPath } from "../lib/config.js";

export default defineCommand({
  meta: {
    name: "rm",
    description: "Remove a repository from the registry (and optionally from disk)",
  },
  args: {
    repo: {
      type: "positional",
      description: "Repository identifier (owner/repo)",
      required: true,
    },
    "keep-disk": {
      type: "boolean",
      description: "Keep the local directory (only remove from registry)",
      default: false,
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip confirmation prompt",
      default: false,
    },
  },
  async run({ args }) {
    p.intro("clones rm");

    // Parse owner/repo from argument
    const parts = args.repo.split("/");
    if (parts.length !== 2) {
      p.log.error(`Invalid format: ${args.repo}`);
      p.log.info("Expected format: owner/repo");
      process.exit(1);
    }

    const [owner, repo] = parts;

    // Load registry
    const registry = await readRegistry();

    // Find entry
    const entry = findEntryByOwnerRepo(registry, owner, repo);

    if (!entry) {
      p.log.error(`Repository not found in registry: ${owner}/${repo}`);
      p.log.info("Use 'clones list' to see all tracked repositories.");
      process.exit(1);
    }

    // Check if local directory exists
    const localPath = getRepoPath(owner, repo);
    const diskExists = existsSync(localPath);

    // Show what will happen
    p.log.info(`Repository: ${owner}/${repo}`);
    p.log.info(`Registry ID: ${entry.id}`);
    p.log.info(`Local path: ${localPath}`);
    p.log.info(`On disk: ${diskExists ? "Yes" : "No (already deleted)"}`);

    // Determine actions
    const willDeleteFromRegistry = true;
    const willDeleteFromDisk = diskExists && !args["keep-disk"];

    p.log.step("\nActions to perform:");
    p.log.message(`   ✓ Remove from registry`);
    if (willDeleteFromDisk) {
      p.log.message(`   ✓ Delete local directory`);
    } else if (diskExists && args["keep-disk"]) {
      p.log.message(`   ○ Keep local directory (--keep-disk)`);
    } else if (!diskExists) {
      p.log.message(`   ○ Local directory doesn't exist`);
    }

    // Confirm
    if (!args.yes) {
      const message = willDeleteFromDisk
        ? `Remove ${owner}/${repo} from registry AND delete from disk?`
        : `Remove ${owner}/${repo} from registry?`;

      const shouldContinue = await p.confirm({
        message,
      });

      if (p.isCancel(shouldContinue) || !shouldContinue) {
        p.outro("Cancelled");
        return;
      }
    }

    // Delete from disk first (if needed)
    if (willDeleteFromDisk) {
      const s = p.spinner();
      s.start(`Deleting ${localPath}...`);

      try {
        await rm(localPath, { recursive: true, force: true });
        s.stop(`Deleted ${localPath}`);
      } catch (error) {
        s.stop("Failed to delete directory");
        p.log.error(error instanceof Error ? error.message : String(error));
        p.log.info("Registry entry was NOT removed. Fix the issue and try again.");
        process.exit(1);
      }
    }

    // Remove from registry
    try {
      let updatedRegistry = removeEntry(registry, entry.id);
      updatedRegistry = addTombstone(updatedRegistry, entry.id);
      await writeRegistry(updatedRegistry);
      p.log.success(`Removed ${owner}/${repo} from registry`);
      try {
        const localState = await readLocalState();
        const updatedLocalState = removeRepoLocalState(localState, entry.id);
        await writeLocalState(updatedLocalState);
      } catch (error) {
        p.log.warn(
          `Local state was not updated: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    } catch (error) {
      p.log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }

    p.outro("Done!");
  },
});
