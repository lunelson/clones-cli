import { simpleGit, type SimpleGit, type StatusResult } from "simple-git";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { RepoStatus } from "../types/index.js";

/**
 * Clone a repository to a local path
 */
export async function cloneRepo(
  url: string,
  localPath: string,
  options: { remoteName?: string } = {}
): Promise<void> {
  const git = simpleGit();
  const remoteName = options.remoteName || "origin";

  await git.clone(url, localPath, ["--origin", remoteName]);
}

/**
 * Fetch from remote with prune
 */
export async function fetchWithPrune(
  localPath: string,
  remoteName: string = "origin"
): Promise<void> {
  const git = simpleGit(localPath);
  await git.fetch(remoteName, ["--prune"]);
}

/**
 * Reset to upstream tracking branch (hard reset)
 */
export async function resetHard(localPath: string): Promise<number> {
  const git = simpleGit(localPath);

  // Get current position before reset
  const beforeLog = await git.log({ maxCount: 1 });
  const beforeHash = beforeLog.latest?.hash;

  // Reset to upstream
  await git.reset(["--hard", "@{u}"]);

  // Get new position after reset
  const afterLog = await git.log({ maxCount: 1 });
  const afterHash = afterLog.latest?.hash;

  // Count commits between old and new position
  if (beforeHash && afterHash && beforeHash !== afterHash) {
    try {
      const log = await git.log({ from: beforeHash, to: afterHash });
      return log.total;
    } catch {
      // If we can't count (e.g., history rewrite), return -1
      return -1;
    }
  }

  return 0;
}

/**
 * Pull with fast-forward only
 */
export async function pullFastForward(localPath: string): Promise<number> {
  const git = simpleGit(localPath);

  const beforeLog = await git.log({ maxCount: 1 });
  const beforeHash = beforeLog.latest?.hash;

  await git.pull(["--ff-only"]);

  const afterLog = await git.log({ maxCount: 1 });
  const afterHash = afterLog.latest?.hash;

  if (beforeHash && afterHash && beforeHash !== afterHash) {
    try {
      const log = await git.log({ from: beforeHash, to: afterHash });
      return log.total;
    } catch {
      return -1;
    }
  }

  return 0;
}

/**
 * Update submodules recursively
 */
export async function updateSubmodules(localPath: string): Promise<void> {
  const git = simpleGit(localPath);
  await git.submoduleUpdate(["--init", "--recursive"]);
}

/**
 * Get the status of a local repository
 */
export async function getRepoStatus(localPath: string): Promise<RepoStatus> {
  // Check if directory exists
  if (!existsSync(localPath)) {
    return {
      exists: false,
      isGitRepo: false,
      currentBranch: null,
      isDetached: false,
      tracking: null,
      ahead: 0,
      behind: 0,
      isDirty: false,
    };
  }

  // Check if it's a git repo
  if (!existsSync(join(localPath, ".git"))) {
    return {
      exists: true,
      isGitRepo: false,
      currentBranch: null,
      isDetached: false,
      tracking: null,
      ahead: 0,
      behind: 0,
      isDirty: false,
    };
  }

  const git = simpleGit(localPath);

  try {
    const status: StatusResult = await git.status();

    return {
      exists: true,
      isGitRepo: true,
      currentBranch: status.current,
      isDetached: status.detached,
      tracking: status.tracking,
      ahead: status.ahead,
      behind: status.behind,
      isDirty: status.files.length > 0,
    };
  } catch (error) {
    // Corrupted git repo
    return {
      exists: true,
      isGitRepo: false,
      currentBranch: null,
      isDetached: false,
      tracking: null,
      ahead: 0,
      behind: 0,
      isDirty: false,
    };
  }
}

/**
 * Get the remote URL for a repository
 */
export async function getRemoteUrl(
  localPath: string,
  remoteName: string = "origin"
): Promise<string | null> {
  const git = simpleGit(localPath);

  try {
    const remotes = await git.getRemotes(true);
    const remote = remotes.find((r) => r.name === remoteName);
    return remote?.refs?.fetch || null;
  } catch {
    return null;
  }
}

/**
 * Check if a repository uses LFS (by checking .gitattributes)
 */
export async function usesLfs(localPath: string): Promise<boolean> {
  const gitattributes = join(localPath, ".gitattributes");
  if (!existsSync(gitattributes)) {
    return false;
  }

  try {
    const { readFile } = await import("node:fs/promises");
    const content = await readFile(gitattributes, "utf-8");
    return content.includes("filter=lfs");
  } catch {
    return false;
  }
}

/**
 * Pull LFS objects
 */
export async function pullLfs(
  localPath: string,
  remoteName: string = "origin"
): Promise<void> {
  const git = simpleGit(localPath);
  await git.raw(["lfs", "pull", remoteName]);
}
