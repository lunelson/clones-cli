import type { ParsedGitUrl } from '../types/index.js';

/**
 * Normalize a Git URL by stripping extra path segments, queries, and hashes
 *
 * Converts URLs like:
 * - https://github.com/owner/repo/tree/main → https://github.com/owner/repo
 * - https://github.com/owner/repo/blob/main/file.ts → https://github.com/owner/repo
 */
export function normalizeGitUrl(url: string): string {
  const trimmed = url.trim();

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const parsed = new URL(trimmed);
      const segments = parsed.pathname.split('/').filter(Boolean);

      if (segments.length < 2) {
        return trimmed;
      }

      const owner = segments[0];
      const repo = segments[1];

      return `${parsed.protocol}//${parsed.host}/${owner}/${repo}`;
    } catch {
      return trimmed;
    }
  }

  return trimmed;
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
  const trimmed = url.trim();

  // SSH format: git@host:owner/repo.git
  const sshMatch = trimmed.match(/^git@([^:]+):(.+)$/);
  if (sshMatch) {
    const [, host, rawPath] = sshMatch;
    const path = rawPath.split(/[?#]/)[0];
    const segments = path.split('/').filter(Boolean);

    if (segments.length < 2) {
      throw new Error('Invalid Git URL format');
    }

    const owner = segments[0];
    const repoSegment = segments[1];
    const repo = repoSegment.endsWith('.git') ? repoSegment.slice(0, -4) : repoSegment;

    return {
      host,
      owner,
      repo,
      cloneUrl: `git@${host}:${owner}/${repo}.git`,
    };
  }

  // HTTPS format: https://host/owner/repo.git
  const normalized = normalizeGitUrl(trimmed);
  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      const parsed = new URL(normalized);
      const segments = parsed.pathname.split('/').filter(Boolean);

      if (segments.length < 2) {
        throw new Error('Invalid Git URL format');
      }

      const owner = segments[0];
      const repoSegment = segments[1];
      const repo = repoSegment.endsWith('.git') ? repoSegment.slice(0, -4) : repoSegment;

      return {
        host: parsed.host,
        owner,
        repo,
        cloneUrl: `${parsed.protocol}//${parsed.host}/${owner}/${repo}.git`,
      };
    } catch {
      // Fall through to error below
    }
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
