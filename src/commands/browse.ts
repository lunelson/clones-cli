import { defineCommand } from 'citty';
import * as p from '@clack/prompts';
import type { Option } from '@clack/prompts';
import { spawn } from 'node:child_process';
import { readRegistry } from '../lib/registry.js';
import { readLocalState, getLastSyncedAt } from '../lib/local-state.js';
import { getRepoStatus } from '../lib/git.js';
import { getRepoPath } from '../lib/config.js';
import { toUserPath, formatRelativeTime, copyToClipboard } from '../lib/ui-utils.js';
import { showBatchActions, type RepoInfo } from '../lib/browse/batch-actions.js';
import { ExitRequestedError } from '../lib/browse/errors.js';
import type { Registry } from '../types/index.js';

function requestExit(): never {
  throw new ExitRequestedError();
}

export default defineCommand({
  meta: {
    name: 'browse',
    description: 'Interactively browse and manage clones',
  },
  args: {},
  async run() {
    await mainLoop();
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// MAIN LOOP
// ─────────────────────────────────────────────────────────────────────────────

async function mainLoop(): Promise<void> {
  p.intro('clones');

  try {
    const registry = await readRegistry();
    if (registry.repos.length === 0) {
      p.log.info('No repositories in registry.');
      p.log.info("Use 'clones add <url>' to add a repository.");
      p.outro('Goodbye!');
      return;
    }

    while (true) {
      await browseRepos(await readRegistry());
    }
  } catch (error) {
    if (error instanceof ExitRequestedError) {
      p.outro('Goodbye!');
      return;
    }
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BROWSE REPOS (with multiselect search)
// ─────────────────────────────────────────────────────────────────────────────

async function browseRepos(registry: Registry): Promise<void> {
  // Load status for all repos
  const s = p.spinner();
  s.start('Loading repositories...');

  const repos: RepoInfo[] = await Promise.all(
    registry.repos.map(async (entry) => {
      const localPath = getRepoPath(entry.owner, entry.repo);
      const status = await getRepoStatus(localPath);
      return { entry, status, localPath };
    })
  );

  s.stop(`${repos.length} repositories loaded`);

  // Build options for autocomplete multiselect
  const options: Option<RepoInfo>[] = repos.map((r) => {
    const hints: string[] = [];
    if (!r.status.exists) {
      hints.push('missing');
    } else if (r.status.isDirty) {
      hints.push('dirty');
    }

    return {
      value: r,
      label: `${r.entry.owner}/${r.entry.repo}`,
      hint: hints.length > 0 ? hints.join(', ') : undefined,
    };
  });

  // Custom filter that searches owner/repo, tags, and description
  const repoInfoFilter = (searchText: string, option: Option<RepoInfo>): boolean => {
    if (!searchText) return true;
    const term = searchText.toLowerCase();
    const entry = option.value.entry;
    const label = `${entry.owner}/${entry.repo}`.toLowerCase();
    const tags = entry.tags?.join(' ').toLowerCase() ?? '';
    const desc = entry.description?.toLowerCase() ?? '';
    return label.includes(term) || tags.includes(term) || desc.includes(term);
  };

  const selected = await p.autocompleteMultiselect({
    message: 'Select repositories (type to filter, Tab to select)',
    options,
    placeholder: 'Type to search...',
    filter: repoInfoFilter,
  });

  if (p.isCancel(selected)) {
    requestExit();
  }

  if (selected.length === 0) {
    p.log.info('No repositories selected.');
    return;
  }

  // Branch based on selection count
  if (selected.length === 1) {
    await showRepoDetails(selected[0]);
  } else {
    await showBatchActions(selected);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// REPO DETAILS & ACTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function showRepoDetails(repo: RepoInfo): Promise<void> {
  const shortPath = repo.localPath.replace(process.env.HOME || '', '~');

  // Display repo info
  console.log();
  console.log(`  ${repo.entry.owner}/${repo.entry.repo}`);
  console.log(`  ${'─'.repeat(40)}`);
  console.log(`  Path: ${shortPath}`);
  console.log(`  URL:  ${repo.entry.cloneUrl}`);

  if (repo.entry.tags && repo.entry.tags.length > 0) {
    console.log(`  Tags: ${repo.entry.tags.join(', ')}`);
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

  // Get lastSyncedAt from local state
  const localState = await readLocalState();
  const lastSyncedAt = getLastSyncedAt(localState, repo.entry.id);
  if (lastSyncedAt) {
    console.log(`  Synced: ${formatRelativeTime(lastSyncedAt)}`);
  }

  console.log();

  // Action menu
  const action = await p.select({
    message: 'What would you like to do?',
    options: [
      { value: 'copy', label: 'Copy path to clipboard' },
      { value: 'open', label: 'Open in editor' },
      { value: 'back', label: 'Go back' },
      { value: 'exit', label: 'Exit' },
    ],
  });

  if (p.isCancel(action) || action === 'exit') {
    requestExit();
  }

  if (action === 'back') {
    return;
  }

  switch (action) {
    case 'copy': {
      const userPath = toUserPath(repo.localPath);
      await copyToClipboard(userPath);
      p.log.success(`Copied: ${userPath}`);
      break;
    }

    case 'open': {
      const editor = process.env.EDITOR || 'code';
      spawn(editor, [repo.localPath], { detached: true, stdio: 'ignore' }).unref();
      p.log.success(`Opened in ${editor}`);
      break;
    }
  }
}
