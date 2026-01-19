import type { ParsedGitUrl } from "../types/index.js";

/**
 * Normalize a Git URL by stripping GitHub/GitLab web UI paths
 *
 * Converts URLs like:
 * - https://github.com/owner/repo/tree/main → https://github.com/owner/repo
 * - https://github.com/owner/repo/blob/main/file.ts → https://github.com/owner/repo
 */
export function normalizeGitUrl(url: string): string {
  // Strip GitHub/GitLab web UI paths (tree, blob, commit, pull, issues, etc.)
  return url.replace(
    /\/(tree|blob|commit|pull|issues|releases|tags|actions|wiki|discussions|security|pulse|graphs|network|settings)(\/.*)?$/,
    ""
  );
}

/**
 * Parse a Git URL (SSH or HTTPS) into its components
 *
 * Supports:
 * - SSH: git@github.com:owner/repo.git
 * - HTTPS: https://github.com/owner/repo.git
 * - HTTPS without .git: https://github.com/owner/repo
 * - GitHub web UI URLs (normalized automatically)
 */
export function parseGitUrl(url: string): ParsedGitUrl {
  // Normalize: trim whitespace and strip web UI paths
  url = normalizeGitUrl(url.trim());

  // SSH format: git@host:owner/repo.git
  const sshMatch = url.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    const [, host, owner, repo] = sshMatch;
    return {
      host,
      owner,
      repo,
      cloneUrl: url.endsWith(".git") ? url : `${url}.git`,
    };
  }

  // HTTPS format: https://host/owner/repo.git
  const httpsMatch = url.match(
    /^https?:\/\/([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/
  );
  if (httpsMatch) {
    const [, host, owner, repo] = httpsMatch;
    return {
      host,
      owner,
      repo,
      cloneUrl: url.endsWith(".git") ? url : `${url}.git`,
    };
  }

  throw new Error(
    `Invalid Git URL format: ${url}\n` +
      `Expected SSH (git@host:owner/repo.git) or HTTPS (https://host/owner/repo.git)`
  );
}

/**
 * Generate a unique ID for a repository
 * Format: host:owner/repo
 */
export function generateRepoId(parsed: ParsedGitUrl): string {
  return `${parsed.host}:${parsed.owner}/${parsed.repo}`;
}

/**
 * Validate that a string looks like a Git URL
 */
export function isValidGitUrl(url: string): boolean {
  try {
    parseGitUrl(url);
    return true;
  } catch {
    return false;
  }
}
