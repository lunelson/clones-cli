import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  readRegistry,
  writeRegistry,
  updateEntry,
} from "../lib/registry.js";
import { getRepoStatus } from "../lib/git.js";
import { getRepoPath } from "../lib/config.js";
import type { RegistryEntry, RepoStatus } from "../types/index.js";

const execAsync = promisify(exec);

interface RepoInfo {
  entry: RegistryEntry;
  status: RepoStatus;
  localPath: string;
}

export default defineCommand({
  meta: {
    name: "browse",
    description: "Interactively browse and manage clones",
  },
  args: {},
  async run() {
    p.intro("clones");

    const registry = await readRegistry();

    if (registry.repos.length === 0) {
      p.log.info("No repositories in registry.");
      p.log.info("Use 'clones add <url>' to add a repository.");
      p.outro("");
      return;
    }

    // Gather status for all repos
    const s = p.spinner();
    s.start("Loading repositories...");

    const repos: RepoInfo[] = await Promise.all(
      registry.repos.map(async (entry) => {
        const localPath = getRepoPath(entry.owner, entry.repo);
        const status = await getRepoStatus(localPath);
        return { entry, status, localPath };
      })
    );

    s.stop(`${repos.length} repositories loaded`);

    // Build select options
    const options = repos.map((repo) => {
      const name = `${repo.entry.owner}/${repo.entry.repo}`;
      const hints: string[] = [];

      if (repo.entry.tags && repo.entry.tags.length > 0) {
        hints.push(repo.entry.tags.join(", "));
      }
      if (!repo.status.exists) {
        hints.push("missing");
      } else if (repo.status.isDirty) {
        hints.push("dirty");
      }

      return {
        value: repo,
        label: name,
        hint: hints.length > 0 ? hints.join(" · ") : undefined,
      };
    });

    // Select a repository
    const selected = await p.select({
      message: "Select a repository",
      options,
    });

    if (p.isCancel(selected)) {
      p.outro("Cancelled");
      return;
    }

    const repo = selected as RepoInfo;
    await showRepoDetails(repo, registry);
  },
});

async function showRepoDetails(
  repo: RepoInfo,
  registry: Awaited<ReturnType<typeof readRegistry>>
): Promise<void> {
  const shortPath = repo.localPath.replace(process.env.HOME || "", "~");

  // Display repo info
  console.log();
  console.log(`  ${repo.entry.owner}/${repo.entry.repo}`);
  console.log(`  ${"─".repeat(40)}`);
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

  // Status
  if (!repo.status.exists) {
    console.log(`  Status: ✗ Missing`);
  } else if (!repo.status.isGitRepo) {
    console.log(`  Status: ✗ Not a git repo`);
  } else if (repo.status.isDirty) {
    console.log(`  Status: ● Dirty`);
  } else {
    console.log(`  Status: ✓ Clean`);
  }

  if (repo.entry.lastSyncedAt) {
    console.log(`  Synced: ${formatRelativeTime(repo.entry.lastSyncedAt)}`);
  }

  console.log();

  // Action menu
  const action = await p.select({
    message: "What would you like to do?",
    options: [
      { value: "copy", label: "Copy path to clipboard" },
      { value: "edit-tags", label: "Edit tags" },
      { value: "edit-desc", label: "Edit description" },
      { value: "back", label: "Back to list" },
    ],
  });

  if (p.isCancel(action)) {
    p.outro("Done");
    return;
  }

  switch (action) {
    case "copy":
      await copyToClipboard(repo.localPath);
      p.log.success(`Copied: ${repo.localPath}`);
      p.outro("Done");
      break;

    case "edit-tags":
      await editTags(repo, registry);
      break;

    case "edit-desc":
      await editDescription(repo, registry);
      break;

    case "back":
      // Re-run the browse command (recursive)
      const { default: browseCommand } = await import("./browse.js");
      await browseCommand.run?.({ args: {} } as any);
      break;
  }
}

async function editTags(
  repo: RepoInfo,
  registry: Awaited<ReturnType<typeof readRegistry>>
): Promise<void> {
  const currentTags = repo.entry.tags?.join(", ") || "";

  const newTags = await p.text({
    message: "Enter tags (comma-separated)",
    initialValue: currentTags,
    placeholder: "cli, typescript, framework",
  });

  if (p.isCancel(newTags)) {
    p.outro("Cancelled");
    return;
  }

  const tags = newTags
    ? newTags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0)
    : undefined;

  const updatedRegistry = updateEntry(registry, repo.entry.id, { tags });
  await writeRegistry(updatedRegistry);

  p.log.success(`Tags updated for ${repo.entry.owner}/${repo.entry.repo}`);
  p.outro("Done");
}

async function editDescription(
  repo: RepoInfo,
  registry: Awaited<ReturnType<typeof readRegistry>>
): Promise<void> {
  const newDesc = await p.text({
    message: "Enter description",
    initialValue: repo.entry.description || "",
    placeholder: "A brief description of this repository",
  });

  if (p.isCancel(newDesc)) {
    p.outro("Cancelled");
    return;
  }

  const description = newDesc || undefined;

  const updatedRegistry = updateEntry(registry, repo.entry.id, { description });
  await writeRegistry(updatedRegistry);

  p.log.success(`Description updated for ${repo.entry.owner}/${repo.entry.repo}`);
  p.outro("Done");
}

async function copyToClipboard(text: string): Promise<void> {
  const platform = process.platform;

  try {
    if (platform === "darwin") {
      await execAsync(`echo -n ${JSON.stringify(text)} | pbcopy`);
    } else if (platform === "linux") {
      // Try xclip first, fall back to xsel
      try {
        await execAsync(`echo -n ${JSON.stringify(text)} | xclip -selection clipboard`);
      } catch {
        await execAsync(`echo -n ${JSON.stringify(text)} | xsel --clipboard --input`);
      }
    } else if (platform === "win32") {
      await execAsync(`echo ${JSON.stringify(text)} | clip`);
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (error) {
    // Fallback: just tell the user the path
    throw new Error(
      `Could not copy to clipboard. Path: ${text}`
    );
  }
}

function formatRelativeTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;

  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
