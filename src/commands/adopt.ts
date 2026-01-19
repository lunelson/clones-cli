import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { scanClonesDir, isNestedRepo } from "../lib/scan.js";
import { getRemoteUrl } from "../lib/git.js";
import { parseGitUrl, generateRepoId } from "../lib/url-parser.js";
import { readRegistry, writeRegistry, addEntry, findEntry } from "../lib/registry.js";
import { DEFAULTS, getClonesDir } from "../lib/config.js";
import type { RegistryEntry } from "../types/index.js";

export default defineCommand({
  meta: {
    name: "adopt",
    description: "Discover and adopt existing repositories in the clones directory",
  },
  args: {
    scan: {
      type: "boolean",
      description: "Only scan and report, don't add to registry",
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
    p.intro("clones adopt");

    const clonesDir = getClonesDir();
    p.log.info(`Scanning ${clonesDir}...`);

    // Scan for repositories
    const s = p.spinner();
    s.start("Discovering repositories...");

    const { discovered, skipped: scanSkipped } = await scanClonesDir();

    s.stop(`Found ${discovered.length} potential repositories`);

    if (discovered.length === 0) {
      p.log.warn("No repositories found in clones directory.");
      p.log.info(`Expected structure: ${clonesDir}/owner/repo/.git`);
      p.outro("Nothing to adopt");
      return;
    }

    // Load registry to check what's already tracked
    const registry = await readRegistry();

    // Categorize repos
    const toAdopt: {
      owner: string;
      repo: string;
      localPath: string;
      remoteUrl: string;
      parsed: ReturnType<typeof parseGitUrl>;
    }[] = [];
    const alreadyKnown: { owner: string; repo: string }[] = [];
    const skipped: { path: string; reason: string }[] = [...scanSkipped];

    for (const repo of discovered) {
      // Check if already in registry
      const existingById = registry.repos.find(
        (e) => e.owner === repo.owner && e.repo === repo.repo
      );

      if (existingById) {
        alreadyKnown.push({ owner: repo.owner, repo: repo.repo });
        continue;
      }

      // Check if it's a nested repo (submodule/worktree)
      if (await isNestedRepo(repo.localPath)) {
        skipped.push({
          path: repo.localPath,
          reason: "Appears to be a submodule or worktree",
        });
        continue;
      }

      // Get remote URL
      const remoteUrl = await getRemoteUrl(repo.localPath);

      if (!remoteUrl) {
        skipped.push({
          path: repo.localPath,
          reason: "No 'origin' remote configured",
        });
        continue;
      }

      // Parse the remote URL
      try {
        const parsed = parseGitUrl(remoteUrl);
        toAdopt.push({
          owner: repo.owner,
          repo: repo.repo,
          localPath: repo.localPath,
          remoteUrl,
          parsed,
        });
      } catch (error) {
        skipped.push({
          path: repo.localPath,
          reason: `Cannot parse remote URL: ${remoteUrl}`,
        });
      }
    }

    // Report findings
    p.log.info(`\n📊 Scan Results:`);
    p.log.info(`   New repos to adopt: ${toAdopt.length}`);
    p.log.info(`   Already in registry: ${alreadyKnown.length}`);
    p.log.info(`   Skipped: ${skipped.length}`);

    // Show details
    if (alreadyKnown.length > 0) {
      p.log.step(`\n✓ Already tracked:`);
      for (const r of alreadyKnown) {
        p.log.message(`   ${r.owner}/${r.repo}`);
      }
    }

    if (skipped.length > 0) {
      p.log.step(`\n⚠ Skipped:`);
      for (const s of skipped) {
        p.log.message(`   ${s.path}`);
        p.log.message(`   └─ ${s.reason}`);
      }
    }

    if (toAdopt.length === 0) {
      p.outro("Nothing new to adopt");
      return;
    }

    // Show repos to adopt
    p.log.step(`\n📦 Repos to adopt:`);
    for (const r of toAdopt) {
      p.log.message(`   ${r.owner}/${r.repo} (${r.parsed.host})`);
    }

    // If scan-only mode, stop here
    if (args.scan) {
      p.outro("Scan complete (--scan mode, no changes made)");
      return;
    }

    // Confirm adoption
    if (!args.yes) {
      const shouldContinue = await p.confirm({
        message: `Add ${toAdopt.length} repositories to registry?`,
      });

      if (p.isCancel(shouldContinue) || !shouldContinue) {
        p.outro("Cancelled");
        return;
      }
    }

    // Add repos to registry
    let updatedRegistry = registry;
    let adoptedCount = 0;

    for (const repo of toAdopt) {
      const repoId = generateRepoId(repo.parsed);

      // Double-check not already in registry (by ID)
      if (findEntry(updatedRegistry, repoId)) {
        p.log.warn(`${repo.owner}/${repo.repo}: Already exists with ID ${repoId}, skipping`);
        continue;
      }

      const entry: RegistryEntry = {
        id: repoId,
        host: repo.parsed.host,
        owner: repo.parsed.owner,
        repo: repo.parsed.repo,
        cloneUrl: repo.parsed.cloneUrl,
        defaultRemoteName: DEFAULTS.defaultRemoteName,
        updateStrategy: DEFAULTS.updateStrategy,
        submodules: DEFAULTS.submodules,
        lfs: DEFAULTS.lfs,
        addedAt: new Date().toISOString(),
        addedBy: "adopt",
        managed: true,
      };

      updatedRegistry = addEntry(updatedRegistry, entry);
      adoptedCount++;
      p.log.success(`Added ${repo.owner}/${repo.repo}`);
    }

    // Save registry
    if (adoptedCount > 0) {
      await writeRegistry(updatedRegistry);
      p.log.success(`\nRegistry updated with ${adoptedCount} new entries`);
    }

    p.outro("Done!");
  },
});
