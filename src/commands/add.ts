import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { parseGitUrl, generateRepoId } from "../lib/url-parser.js";
import { readRegistry, writeRegistry, addEntry, findEntry } from "../lib/registry.js";
import { cloneRepo, getRepoStatus } from "../lib/git.js";
import { getRepoPath, getClonesDir, DEFAULTS, ensureClonesDir } from "../lib/config.js";
import { fetchGitHubMetadata } from "../lib/github.js";
import type { RegistryEntry } from "../types/index.js";

export default defineCommand({
  meta: {
    name: "add",
    description: "Add a new clone by Git URL",
  },
  args: {
    url: {
      type: "positional",
      description: "Git URL (HTTPS or SSH)",
      required: true,
    },
    tags: {
      type: "string",
      description: "Comma-separated tags",
    },
    description: {
      type: "string",
      description: "Human-readable description",
    },
    "update-strategy": {
      type: "string",
      description: "Update strategy: hard-reset (default) or ff-only",
    },
    submodules: {
      type: "string",
      description: "Submodule handling: none (default) or recursive",
    },
    lfs: {
      type: "string",
      description: "LFS handling: auto (default), always, or never",
    },
  },
  async run({ args }) {
    p.intro("clones add");

    let spinnerStarted = false;
    const s = p.spinner();

    try {
      // Parse the URL
      const parsed = parseGitUrl(args.url);
      const repoId = generateRepoId(parsed);
      const localPath = getRepoPath(parsed.owner, parsed.repo);

      p.log.info(`Repository: ${parsed.owner}/${parsed.repo}`);
      p.log.info(`Host: ${parsed.host}`);

      // Read current registry
      const registry = await readRegistry();

      // Check if already in registry
      if (findEntry(registry, repoId)) {
        p.log.error(`Repository already exists in registry: ${repoId}`);
        p.log.info("Use 'clones update' to sync it, or 'clones rm' to remove it first.");
        process.exit(1);
      }

      // Check if local directory already exists
      const status = await getRepoStatus(localPath);
      if (status.exists) {
        p.log.error(`Local directory already exists: ${localPath}`);
        p.log.info("Use 'clones adopt' to add existing repos to the registry.");
        process.exit(1);
      }

      // Ensure clones directory exists
      await ensureClonesDir();

      // Fetch GitHub metadata if no description provided
      let autoDescription: string | undefined;
      let autoTopics: string[] | undefined;

      if (parsed.host === "github.com" && !args.description) {
        s.start(`Fetching metadata from GitHub...`);
        spinnerStarted = true;
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

      // Clone the repository
      s.start(`Cloning ${parsed.owner}/${parsed.repo}...`);
      spinnerStarted = true;

      try {
        await cloneRepo(parsed.cloneUrl, localPath);
      } catch (cloneError) {
        s.stop("Clone failed");

        // Rollback: remove directories created by the failed clone
        if (!ownerExistedBefore && existsSync(ownerDir)) {
          try {
            await rm(ownerDir, { recursive: true, force: true });
          } catch {
            // Ignore cleanup errors
          }
        }

        throw cloneError;
      }

      s.stop(`Cloned to ${localPath}`);

      // Parse options - merge CLI args with auto-fetched metadata
      const userTags = args.tags
        ? args.tags.split(",").map((t: string) => t.trim())
        : undefined;

      // Use user-provided tags, or fall back to GitHub topics
      const tags = userTags || autoTopics;

      const updateStrategy =
        args["update-strategy"] === "ff-only" ? "ff-only" : DEFAULTS.updateStrategy;

      const submodules =
        args.submodules === "recursive" ? "recursive" : DEFAULTS.submodules;

      const lfs =
        args.lfs === "always"
          ? "always"
          : args.lfs === "never"
          ? "never"
          : DEFAULTS.lfs;

      // Create registry entry
      const entry: RegistryEntry = {
        id: repoId,
        host: parsed.host,
        owner: parsed.owner,
        repo: parsed.repo,
        cloneUrl: parsed.cloneUrl,
        description: args.description || autoDescription,
        tags,
        defaultRemoteName: DEFAULTS.defaultRemoteName,
        updateStrategy,
        submodules,
        lfs,
        addedAt: new Date().toISOString(),
        addedBy: "manual",
        lastSyncedAt: new Date().toISOString(),
        managed: true,
      };

      // Add to registry
      const updatedRegistry = addEntry(registry, entry);
      await writeRegistry(updatedRegistry);

      p.log.success(`Added ${parsed.owner}/${parsed.repo} to registry`);

      if (tags && tags.length > 0) {
        p.log.info(`Tags: ${tags.join(", ")}`);
      }

      p.outro("Done!");
    } catch (error) {
      if (spinnerStarted) {
        s.stop("Failed");
      }
      p.log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  },
});
