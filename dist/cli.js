#!/usr/bin/env node
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// node_modules/tsup/assets/esm_shims.js
import path from "path";
import { fileURLToPath } from "url";
var init_esm_shims = __esm({
  "node_modules/tsup/assets/esm_shims.js"() {
    "use strict";
  }
});

// src/lib/url-parser.ts
function parseGitUrl(url) {
  url = url.trim();
  const sshMatch = url.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    const [, host, owner, repo] = sshMatch;
    return {
      host,
      owner,
      repo,
      cloneUrl: url.endsWith(".git") ? url : `${url}.git`
    };
  }
  const httpsMatch = url.match(
    /^https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/
  );
  if (httpsMatch) {
    const [, host, owner, repo] = httpsMatch;
    return {
      host,
      owner,
      repo,
      cloneUrl: url.endsWith(".git") ? url : `${url}.git`
    };
  }
  throw new Error(
    `Invalid Git URL format: ${url}
Expected SSH (git@host:owner/repo.git) or HTTPS (https://host/owner/repo.git)`
  );
}
function generateRepoId(parsed) {
  return `${parsed.host}:${parsed.owner}/${parsed.repo}`;
}
var init_url_parser = __esm({
  "src/lib/url-parser.ts"() {
    "use strict";
    init_esm_shims();
  }
});

// src/lib/config.ts
import { homedir } from "os";
import { join } from "path";
import { mkdir } from "fs/promises";
function getClonesDir() {
  return process.env.CLONES_DIR || join(homedir(), "Clones");
}
function getRegistryPath() {
  return join(getClonesDir(), "registry.json");
}
function getRepoPath(owner, repo) {
  return join(getClonesDir(), owner, repo);
}
async function ensureClonesDir() {
  const dir = getClonesDir();
  await mkdir(dir, { recursive: true });
}
var DEFAULTS;
var init_config = __esm({
  "src/lib/config.ts"() {
    "use strict";
    init_esm_shims();
    DEFAULTS = {
      updateStrategy: "hard-reset",
      submodules: "none",
      lfs: "auto",
      defaultRemoteName: "origin"
    };
  }
});

