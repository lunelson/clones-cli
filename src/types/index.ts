/**
 * Registry schema for clones-cli
 * Matches the PRD specification for registry.json
 */

export interface Registry {
  version: "1.0.0";
  lastUpdated: string; // ISO 8601 timestamp
  repos: RegistryEntry[];
}

export interface RegistryEntry {
  // Identity
  id: string; // Unique stable identifier (e.g., "github.com:colinhacks/zsh")
  host: string; // github.com | gitlab.com | bitbucket.org | custom-host.com
  owner: string; // Organization or user
  repo: string; // Repository name
  cloneUrl: string; // Full HTTPS or SSH URL

  // Metadata (optional)
  description?: string;
  tags?: string[];

  // Behavior
  defaultRemoteName: string; // Usually "origin"
  updateStrategy: "hard-reset" | "ff-only";
  submodules: "none" | "recursive";
  lfs: "auto" | "always" | "never";

  // Tracking
  addedAt: string; // ISO 8601
  addedBy: string; // "manual" | "auto-discovered" | hostname
  lastSyncedAt?: string; // ISO 8601

  // State
  managed: boolean; // If false, desired but not yet cloned
}

/**
 * Result of parsing a Git URL
 */
export interface ParsedGitUrl {
  host: string;
  owner: string;
  repo: string;
  cloneUrl: string;
}

/**
 * Local status of a repository
 */
export interface RepoStatus {
  exists: boolean;
  isGitRepo: boolean;
  currentBranch: string | null;
  isDetached: boolean;
  tracking: string | null;
  ahead: number;
  behind: number;
  isDirty: boolean;
}

/**
 * Result of an update operation for a single repo
 */
export type UpdateResult =
  | { status: "updated"; commits: number }
  | { status: "skipped"; reason: string }
  | { status: "error"; error: string };
