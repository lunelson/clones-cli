import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { formatPathsForClipboard, type RepoInfo } from "../../../src/lib/browse/batch-actions.js";
import type { RegistryEntry, RepoStatus } from "../../../src/types/index.js";

// Helper to create mock registry entry
function mockEntry(overrides: Partial<RegistryEntry> = {}): RegistryEntry {
  return {
    id: "github.com:owner/repo",
    host: "github.com",
    owner: "owner",
    repo: "repo",
    cloneUrl: "https://github.com/owner/repo.git",
    defaultRemoteName: "origin",
    updateStrategy: "ff-only",
    submodules: "none",
    lfs: "auto",
    addedAt: new Date().toISOString(),
    addedBy: "manual",
    managed: true,
    ...overrides,
  };
}

// Helper to create mock repo status
function mockStatus(overrides: Partial<RepoStatus> = {}): RepoStatus {
  return {
    exists: true,
    isGitRepo: true,
    currentBranch: "main",
    isDetached: false,
    tracking: "origin/main",
    ahead: 0,
    behind: 0,
    isDirty: false,
    ...overrides,
  };
}

// Helper to create mock RepoInfo
function mockRepoInfo(overrides: { entry?: Partial<RegistryEntry>; status?: Partial<RepoStatus>; localPath?: string } = {}): RepoInfo {
  return {
    entry: mockEntry(overrides.entry),
    status: mockStatus(overrides.status),
    localPath: overrides.localPath ?? "/Users/testuser/code/owner/repo",
  };
}

describe("formatPathsForClipboard", () => {
  const originalHome = process.env.HOME;

  beforeEach(() => {
    process.env.HOME = "/Users/testuser";
  });

  afterEach(() => {
    process.env.HOME = originalHome;
  });

  it("formats a single path with ~ for home", () => {
    const repos = [mockRepoInfo({ localPath: "/Users/testuser/code/foo/bar" })];
    expect(formatPathsForClipboard(repos)).toBe("~/code/foo/bar");
  });

  it("joins multiple paths with newlines", () => {
    const repos = [
      mockRepoInfo({ localPath: "/Users/testuser/code/foo/bar" }),
      mockRepoInfo({ localPath: "/Users/testuser/code/baz/qux" }),
    ];
    expect(formatPathsForClipboard(repos)).toBe("~/code/foo/bar\n~/code/baz/qux");
  });

  it("handles paths outside home directory", () => {
    const repos = [
      mockRepoInfo({ localPath: "/tmp/project" }),
      mockRepoInfo({ localPath: "/Users/testuser/code/repo" }),
    ];
    expect(formatPathsForClipboard(repos)).toBe("/tmp/project\n~/code/repo");
  });

  it("handles empty array", () => {
    expect(formatPathsForClipboard([])).toBe("");
  });
});
