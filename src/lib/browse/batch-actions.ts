/**
 * Batch operations for multiple repository selections
 */

import * as p from "@clack/prompts";
import { toUserPath, copyToClipboard } from "../ui-utils.js";
import { readRegistry, writeRegistry, updateEntry } from "../registry.js";
import type { RegistryEntry, RepoStatus } from "../../types/index.js";

/**
 * Repository info with status - shared type for browse operations
 */
export interface RepoInfo {
  entry: RegistryEntry;
  status: RepoStatus;
  localPath: string;
}

/**
 * Format multiple paths for clipboard (newline-separated, with ~ for home)
 */
export function formatPathsForClipboard(repos: RepoInfo[]): string {
  return repos.map((r) => toUserPath(r.localPath)).join("\n");
}

/**
 * Display summary of selected repositories
 */
export function showReposSummary(repos: RepoInfo[]): void {
  console.log();
  console.log(`  Selected ${repos.length} repositories:`);
  console.log(`  ${"─".repeat(40)}`);

  for (const repo of repos) {
    const shortPath = toUserPath(repo.localPath);
    const statusIcon = !repo.status.exists
      ? "✗"
      : repo.status.isDirty
        ? "●"
        : "✓";
    console.log(`  ${statusIcon} ${repo.entry.owner}/${repo.entry.repo}`);
    console.log(`     ${shortPath}`);
  }

  console.log();
}

/**
 * Batch edit tags for multiple repositories
 * Options: add tags to all, remove tags from all, or replace tags on all
 */
async function batchEditTags(repos: RepoInfo[]): Promise<void> {
  const action = await p.select({
    message: `Edit tags for ${repos.length} repositories`,
    options: [
      { value: "add", label: "Add tags to all", hint: "append to existing" },
      { value: "remove", label: "Remove tags from all", hint: "remove if present" },
      { value: "replace", label: "Replace tags on all", hint: "overwrite existing" },
      { value: "back", label: "Back" },
    ],
  });

  if (p.isCancel(action) || action === "back") {
    return;
  }

  const tagsInput = await p.text({
    message:
      action === "remove"
        ? "Enter tags to remove (comma-separated)"
        : "Enter tags (comma-separated)",
    placeholder: "cli, typescript, framework",
  });

  if (p.isCancel(tagsInput) || !tagsInput) {
    return;
  }

  const inputTags = tagsInput
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (inputTags.length === 0) {
    p.log.warn("No tags provided");
    return;
  }

  let registry = await readRegistry();

  for (const repo of repos) {
    const currentTags = repo.entry.tags ?? [];
    let newTags: string[];

    switch (action) {
      case "add":
        // Add new tags, avoiding duplicates
        newTags = [...new Set([...currentTags, ...inputTags])];
        break;
      case "remove":
        // Remove specified tags
        newTags = currentTags.filter((t) => !inputTags.includes(t));
        break;
      case "replace":
        // Replace all tags
        newTags = inputTags;
        break;
      default:
        newTags = currentTags;
    }

    registry = updateEntry(registry, repo.entry.id, {
      tags: newTags.length > 0 ? newTags : undefined,
    });
  }

  await writeRegistry(registry);

  const verb = action === "add" ? "Added" : action === "remove" ? "Removed" : "Set";
  p.log.success(`${verb} tags for ${repos.length} repositories`);
}

/**
 * Show batch actions menu for multiple selected repositories
 */
export async function showBatchActions(repos: RepoInfo[]): Promise<void> {
  showReposSummary(repos);

  while (true) {
    const action = await p.select({
      message: `Batch actions for ${repos.length} repositories`,
      options: [
        { value: "copy", label: "Copy all paths to clipboard" },
        { value: "summary", label: "Show summary" },
        { value: "edit-tags", label: "Batch edit tags" },
        { value: "back", label: "Back to menu" },
      ],
    });

    if (p.isCancel(action) || action === "back") {
      return;
    }

    switch (action) {
      case "copy": {
        const pathsText = formatPathsForClipboard(repos);
        await copyToClipboard(pathsText);
        p.log.success(`Copied ${repos.length} paths to clipboard`);
        break;
      }

      case "summary":
        showReposSummary(repos);
        break;

      case "edit-tags":
        await batchEditTags(repos);
        break;
    }
  }
}
