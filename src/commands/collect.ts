import { defineCommand } from "citty";
import * as p from "@clack/prompts";
import {
  autocompleteMultiselect,
  isCancel,
  type Option,
} from "../lib/autocomplete-multiselect.js";
import { readRegistry } from "../lib/registry.js";
import { getRepoPath } from "../lib/config.js";
import type { RegistryEntry } from "../types/index.js";

export default defineCommand({
  meta: {
    name: "collect",
    description: "Search and select multiple clones to collect",
  },
  args: {
    json: {
      type: "boolean",
      description: "Output selected clones as JSON",
    },
  },
  async run({ args }) {
    const registry = await readRegistry();

    if (registry.repos.length === 0) {
      if (args.json) {
        console.log(JSON.stringify([], null, 2));
      } else {
        p.log.info("No repositories in registry.");
        p.log.info("Use 'clones add <url>' to add a repository.");
      }
      return;
    }

    // Build options for autocomplete multiselect
    const options: Option<RegistryEntry>[] = registry.repos.map((entry) => ({
      value: entry,
      label: `${entry.owner}/${entry.repo}`,
    }));

    // Custom filter that searches owner/repo, tags, and description
    const filter = (searchText: string, option: Option<RegistryEntry>) => {
      const term = searchText.toLowerCase();
      const entry = option.value;
      const label = `${entry.owner}/${entry.repo}`.toLowerCase();
      const tags = entry.tags?.join(" ").toLowerCase() ?? "";
      const desc = entry.description?.toLowerCase() ?? "";
      return label.includes(term) || tags.includes(term) || desc.includes(term);
    };

    const selected = await autocompleteMultiselect({
      message: "Select clones to collect (type to search)",
      options,
      placeholder: "Type to filter...",
      filter,
    });

    if (isCancel(selected)) {
      p.cancel("Operation cancelled.");
      process.exit(0);
    }

    if (selected.length === 0) {
      p.log.info("No clones selected.");
      return;
    }

    // Output selected clones
    if (args.json) {
      const output = selected.map((entry) => ({
        id: entry.id,
        owner: entry.owner,
        repo: entry.repo,
        path: getRepoPath(entry.owner, entry.repo),
        cloneUrl: entry.cloneUrl,
        tags: entry.tags,
        description: entry.description,
      }));
      console.log(JSON.stringify(output, null, 2));
    } else {
      console.log();
      console.log(`Selected ${selected.length} clone${selected.length === 1 ? "" : "s"}:`);
      console.log();

      for (const entry of selected) {
        const shortPath = getRepoPath(entry.owner, entry.repo).replace(
          process.env.HOME || "",
          "~"
        );
        console.log(`  ${entry.owner}/${entry.repo}`);
        console.log(`    Path: ${shortPath}`);
        if (entry.tags && entry.tags.length > 0) {
          console.log(`    Tags: ${entry.tags.join(", ")}`);
        }
        console.log();
      }
    }
  },
});
