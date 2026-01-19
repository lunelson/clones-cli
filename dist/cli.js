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
function findEntryByOwnerRepo(registry, owner, repo) {
  return registry.repos.find(
    (entry) => entry.owner === owner && entry.repo === repo
  );
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
function removeEntry(registry, id) {
  const filtered = registry.repos.filter((entry) => entry.id !== id);
  if (filtered.length === registry.repos.length) {
    throw new Error(`Repository not found in registry: ${id}`);
  }
  return {
    ...registry,
    repos: filtered
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
      const log6 = await git.log({ from: beforeHash, to: afterHash });
      return log6.total;
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
      const log6 = await git.log({ from: beforeHash, to: afterHash });
      return log6.total;
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
async function getRemoteUrl(localPath, remoteName = "origin") {
  const git = simpleGit(localPath);
  try {
    const remotes = await git.getRemotes(true);
    const remote = remotes.find((r) => r.name === remoteName);
    return remote?.refs?.fetch || null;
  } catch {
    return null;
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

// src/lib/github.ts
async function fetchGitHubMetadata(owner, repo) {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "clones-cli"
        }
      }
    );
    if (!response.ok) {
      return null;
    }
    const data = await response.json();
    return {
      description: data.description,
      topics: data.topics || [],
      stargazers_count: data.stargazers_count,
      language: data.language,
      homepage: data.homepage
    };
  } catch {
    return null;
  }
}
var init_github = __esm({
  "src/lib/github.ts"() {
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
    init_github();
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
          let autoDescription;
          let autoTopics;
          if (parsed.host === "github.com" && !args.description) {
            s.start(`Fetching metadata from GitHub...`);
            spinnerStarted = true;
            const metadata = await fetchGitHubMetadata(parsed.owner, parsed.repo);
            if (metadata) {
              autoDescription = metadata.description || void 0;
              autoTopics = metadata.topics.length > 0 ? metadata.topics : void 0;
              s.stop("Metadata fetched");
            } else {
              s.stop("Could not fetch metadata (continuing without)");
            }
          }
          s.start(`Cloning ${parsed.owner}/${parsed.repo}...`);
          spinnerStarted = true;
          await cloneRepo(parsed.cloneUrl, localPath);
          s.stop(`Cloned to ${localPath}`);
          const userTags = args.tags ? args.tags.split(",").map((t) => t.trim()) : void 0;
          const tags = userTags || autoTopics;
          const updateStrategy = args["update-strategy"] === "ff-only" ? "ff-only" : DEFAULTS.updateStrategy;
          const submodules = args.submodules === "recursive" ? "recursive" : DEFAULTS.submodules;
          const lfs = args.lfs === "always" ? "always" : args.lfs === "never" ? "never" : DEFAULTS.lfs;
          const entry = {
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

// src/commands/rm.ts
var rm_exports = {};
__export(rm_exports, {
  default: () => rm_default
});
import { defineCommand as defineCommand3 } from "citty";
import * as p3 from "@clack/prompts";
import { rm } from "fs/promises";
import { existsSync as existsSync3 } from "fs";
var rm_default;
var init_rm = __esm({
  "src/commands/rm.ts"() {
    "use strict";
    init_esm_shims();
    init_registry();
    init_config();
    rm_default = defineCommand3({
      meta: {
        name: "rm",
        description: "Remove a repository from the registry (and optionally from disk)"
      },
      args: {
        repo: {
          type: "positional",
          description: "Repository identifier (owner/repo)",
          required: true
        },
        "keep-disk": {
          type: "boolean",
          description: "Keep the local directory (only remove from registry)",
          default: false
        },
        yes: {
          type: "boolean",
          alias: "y",
          description: "Skip confirmation prompt",
          default: false
        }
      },
      async run({ args }) {
        p3.intro("clones rm");
        const parts = args.repo.split("/");
        if (parts.length !== 2) {
          p3.log.error(`Invalid format: ${args.repo}`);
          p3.log.info("Expected format: owner/repo");
          process.exit(1);
        }
        const [owner, repo] = parts;
        const registry = await readRegistry();
        const entry = findEntryByOwnerRepo(registry, owner, repo);
        if (!entry) {
          p3.log.error(`Repository not found in registry: ${owner}/${repo}`);
          p3.log.info("Use 'clones list' to see all tracked repositories.");
          process.exit(1);
        }
        const localPath = getRepoPath(owner, repo);
        const diskExists = existsSync3(localPath);
        p3.log.info(`Repository: ${owner}/${repo}`);
        p3.log.info(`Registry ID: ${entry.id}`);
        p3.log.info(`Local path: ${localPath}`);
        p3.log.info(`On disk: ${diskExists ? "Yes" : "No (already deleted)"}`);
        const willDeleteFromRegistry = true;
        const willDeleteFromDisk = diskExists && !args["keep-disk"];
        p3.log.step("\nActions to perform:");
        p3.log.message(`   \u2713 Remove from registry`);
        if (willDeleteFromDisk) {
          p3.log.message(`   \u2713 Delete local directory`);
        } else if (diskExists && args["keep-disk"]) {
          p3.log.message(`   \u25CB Keep local directory (--keep-disk)`);
        } else if (!diskExists) {
          p3.log.message(`   \u25CB Local directory doesn't exist`);
        }
        if (!args.yes) {
          const message = willDeleteFromDisk ? `Remove ${owner}/${repo} from registry AND delete from disk?` : `Remove ${owner}/${repo} from registry?`;
          const shouldContinue = await p3.confirm({
            message
          });
          if (p3.isCancel(shouldContinue) || !shouldContinue) {
            p3.outro("Cancelled");
            return;
          }
        }
        if (willDeleteFromDisk) {
          const s = p3.spinner();
          s.start(`Deleting ${localPath}...`);
          try {
            await rm(localPath, { recursive: true, force: true });
            s.stop(`Deleted ${localPath}`);
          } catch (error) {
            s.stop("Failed to delete directory");
            p3.log.error(error instanceof Error ? error.message : String(error));
            p3.log.info("Registry entry was NOT removed. Fix the issue and try again.");
            process.exit(1);
          }
        }
        try {
          const updatedRegistry = removeEntry(registry, entry.id);
          await writeRegistry(updatedRegistry);
          p3.log.success(`Removed ${owner}/${repo} from registry`);
        } catch (error) {
          p3.log.error(error instanceof Error ? error.message : String(error));
          process.exit(1);
        }
        p3.outro("Done!");
      }
    });
  }
});

// src/lib/scan.ts
import { readdir, stat, lstat } from "fs/promises";
import { join as join4 } from "path";
import { existsSync as existsSync4 } from "fs";
async function isSymlink(path2) {
  try {
    const stats = await lstat(path2);
    return stats.isSymbolicLink();
  } catch {
    return false;
  }
}
async function isDirectory(path2) {
  try {
    const stats = await stat(path2);
    return stats.isDirectory();
  } catch {
    return false;
  }
}
async function scanClonesDir() {
  const clonesDir = getClonesDir();
  const discovered = [];
  const skipped = [];
  if (!existsSync4(clonesDir)) {
    return { discovered, skipped };
  }
  let ownerDirs;
  try {
    ownerDirs = await readdir(clonesDir);
  } catch (error) {
    skipped.push({
      path: clonesDir,
      reason: `Cannot read directory: ${error instanceof Error ? error.message : String(error)}`
    });
    return { discovered, skipped };
  }
  for (const owner of ownerDirs) {
    if (owner.startsWith(".") || owner === "registry.json") {
      continue;
    }
    const ownerPath = join4(clonesDir, owner);
    if (await isSymlink(ownerPath)) {
      skipped.push({ path: ownerPath, reason: "Symlink (skipped)" });
      continue;
    }
    if (!await isDirectory(ownerPath)) {
      continue;
    }
    let repoDirs;
    try {
      repoDirs = await readdir(ownerPath);
    } catch (error) {
      skipped.push({
        path: ownerPath,
        reason: `Cannot read directory: ${error instanceof Error ? error.message : String(error)}`
      });
      continue;
    }
    for (const repo of repoDirs) {
      if (repo.startsWith(".")) {
        continue;
      }
      const repoPath = join4(ownerPath, repo);
      if (await isSymlink(repoPath)) {
        skipped.push({ path: repoPath, reason: "Symlink (skipped)" });
        continue;
      }
      if (!await isDirectory(repoPath)) {
        continue;
      }
      const gitPath = join4(repoPath, ".git");
      const hasGit = existsSync4(gitPath);
      if (!hasGit) {
        skipped.push({ path: repoPath, reason: "No .git directory" });
        continue;
      }
      discovered.push({
        owner,
        repo,
        localPath: repoPath,
        hasGit: true
      });
    }
  }
  return { discovered, skipped };
}
async function isNestedRepo(localPath) {
  const gitPath = join4(localPath, ".git");
  try {
    const stats = await lstat(gitPath);
    if (stats.isFile()) {
      return true;
    }
    const clonesDir = getClonesDir();
    let current = localPath;
    while (current !== clonesDir && current !== "/") {
      const parent = join4(current, "..");
      const parentGit = join4(parent, ".git");
      if (existsSync4(parentGit) && parent !== clonesDir) {
        return true;
      }
      current = parent;
    }
    return false;
  } catch {
    return false;
  }
}
var init_scan = __esm({
  "src/lib/scan.ts"() {
    "use strict";
    init_esm_shims();
    init_config();
  }
});

// src/commands/sync.ts
var sync_exports = {};
__export(sync_exports, {
  default: () => sync_default
});
import { defineCommand as defineCommand4 } from "citty";
import * as p4 from "@clack/prompts";
async function adoptPhase(registry, options) {
  const adopted = [];
  let updatedRegistry = registry;
  const { discovered } = await scanClonesDir();
  for (const repo of discovered) {
    const existing = registry.repos.find(
      (e) => e.owner === repo.owner && e.repo === repo.repo
    );
    if (existing) {
      continue;
    }
    if (await isNestedRepo(repo.localPath)) {
      continue;
    }
    const remoteUrl = await getRemoteUrl(repo.localPath);
    if (!remoteUrl) {
      continue;
    }
    let parsed;
    try {
      parsed = parseGitUrl(remoteUrl);
    } catch {
      continue;
    }
    const repoId = generateRepoId(parsed);
    if (findEntry(updatedRegistry, repoId)) {
      continue;
    }
    if (!options.dryRun) {
      let description;
      let tags;
      if (parsed.host === "github.com") {
        const metadata = await fetchGitHubMetadata(parsed.owner, parsed.repo);
        if (metadata) {
          description = metadata.description || void 0;
          tags = metadata.topics.length > 0 ? metadata.topics : void 0;
        }
      }
      const entry = {
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
        addedAt: (/* @__PURE__ */ new Date()).toISOString(),
        addedBy: "adopt",
        managed: true
      };
      updatedRegistry = addEntry(updatedRegistry, entry);
    }
    adopted.push({ owner: repo.owner, repo: repo.repo });
    p4.log.info(`  + ${repo.owner}/${repo.repo}`);
  }
  return { adopted, registry: updatedRegistry };
}
async function clonePhase(registry, options) {
  const cloned = [];
  const errors = [];
  for (const entry of registry.repos) {
    if (!entry.managed) continue;
    const localPath = getRepoPath(entry.owner, entry.repo);
    const status = await getRepoStatus(localPath);
    if (status.exists && status.isGitRepo) {
      continue;
    }
    const name = `${entry.owner}/${entry.repo}`;
    if (options.dryRun) {
      p4.log.info(`  + ${name} (would clone)`);
      cloned.push({ owner: entry.owner, repo: entry.repo });
      continue;
    }
    const s = p4.spinner();
    s.start(`  Cloning ${name}...`);
    try {
      await cloneRepo(entry.cloneUrl, localPath, {
        remoteName: entry.defaultRemoteName
      });
      s.stop(`  + ${name} (cloned)`);
      cloned.push({ owner: entry.owner, repo: entry.repo });
    } catch (error) {
      s.stop(`  \u2717 ${name} (clone failed)`);
      errors.push({
        name,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  return { cloned, errors };
}
async function updateRepo(entry, options) {
  const localPath = getRepoPath(entry.owner, entry.repo);
  const repoName = `${entry.owner}/${entry.repo}`;
  const status = await getRepoStatus(localPath);
  if (!status.exists) {
    p4.log.error(`  \u2717 ${repoName} (missing)`);
    return { status: "skipped", reason: "directory missing" };
  }
  if (!status.isGitRepo) {
    p4.log.error(`  \u2717 ${repoName} (not a git repo)`);
    return { status: "skipped", reason: "not a git repo" };
  }
  if (status.isDetached) {
    p4.log.warn(`  \u25CB ${repoName} (detached HEAD)`);
    return { status: "skipped", reason: "detached HEAD" };
  }
  if (!status.tracking) {
    p4.log.warn(`  \u25CB ${repoName} (no upstream)`);
    return { status: "skipped", reason: "no upstream tracking" };
  }
  if (status.isDirty && !options.force) {
    p4.log.warn(`  \u25CB ${repoName} (dirty, use --force)`);
    return { status: "skipped", reason: "dirty working tree" };
  }
  if (options.dryRun) {
    p4.log.info(`  \u2713 ${repoName} (would update)`);
    return { status: "updated", commits: 0 };
  }
  try {
    const s = p4.spinner();
    s.start(`  ${repoName}: fetching...`);
    await fetchWithPrune(localPath, entry.defaultRemoteName);
    let commits = 0;
    if (entry.updateStrategy === "hard-reset") {
      commits = await resetHard(localPath);
      s.stop(`  \u2713 ${repoName} (reset${commits > 0 ? `, ${commits} commits` : ""})`);
    } else {
      commits = await pullFastForward(localPath);
      s.stop(`  \u2713 ${repoName} (ff-only${commits > 0 ? `, ${commits} commits` : ""})`);
    }
    if (entry.submodules === "recursive") {
      try {
        await updateSubmodules(localPath);
      } catch {
      }
    }
    if (entry.lfs === "always" || entry.lfs === "auto" && await usesLfs(localPath)) {
      try {
        await pullLfs(localPath, entry.defaultRemoteName);
      } catch {
      }
    }
    return { status: "updated", commits };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    p4.log.error(`  \u2717 ${repoName}: ${message}`);
    return { status: "error", error: message };
  }
}
function printSummary(summaries, dryRun) {
  const adopted = summaries.filter((s) => s.action === "adopted").length;
  const cloned = summaries.filter((s) => s.action === "cloned").length;
  const updated = summaries.filter((s) => s.action === "updated").length;
  const refreshed = summaries.filter((s) => s.action === "refreshed").length;
  const skipped = summaries.filter((s) => s.action === "skipped").length;
  const errors = summaries.filter((s) => s.action === "error").length;
  console.log("\u2500".repeat(50));
  if (dryRun) {
    console.log("Would:");
  }
  const parts = [];
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
var sync_default;
var init_sync = __esm({
  "src/commands/sync.ts"() {
    "use strict";
    init_esm_shims();
    init_registry();
    init_git();
    init_config();
    init_scan();
    init_url_parser();
    init_github();
    sync_default = defineCommand4({
      meta: {
        name: "sync",
        description: "Synchronize registry and clones (adopt, clone missing, fetch/reset)"
      },
      args: {
        filter: {
          type: "string",
          description: "Filter by owner/repo pattern (supports wildcards)"
        },
        "dry-run": {
          type: "boolean",
          description: "Show what would happen without making changes"
        },
        force: {
          type: "boolean",
          description: "Proceed even if working tree is dirty"
        },
        refresh: {
          type: "boolean",
          description: "Refresh metadata (description, tags) from GitHub for all repos"
        }
      },
      async run({ args }) {
        p4.intro("clones sync");
        const dryRun = args["dry-run"] || false;
        const force = args.force || false;
        if (dryRun) {
          p4.log.warn("Dry run mode - no changes will be made");
        }
        let registry = await readRegistry();
        const summaries = [];
        p4.log.step("Phase 1: Discovering untracked repos...");
        const { adopted, registry: registryAfterAdopt } = await adoptPhase(
          registry,
          { dryRun }
        );
        registry = registryAfterAdopt;
        for (const repo of adopted) {
          summaries.push({
            name: `${repo.owner}/${repo.repo}`,
            action: "adopted"
          });
        }
        if (adopted.length === 0) {
          p4.log.info("  No untracked repos found");
        } else {
          p4.log.success(`  ${adopted.length} repo(s) ${dryRun ? "would be" : ""} adopted`);
        }
        p4.log.step("Phase 2: Cloning missing repos...");
        const { cloned, errors: cloneErrors } = await clonePhase(registry, { dryRun });
        for (const repo of cloned) {
          summaries.push({
            name: `${repo.owner}/${repo.repo}`,
            action: "cloned"
          });
        }
        for (const err of cloneErrors) {
          summaries.push({
            name: err.name,
            action: "error",
            detail: err.error
          });
        }
        if (cloned.length === 0 && cloneErrors.length === 0) {
          p4.log.info("  No missing repos to clone");
        } else {
          if (cloned.length > 0) {
            p4.log.success(`  ${cloned.length} repo(s) ${dryRun ? "would be" : ""} cloned`);
          }
          if (cloneErrors.length > 0) {
            p4.log.error(`  ${cloneErrors.length} clone error(s)`);
          }
        }
        p4.log.step("Phase 3: Updating repos...");
        let reposToUpdate = registry.repos.filter((r) => r.managed);
        if (args.filter) {
          reposToUpdate = filterByPattern({ ...registry, repos: reposToUpdate }, args.filter);
          p4.log.info(`  Filtering to: ${args.filter}`);
        }
        if (reposToUpdate.length === 0) {
          p4.log.info("  No repos to update");
        } else {
          for (const entry of reposToUpdate) {
            const result = await updateRepo(entry, { dryRun, force });
            const name = `${entry.owner}/${entry.repo}`;
            if (result.status === "updated") {
              summaries.push({
                name,
                action: "updated",
                detail: result.commits ? `${result.commits} commits` : void 0
              });
              if (!dryRun) {
                registry = updateEntry(registry, entry.id, {
                  lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString()
                });
              }
            } else if (result.status === "skipped") {
              summaries.push({
                name,
                action: "skipped",
                detail: result.reason
              });
            } else {
              summaries.push({
                name,
                action: "error",
                detail: result.error
              });
            }
          }
        }
        if (args.refresh) {
          p4.log.step("Phase 4: Refreshing metadata from GitHub...");
          const githubRepos = registry.repos.filter((r) => r.host === "github.com");
          if (githubRepos.length === 0) {
            p4.log.info("  No GitHub repos to refresh");
          } else {
            for (const entry of githubRepos) {
              const name = `${entry.owner}/${entry.repo}`;
              if (dryRun) {
                p4.log.info(`  \u21BB ${name} (would refresh)`);
                summaries.push({ name, action: "refreshed" });
                continue;
              }
              const metadata = await fetchGitHubMetadata(entry.owner, entry.repo);
              if (metadata) {
                const newDescription = metadata.description || void 0;
                const newTags = metadata.topics.length > 0 ? metadata.topics : void 0;
                const descChanged = entry.description !== newDescription;
                const tagsChanged = JSON.stringify(entry.tags) !== JSON.stringify(newTags);
                if (descChanged || tagsChanged) {
                  registry = updateEntry(registry, entry.id, {
                    description: newDescription,
                    tags: newTags
                  });
                  p4.log.info(`  \u21BB ${name} (refreshed)`);
                  summaries.push({ name, action: "refreshed" });
                } else {
                  p4.log.info(`  \u25CB ${name} (unchanged)`);
                }
              } else {
                p4.log.warn(`  \u25CB ${name} (could not fetch)`);
              }
            }
          }
        }
        if (!dryRun) {
          await writeRegistry(registry);
        }
        console.log();
        printSummary(summaries, dryRun);
        p4.outro("Done!");
      }
    });
  }
});

// src/commands/browse.ts
var browse_exports = {};
__export(browse_exports, {
  default: () => browse_default
});
import { defineCommand as defineCommand5 } from "citty";
import * as p5 from "@clack/prompts";
import search from "@inquirer/search";
import { exec } from "child_process";
import { promisify } from "util";
async function mainMenu() {
  p5.intro("clones");
  while (true) {
    const registry = await readRegistry();
    const repoCount = registry.repos.length;
    const action = await p5.select({
      message: "What would you like to do?",
      options: [
        {
          value: "browse",
          label: "Browse repositories",
          hint: repoCount > 0 ? `${repoCount} repos` : "none yet"
        },
        { value: "add", label: "Add a new clone" },
        { value: "sync", label: "Sync all clones" },
        { value: "exit", label: "Exit" }
      ]
    });
    if (p5.isCancel(action) || action === "exit") {
      p5.outro("Goodbye!");
      return;
    }
    switch (action) {
      case "browse":
        if (repoCount === 0) {
          p5.log.warn("No repositories yet. Add one first!");
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
}
async function browseRepos(registry) {
  const s = p5.spinner();
  s.start("Loading repositories...");
  const repos = await Promise.all(
    registry.repos.map(async (entry) => {
      const localPath = getRepoPath(entry.owner, entry.repo);
      const status = await getRepoStatus(localPath);
      return { entry, status, localPath };
    })
  );
  s.stop(`${repos.length} repositories loaded`);
  try {
    const selected = await search({
      message: "Select a repository (type to filter)",
      source: async (input) => {
        const term = (input || "").toLowerCase();
        const filtered = repos.filter((r) => {
          const name = `${r.entry.owner}/${r.entry.repo}`.toLowerCase();
          const tags = r.entry.tags?.join(" ").toLowerCase() || "";
          return name.includes(term) || tags.includes(term);
        });
        return filtered.map((r) => {
          const hints = [];
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
            description: hints.length > 0 ? hints.join(" \xB7 ") : void 0
          };
        });
      }
    });
    await showRepoDetails(selected);
  } catch (error) {
    if (error.message?.includes("User force closed")) {
      return;
    }
    throw error;
  }
}
async function showRepoDetails(repo) {
  const shortPath = repo.localPath.replace(process.env.HOME || "", "~");
  console.log();
  console.log(`  ${repo.entry.owner}/${repo.entry.repo}`);
  console.log(`  ${"\u2500".repeat(40)}`);
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
  if (!repo.status.exists) {
    console.log(`  Status: \u2717 Missing`);
  } else if (!repo.status.isGitRepo) {
    console.log(`  Status: \u2717 Not a git repo`);
  } else if (repo.status.isDirty) {
    console.log(`  Status: \u25CF Dirty`);
  } else {
    console.log(`  Status: \u2713 Clean`);
  }
  if (repo.entry.lastSyncedAt) {
    console.log(`  Synced: ${formatRelativeTime2(repo.entry.lastSyncedAt)}`);
  }
  console.log();
  const action = await p5.select({
    message: "What would you like to do?",
    options: [
      { value: "copy", label: "Copy path to clipboard" },
      { value: "edit-tags", label: "Edit tags" },
      { value: "edit-desc", label: "Edit description" },
      { value: "back", label: "Back to menu" }
    ]
  });
  if (p5.isCancel(action) || action === "back") {
    return;
  }
  const registry = await readRegistry();
  switch (action) {
    case "copy":
      await copyToClipboard(repo.localPath);
      p5.log.success(`Copied: ${repo.localPath}`);
      break;
    case "edit-tags":
      await editTags(repo, registry);
      break;
    case "edit-desc":
      await editDescription(repo, registry);
      break;
  }
}
async function editTags(repo, registry) {
  const currentTags = repo.entry.tags?.join(", ") || "";
  const newTags = await p5.text({
    message: "Enter tags (comma-separated)",
    initialValue: currentTags,
    placeholder: "cli, typescript, framework"
  });
  if (p5.isCancel(newTags)) {
    return;
  }
  const tags = newTags ? newTags.split(",").map((t) => t.trim()).filter((t) => t.length > 0) : void 0;
  const updatedRegistry = updateEntry(registry, repo.entry.id, { tags });
  await writeRegistry(updatedRegistry);
  p5.log.success(`Tags updated for ${repo.entry.owner}/${repo.entry.repo}`);
}
async function editDescription(repo, registry) {
  const newDesc = await p5.text({
    message: "Enter description",
    initialValue: repo.entry.description || "",
    placeholder: "A brief description of this repository"
  });
  if (p5.isCancel(newDesc)) {
    return;
  }
  const description = newDesc || void 0;
  const updatedRegistry = updateEntry(registry, repo.entry.id, { description });
  await writeRegistry(updatedRegistry);
  p5.log.success(`Description updated for ${repo.entry.owner}/${repo.entry.repo}`);
}
async function addNewClone() {
  const url = await p5.text({
    message: "Enter Git URL (HTTPS or SSH)",
    placeholder: "https://github.com/owner/repo"
  });
  if (p5.isCancel(url) || !url) {
    return;
  }
  let parsed;
  try {
    parsed = parseGitUrl(url);
  } catch (error) {
    p5.log.error(`Invalid Git URL: ${url}`);
    return;
  }
  const repoId = generateRepoId(parsed);
  const localPath = getRepoPath(parsed.owner, parsed.repo);
  p5.log.info(`Repository: ${parsed.owner}/${parsed.repo}`);
  p5.log.info(`Host: ${parsed.host}`);
  const registry = await readRegistry();
  if (registry.repos.find((e) => e.id === repoId)) {
    p5.log.error(`Already in registry: ${repoId}`);
    return;
  }
  const status = await getRepoStatus(localPath);
  if (status.exists) {
    p5.log.error(`Directory already exists: ${localPath}`);
    p5.log.info("It will be adopted on next sync.");
    return;
  }
  await ensureClonesDir();
  const s = p5.spinner();
  let autoDescription;
  let autoTopics;
  if (parsed.host === "github.com") {
    s.start(`Fetching metadata from GitHub...`);
    const metadata = await fetchGitHubMetadata(parsed.owner, parsed.repo);
    if (metadata) {
      autoDescription = metadata.description || void 0;
      autoTopics = metadata.topics.length > 0 ? metadata.topics : void 0;
      s.stop("Metadata fetched");
    } else {
      s.stop("Could not fetch metadata (continuing without)");
    }
  }
  s.start(`Cloning ${parsed.owner}/${parsed.repo}...`);
  try {
    await cloneRepo(parsed.cloneUrl, localPath);
    s.stop(`Cloned to ${localPath}`);
  } catch (error) {
    s.stop("Clone failed");
    p5.log.error(error instanceof Error ? error.message : String(error));
    return;
  }
  const entry = {
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
    addedAt: (/* @__PURE__ */ new Date()).toISOString(),
    addedBy: "manual",
    lastSyncedAt: (/* @__PURE__ */ new Date()).toISOString(),
    managed: true
  };
  const updatedRegistry = addEntry(registry, entry);
  await writeRegistry(updatedRegistry);
  p5.log.success(`Added ${parsed.owner}/${parsed.repo} to registry`);
}
async function runSync() {
  p5.log.info("Running sync...");
  console.log();
  const { default: syncCommand } = await Promise.resolve().then(() => (init_sync(), sync_exports));
  await syncCommand.run?.({ args: {} });
}
async function copyToClipboard(text2) {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      await execAsync(`echo -n ${JSON.stringify(text2)} | pbcopy`);
    } else if (platform === "linux") {
      try {
        await execAsync(`echo -n ${JSON.stringify(text2)} | xclip -selection clipboard`);
      } catch {
        await execAsync(`echo -n ${JSON.stringify(text2)} | xsel --clipboard --input`);
      }
    } else if (platform === "win32") {
      await execAsync(`echo ${JSON.stringify(text2)} | clip`);
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (error) {
    throw new Error(`Could not copy to clipboard. Path: ${text2}`);
  }
}
function formatRelativeTime2(isoString) {
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
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}
var execAsync, browse_default;
var init_browse = __esm({
  "src/commands/browse.ts"() {
    "use strict";
    init_esm_shims();
    init_registry();
    init_git();
    init_config();
    init_url_parser();
    init_github();
    execAsync = promisify(exec);
    browse_default = defineCommand5({
      meta: {
        name: "browse",
        description: "Interactively browse and manage clones"
      },
      args: {},
      async run() {
        await mainMenu();
      }
    });
  }
});

// src/cli.ts
init_esm_shims();
import { defineCommand as defineCommand6, runMain } from "citty";
var main = defineCommand6({
  meta: {
    name: "clones",
    version: "1.0.0",
    description: "A read-only Git repository manager for exploration and reference"
  },
  subCommands: {
    add: () => Promise.resolve().then(() => (init_add(), add_exports)).then((m) => m.default),
    list: () => Promise.resolve().then(() => (init_list(), list_exports)).then((m) => m.default),
    rm: () => Promise.resolve().then(() => (init_rm(), rm_exports)).then((m) => m.default),
    sync: () => Promise.resolve().then(() => (init_sync(), sync_exports)).then((m) => m.default)
  },
  // Default: run interactive browser when no subcommand given
  async run() {
    const { default: browse } = await Promise.resolve().then(() => (init_browse(), browse_exports));
    await browse.run?.({ args: {} });
  }
});
runMain(main);
//# sourceMappingURL=cli.js.map