// src/lib/registry.ts
import { readFile, writeFile, rename } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join as join2 } from "path";
import { randomUUID } from "crypto";
function createEmptyRegistry() {
  return {
    version: "1.0.0",
    lastUpdated: (/* @__PURE__ */ new Date()).toISOString(),
    repos: []
  };
}
async function readRegistry() {
  const path2 = getRegistryPath();
  if (!existsSync(path2)) {
    return createEmptyRegistry();
  }
  try {
    const content = await readFile(path2, "utf-8");
    const data = JSON.parse(content);
    if (!data.version || !Array.isArray(data.repos)) {
      throw new Error("Invalid registry format");
    }
    return data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Registry file is corrupted: ${path2}`);
    }
    throw error;
  }
}
async function writeRegistry(registry) {
  await ensureClonesDir();
  const path2 = getRegistryPath();
  const tempPath = join2(dirname(path2), `.registry.${randomUUID()}.tmp`);
  registry.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
  const content = JSON.stringify(registry, null, 2);
  await writeFile(tempPath, content, "utf-8");
  await rename(tempPath, path2);
}
function findEntry(registry, id) {
  return registry.repos.find((entry) => entry.id === id);
}
function addEntry(registry, entry) {
  if (findEntry(registry, entry.id)) {
    throw new Error(`Repository already exists in registry: ${entry.id}`);
  }
  return {
    ...registry,
    repos: [...registry.repos, entry]
  };
}
function updateEntry(registry, id, updates) {
  const index = registry.repos.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new Error(`Repository not found in registry: ${id}`);
  }
  const updatedRepos = [...registry.repos];
  updatedRepos[index] = { ...updatedRepos[index], ...updates };
  return {
    ...registry,
    repos: updatedRepos
  };
}
function filterByTags(registry, tags) {
  if (tags.length === 0) return registry.repos;
  return registry.repos.filter(
    (entry) => entry.tags?.some((tag) => tags.includes(tag))
  );
}
function filterByPattern(registry, pattern) {
  const [ownerPattern, repoPattern] = pattern.split("/");
  return registry.repos.filter((entry) => {
    const ownerMatch = ownerPattern === "*" || entry.owner === ownerPattern;
    const repoMatch = !repoPattern || repoPattern === "*" || entry.repo === repoPattern;
    return ownerMatch && repoMatch;
  });
}
var init_registry = __esm({
  "src/lib/registry.ts"() {
    "use strict";
    init_esm_shims();
    init_config();
  }
});

// src/lib/git.ts
import { simpleGit } from "simple-git";
import { existsSync as existsSync2 } from "fs";
import { join as join3 } from "path";
async function cloneRepo(url, localPath, options = {}) {
  const git = simpleGit();
  const remoteName = options.remoteName || "origin";
  await git.clone(url, localPath, ["--origin", remoteName]);
}
async function fetchWithPrune(localPath, remoteName = "origin") {
  const git = simpleGit(localPath);
  await git.fetch(remoteName, ["--prune"]);
}
async function resetHard(localPath) {
  const git = simpleGit(localPath);
  const beforeLog = await git.log({ maxCount: 1 });
  const beforeHash = beforeLog.latest?.hash;
  await git.reset(["--hard", "@{u}"]);
  const afterLog = await git.log({ maxCount: 1 });
  const afterHash = afterLog.latest?.hash;
  if (beforeHash && afterHash && beforeHash !== afterHash) {
    try {
      const log4 = await git.log({ from: beforeHash, to: afterHash });
      return log4.total;
    } catch {
      return -1;
    }
  }
  return 0;
}
async function pullFastForward(localPath) {
  const git = simpleGit(localPath);
  const beforeLog = await git.log({ maxCount: 1 });
  const beforeHash = beforeLog.latest?.hash;
  await git.pull(["--ff-only"]);
  const afterLog = await git.log({ maxCount: 1 });
  const afterHash = afterLog.latest?.hash;
  if (beforeHash && afterHash && beforeHash !== afterHash) {
    try {
      const log4 = await git.log({ from: beforeHash, to: afterHash });
      return log4.total;
    } catch {
      return -1;
    }
  }
  return 0;
}
async function updateSubmodules(localPath) {
  const git = simpleGit(localPath);
  await git.submoduleUpdate(["--init", "--recursive"]);
}
async function getRepoStatus(localPath) {
  if (!existsSync2(localPath)) {
    return {
      exists: false,
      isGitRepo: false,
      currentBranch: null,
      isDetached: false,
      tracking: null,
      ahead: 0,
      behind: 0,
      isDirty: false
    };
  }
  if (!existsSync2(join3(localPath, ".git"))) {
    return {
      exists: true,
      isGitRepo: false,
      currentBranch: null,
      isDetached: false,
      tracking: null,
      ahead: 0,
      behind: 0,
      isDirty: false
    };
  }
  const git = simpleGit(localPath);
  try {
    const status = await git.status();
    return {
      exists: true,
      isGitRepo: true,
      currentBranch: status.current,
      isDetached: status.detached,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      isDirty: status.files.length > 0
    };
  } catch (error) {
    return {
      exists: true,
      isGitRepo: false,
      currentBranch: null,
      isDetached: false,
      tracking: null,
      ahead: 0,
      behind: 0,
      isDirty: false
    };
  }
}
async function usesLfs(localPath) {
  const gitattributes = join3(localPath, ".gitattributes");
  if (!existsSync2(gitattributes)) {
    return false;
  }
  try {
    const { readFile: readFile2 } = await import("fs/promises");
    const content = await readFile2(gitattributes, "utf-8");
    return content.includes("filter=lfs");
  } catch {
    return false;
  }
}
async function pullLfs(localPath, remoteName = "origin") {
  const git = simpleGit(localPath);
  await git.raw(["lfs", "pull", remoteName]);
}
var init_git = __esm({
  "src/lib/git.ts"() {
    "use strict";
    init_esm_shims();
  }
});

// src/commands/add.ts
var add_exports = {};
__export(add_exports, {
  default: () => add_default
});
import { defineCommand } from "citty";
import * as p from "@clack/prompts";
var add_default;
var init_add = __esm({
  "src/commands/add.ts"() {
    "use strict";
    init_esm_shims();
    init_url_parser();
    init_registry();
    init_git();
    init_config();
    add_default = defineCommand({
      meta: {
        name: "add",
        description: "Add a new clone by Git URL"
      },
      args: {
        url: {
          type: "positional",
          description: "Git URL (HTTPS or SSH)",
          required: true
        },
        tags: {
          type: "string",
          description: "Comma-separated tags"
        },
        description: {
          type: "string",
          description: "Human-readable description"
        },
        "update-strategy": {
          type: "string",
          description: "Update strategy: hard-reset (default) or ff-only"
        },
        submodules: {
          type: "string",
          description: "Submodule handling: none (default) or recursive"
        },
        lfs: {
          type: "string",
          description: "LFS handling: auto (default), always, or never"
        }
      },
      async run({ args }) {
        p.intro("clones add");
        let spinnerStarted = false;
        const s = p.spinner();
        try {
          const parsed = parseGitUrl(args.url);
          const repoId = generateRepoId(parsed);
          const localPath = getRepoPath(parsed.owner, parsed.repo);
          p.log.info(`Repository: ${parsed.owner}/${parsed.repo}`);
          p.log.info(`Host: ${parsed.host}`);
          const registry = await readRegistry();
          if (findEntry(registry, repoId)) {
            p.log.error(`Repository already exists in registry: ${repoId}`);
            p.log.info("Use 'clones update' to sync it, or 'clones rm' to remove it first.");
            process.exit(1);
          }
          const status = await getRepoStatus(localPath);
          if (status.exists) {
            p.log.error(`Local directory already exists: ${localPath}`);
            p.log.info("Use 'clones adopt' to add existing repos to the registry.");
            process.exit(1);
          }
          await ensureClonesDir();
          s.start(`Cloning ${parsed.owner}/${parsed.repo}...`);
          spinnerStarted = true;
          await cloneRepo(parsed.cloneUrl, localPath);
          s.stop(`Cloned to ${localPath}`);
          const tags = args.tags ? args.tags.split(",").map((t) => t.trim()) : void 0;
          const updateStrategy = args["update-strategy"] === "ff-only" ? "ff-only" : DEFAULTS.updateStrategy;
          const submodules = args.submodules === "recursive" ? "recursive" : DEFAULTS.submodules;
          const lfs = args.lfs === "always" ? "always" : args.lfs === "never" ? "never" : DEFAULTS.lfs;
          const entry = {
            id: repoId,
            host: parsed.host,
            owner: parsed.owner,
            repo: parsed.repo,
            cloneUrl: parsed.cloneUrl,
            description: args.description,
            tags,
            defaultRemoteName: DEFAULTS.defaultRemoteName,
            updateStrategy,
            submodules,
            lfs,
            addedAt: (/* @__PURE__ */ new Date()).toISOString(),
            addedBy: "manual",
            lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString(),
            managed: true
          };
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
      }
    });
  }
});

// src/commands/list.ts
var list_exports = {};
__export(list_exports, {
  default: () => list_default
});
import { defineCommand as defineCommand2 } from "citty";
import * as p2 from "@clack/prompts";
function outputJson(items) {
  const output = {
    version: "1.0.0",
    repos: items.map(({ entry, status, localPath }) => ({
      id: entry.id,
      owner: entry.owner,
      repo: entry.repo,
      localPath,
      cloneUrl: entry.cloneUrl,
      branch: status.currentBranch,
      tracking: status.tracking,
      behindCount: status.behind,
      aheadCount: status.ahead,
      isDirty: status.isDirty,
      isDetached: status.isDetached,
      hasUpstream: !!status.tracking,
      exists: status.exists,
      isGitRepo: status.isGitRepo,
      lastSyncedAt: entry.lastSyncedAt,
      tags: entry.tags,
      description: entry.description
    }))
  };
  console.log(JSON.stringify(output, null, 2));
}
function outputPretty(items, lastUpdated) {
  const clonesDir = getClonesDir();
  const shortDir = clonesDir.replace(process.env.HOME || "", "~");
  console.log();
  console.log(
    `Clones Registry (${items.length} repos, last updated ${formatDate(lastUpdated)})`
  );
  console.log();
  for (const { entry, status, localPath } of items) {
    const shortPath = localPath.replace(process.env.HOME || "", "~");
    console.log(`${entry.owner}/${entry.repo}`);
    console.log(`  Path: ${shortPath}`);
    console.log(`  URL: ${entry.cloneUrl}`);
    if (entry.tags && entry.tags.length > 0) {
      console.log(`  Tags: ${entry.tags.join(", ")}`);
    }
    if (entry.description) {
      console.log(`  Description: ${entry.description}`);
    }
    if (!status.exists) {
      console.log(`  Status: \u2717 Missing (not cloned)`);
    } else if (!status.isGitRepo) {
      console.log(`  Status: \u2717 Not a Git repository`);
    } else if (status.isDetached) {
      console.log(`  Branch: (detached HEAD)`);
      console.log(`  Status: \u26A0 Detached HEAD`);
    } else if (!status.tracking) {
      console.log(`  Branch: ${status.currentBranch} (no upstream)`);
      console.log(`  Status: \u26A0 No upstream tracking`);
    } else {
      const syncStatus = getSyncStatus(status, entry.lastSyncedAt);
      console.log(`  Branch: ${status.currentBranch} \u2192 ${status.tracking}`);
      console.log(`  Status: ${syncStatus}`);
    }
    console.log();
  }
}
function getSyncStatus(status, lastSyncedAt) {
  const parts = [];
  if (status.isDirty) {
    parts.push("\u2717 Dirty");
  }
  if (status.behind > 0) {
    parts.push(`${status.behind} behind`);
  }
  if (status.ahead > 0) {
    parts.push(`${status.ahead} ahead`);
  }
  if (parts.length === 0) {
    parts.push("\u2713 Clean");
  }
  if (lastSyncedAt) {
    parts.push(`(synced ${formatRelativeTime(lastSyncedAt)})`);
  }
  return parts.join(", ");
}
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function formatRelativeTime(isoString) {
  const date = new Date(isoString);
  const now = /* @__PURE__ */ new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 6e4);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return formatDate(isoString);
}
var list_default;
var init_list = __esm({
  "src/commands/list.ts"() {
    "use strict";
    init_esm_shims();
    init_registry();
    init_git();
    init_config();
    list_default = defineCommand2({
      meta: {
        name: "list",
        description: "List all tracked repositories"
      },
      args: {
        json: {
          type: "boolean",
          description: "Output as JSON"
        },
        tags: {
          type: "string",
          description: "Filter by tags (comma-separated)"
        },
        filter: {
          type: "string",
          description: "Filter by owner/repo pattern (supports wildcards)"
        }
      },
      async run({ args }) {
        const registry = await readRegistry();
        if (registry.repos.length === 0) {
          if (args.json) {
            console.log(JSON.stringify({ version: "1.0.0", repos: [] }, null, 2));
          } else {
            p2.log.info("No repositories in registry.");
            p2.log.info("Use 'clones add <url>' to add a repository.");
          }
          return;
        }
        let repos = registry.repos;
        if (args.tags) {
          const tags = args.tags.split(",").map((t) => t.trim());
          repos = filterByTags(registry, tags);
        }
        if (args.filter) {
          const filtered = filterByPattern(
            { ...registry, repos },
            args.filter
          );
          repos = filtered;
        }
        if (repos.length === 0) {
          if (args.json) {
            console.log(JSON.stringify({ version: "1.0.0", repos: [] }, null, 2));
          } else {
            p2.log.info("No repositories match the filter.");
          }
          return;
        }
        const items = await Promise.all(
          repos.map(async (entry) => {
            const localPath = getRepoPath(entry.owner, entry.repo);
            const status = await getRepoStatus(localPath);
            return { entry, status, localPath };
          })
        );
        if (args.json) {
          outputJson(items);
        } else {
          outputPretty(items, registry.lastUpdated);
        }
      }
    });
  }
});

// src/commands/update.ts
var update_exports = {};
__export(update_exports, {
  default: () => update_default
});
import { defineCommand as defineCommand3 } from "citty";
import * as p3 from "@clack/prompts";
async function updateRepo(entry, options) {
  const localPath = getRepoPath(entry.owner, entry.repo);
  const repoName = `${entry.owner}/${entry.repo}`;
  console.log();
  console.log(repoName);
  const status = await getRepoStatus(localPath);
  if (!status.exists) {
    p3.log.error("  \u2717 SKIPPED (directory missing)");
    return { status: "skipped", reason: "directory missing" };
  }
  if (!status.isGitRepo) {
    p3.log.error("  \u2717 SKIPPED (not a git repo)");
    return { status: "skipped", reason: "not a git repo" };
  }
  if (status.isDetached) {
    p3.log.error("  \u2717 SKIPPED (detached HEAD)");
    return { status: "skipped", reason: "detached HEAD" };
  }
  if (!status.tracking) {
    p3.log.error("  \u2717 SKIPPED (no upstream tracking)");
    return { status: "skipped", reason: "no upstream tracking" };
  }
  if (status.isDirty && !options.force) {
    p3.log.error("  \u2717 SKIPPED (dirty working tree)");
    p3.log.info("    Use --force to update anyway");
    return { status: "skipped", reason: "dirty working tree" };
  }
  if (options.dryRun) {
    p3.log.info("  \u2713 Would fetch and reset");
    return { status: "updated", commits: 0 };
  }
  try {
    const s = p3.spinner();
    s.start("  Fetching...");
    await fetchWithPrune(localPath, entry.defaultRemoteName);
    s.stop("  Fetched");
    let commits = 0;
    if (entry.updateStrategy === "hard-reset") {
      commits = await resetHard(localPath);
      p3.log.success(
        `  \u2713 Reset to ${status.tracking}${commits > 0 ? ` (${commits} commits)` : ""}`
      );
    } else {
      commits = await pullFastForward(localPath);
      p3.log.success(
        `  \u2713 Pulled (ff-only)${commits > 0 ? ` (${commits} commits)` : ""}`
      );
    }
    if (entry.submodules === "recursive") {
      try {
        await updateSubmodules(localPath);
        p3.log.info("  \u2713 Submodules updated");
      } catch (error) {
        p3.log.warn("  \u26A0 Submodule update failed");
      }
    }
    if (entry.lfs === "always" || entry.lfs === "auto" && await usesLfs(localPath)) {
      try {
        await pullLfs(localPath, entry.defaultRemoteName);
        p3.log.info("  \u2713 LFS pulled");
      } catch (error) {
        p3.log.warn("  \u26A0 LFS pull failed (is git-lfs installed?)");
      }
    }
    return { status: "updated", commits };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    p3.log.error(`  \u2717 ERROR: ${message}`);
    return { status: "error", error: message };
  }
}
function printSummary(summaries) {
  const updated = summaries.filter((s) => s.result.status === "updated").length;
  const skipped = summaries.filter((s) => s.result.status === "skipped").length;
  const errors = summaries.filter((s) => s.result.status === "error").length;
  console.log("\u2500".repeat(40));
  console.log(
    `Result: ${updated} updated, ${skipped} skipped, ${errors} errors`
  );
}
var update_default;
var init_update = __esm({
  "src/commands/update.ts"() {
    "use strict";
    init_esm_shims();
    init_registry();
    init_git();
    init_config();
    update_default = defineCommand3({
      meta: {
        name: "update",
        description: "Sync all tracked repositories"
      },
      args: {
        filter: {
          type: "string",
          description: "Filter by owner/repo pattern (supports wildcards)"
        },
        "dry-run": {
          type: "boolean",
          description: "Show what would be updated without making changes"
        },
        force: {
          type: "boolean",
          description: "Proceed even if working tree is dirty"
        }
      },
      async run({ args }) {
        p3.intro("clones update");
        let registry = await readRegistry();
        if (registry.repos.length === 0) {
          p3.log.info("No repositories in registry.");
          p3.log.info("Use 'clones add <url>' to add a repository.");
          p3.outro("Done!");
          return;
        }
        let repos = registry.repos.filter((r) => r.managed);
        if (args.filter) {
          repos = filterByPattern({ ...registry, repos }, args.filter);
        }
        if (repos.length === 0) {
          p3.log.info("No repositories match the filter.");
          p3.outro("Done!");
          return;
        }
        const dryRun = args["dry-run"] || false;
        const force = args.force || false;
        if (dryRun) {
          p3.log.warn("Dry run mode - no changes will be made");
        }
        const summaries = [];
        for (const entry of repos) {
          const result = await updateRepo(entry, { dryRun, force });
          summaries.push({ entry, result });
          if (!dryRun && result.status === "updated") {
            registry = updateEntry(registry, entry.id, {
              lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString()
            });
          }
        }
        if (!dryRun) {
          await writeRegistry(registry);
        }
        console.log();
        printSummary(summaries);
        p3.outro("Done!");
      }
    });
  }
});

// src/cli.ts
init_esm_shims();
import { defineCommand as defineCommand4, runMain } from "citty";
var main = defineCommand4({
  meta: {
    name: "clones",
    version: "1.0.0",
    description: "A read-only Git repository manager for exploration and reference"
  },
  subCommands: {
    add: () => Promise.resolve().then(() => (init_add(), add_exports)).then((m) => m.default),
    list: () => Promise.resolve().then(() => (init_list(), list_exports)).then((m) => m.default),
    update: () => Promise.resolve().then(() => (init_update(), update_exports)).then((m) => m.default)
  }
});
runMain(main);
//# sourceMappingURL=cli.js.map