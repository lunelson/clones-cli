import { readFile, writeFile, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Registry, RegistryEntry } from "../types/index.js";
import { getRegistryPath, ensureConfigDir } from "./config.js";
import { normalizeRegistry } from "./schema.js";

/**
 * Create an empty registry
 */
export function createEmptyRegistry(): Registry {
  return {
    version: "1.0.0",
    repos: [],
    tombstones: [],
  };
}

/**
 * Read the registry from disk
 * Returns an empty registry if the file doesn't exist
 */
export async function readRegistry(): Promise<Registry> {
  const path = getRegistryPath();

  if (!existsSync(path)) {
    return createEmptyRegistry();
  }

  try {
    const content = await readFile(path, "utf-8");
    const data = JSON.parse(content) as Registry;

    const normalized = normalizeRegistry(data);
    return normalized.data;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Registry file is corrupted: ${path}`);
    }
    throw error;
  }
}

/**
 * Write the registry to disk atomically
 * Uses write-to-temp + rename pattern to prevent corruption
 */
export async function writeRegistry(registry: Registry): Promise<void> {
  await ensureConfigDir();

  const normalized = normalizeRegistry(registry);
  const path = getRegistryPath();
  const tempPath = join(dirname(path), `.registry.${randomUUID()}.tmp`);

  // Write to temp file
  const content = JSON.stringify(normalized.data, null, 2);
  await writeFile(tempPath, content, "utf-8");

  // Atomic rename
  await rename(tempPath, path);
}

/**
 * Find a registry entry by ID
 */
export function findEntry(registry: Registry, id: string): RegistryEntry | undefined {
  return registry.repos.find((entry) => entry.id === id);
}

/**
 * Find a registry entry by owner/repo
 */
export function findEntryByOwnerRepo(
  registry: Registry,
  owner: string,
  repo: string
): RegistryEntry | undefined {
  return registry.repos.find(
    (entry) => entry.owner === owner && entry.repo === repo
  );
}

/**
 * Add an entry to the registry
 * Throws if an entry with the same ID already exists
 */
export function addEntry(registry: Registry, entry: RegistryEntry): Registry {
  if (findEntry(registry, entry.id)) {
    throw new Error(`Repository already exists in registry: ${entry.id}`);
  }

  return {
    ...registry,
    repos: [...registry.repos, entry],
  };
}

/**
 * Update an entry in the registry
 */
export function updateEntry(
  registry: Registry,
  id: string,
  updates: Partial<RegistryEntry>
): Registry {
  const index = registry.repos.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new Error(`Repository not found in registry: ${id}`);
  }

  const updatedRepos = [...registry.repos];
  updatedRepos[index] = { ...updatedRepos[index], ...updates };

  return {
    ...registry,
    repos: updatedRepos,
  };
}

/**
 * Remove an entry from the registry
 */
export function removeEntry(registry: Registry, id: string): Registry {
  const filtered = registry.repos.filter((entry) => entry.id !== id);

  if (filtered.length === registry.repos.length) {
    throw new Error(`Repository not found in registry: ${id}`);
  }

  return {
    ...registry,
    repos: filtered,
  };
}

/**
 * Add an ID to tombstones (no-op if already present)
 */
export function addTombstone(registry: Registry, id: string): Registry {
  if (registry.tombstones.includes(id)) {
    return registry;
  }

  return {
    ...registry,
    tombstones: [...registry.tombstones, id],
  };
}

/**
 * Remove an ID from tombstones (no-op if missing)
 */
export function removeTombstone(registry: Registry, id: string): Registry {
  if (!registry.tombstones.includes(id)) {
    return registry;
  }

  return {
    ...registry,
    tombstones: registry.tombstones.filter((entryId) => entryId !== id),
  };
}

/**
 * Filter entries by tags (any match)
 */
export function filterByTags(
  registry: Registry,
  tags: string[]
): RegistryEntry[] {
  if (tags.length === 0) return registry.repos;

  return registry.repos.filter((entry) =>
    entry.tags?.some((tag) => tags.includes(tag))
  );
}

/**
 * Filter entries by owner/repo pattern (supports wildcards)
 * Pattern format: "owner/repo" or "owner/\*" or "\*\/repo"
 */
export function filterByPattern(
  registry: Registry,
  pattern: string
): RegistryEntry[] {
  const [ownerPattern, repoPattern] = pattern.split("/");

  return registry.repos.filter((entry) => {
    const ownerMatch =
      ownerPattern === "*" || entry.owner === ownerPattern;
    const repoMatch =
      !repoPattern || repoPattern === "*" || entry.repo === repoPattern;
    return ownerMatch && repoMatch;
  });
}
