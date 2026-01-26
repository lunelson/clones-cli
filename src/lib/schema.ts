import type { LocalState, Registry, RegistryEntry } from "../types/index.js";
import { DEFAULTS } from "./config.js";

type NormalizationResult<T> = {
  data: T;
  changed: boolean;
  issues: string[];
};

const REGISTRY_ENTRY_KEYS = new Set([
  "id",
  "host",
  "owner",
  "repo",
  "cloneUrl",
  "description",
  "tags",
  "defaultRemoteName",
  "updateStrategy",
  "submodules",
  "lfs",
  "addedAt",
  "managed",
]);

const LOCAL_STATE_KEYS = new Set(["version", "lastSyncRun", "repos"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Invalid registry format (missing ${label})`);
  }
  return value;
}

function normalizeRegistryEntry(
  raw: Record<string, unknown>,
  issues: string[],
  index: number
): { entry: RegistryEntry; changed: boolean } {
  let changed = false;

  for (const key of Object.keys(raw)) {
    if (!REGISTRY_ENTRY_KEYS.has(key)) {
      issues.push(`registry.repos[${index}] dropped unknown field "${key}"`);
      changed = true;
    }
  }

  const id = requireString(raw.id, "id");
  const host = requireString(raw.host, "host");
  const owner = requireString(raw.owner, "owner");
  const repo = requireString(raw.repo, "repo");
  const cloneUrl = requireString(raw.cloneUrl, "cloneUrl");
  const addedAt = requireString(raw.addedAt, "addedAt");

  let defaultRemoteName =
    typeof raw.defaultRemoteName === "string" && raw.defaultRemoteName.length > 0
      ? raw.defaultRemoteName
      : DEFAULTS.defaultRemoteName;
  if (defaultRemoteName !== raw.defaultRemoteName) {
    issues.push(`registry.repos[${index}] defaulted defaultRemoteName`);
    changed = true;
  }

  let updateStrategy =
    raw.updateStrategy === "ff-only" || raw.updateStrategy === "hard-reset"
      ? raw.updateStrategy
      : DEFAULTS.updateStrategy;
  if (updateStrategy !== raw.updateStrategy) {
    issues.push(`registry.repos[${index}] defaulted updateStrategy`);
    changed = true;
  }

  let submodules =
    raw.submodules === "recursive" || raw.submodules === "none"
      ? raw.submodules
      : DEFAULTS.submodules;
  if (submodules !== raw.submodules) {
    issues.push(`registry.repos[${index}] defaulted submodules`);
    changed = true;
  }

  let lfs =
    raw.lfs === "auto" || raw.lfs === "always" || raw.lfs === "never"
      ? raw.lfs
      : DEFAULTS.lfs;
  if (lfs !== raw.lfs) {
    issues.push(`registry.repos[${index}] defaulted lfs`);
    changed = true;
  }

  let managed = typeof raw.managed === "boolean" ? raw.managed : true;
  if (managed !== raw.managed) {
    issues.push(`registry.repos[${index}] defaulted managed`);
    changed = true;
  }

  const description = typeof raw.description === "string" ? raw.description : undefined;

  let tags: string[] | undefined;
  if (Array.isArray(raw.tags)) {
    const filtered = raw.tags.filter((tag) => typeof tag === "string");
    tags = filtered.length > 0 ? filtered : undefined;
    if (filtered.length !== raw.tags.length) {
      issues.push(`registry.repos[${index}] dropped non-string tags`);
      changed = true;
    }
  } else if (raw.tags !== undefined) {
    issues.push(`registry.repos[${index}] dropped invalid tags`);
    changed = true;
  }

  const entry: RegistryEntry = {
    id,
    host,
    owner,
    repo,
    cloneUrl,
    description,
    tags,
    defaultRemoteName,
    updateStrategy,
    submodules,
    lfs,
    addedAt,
    managed,
  };

  return { entry, changed };
}

export function normalizeRegistry(raw: unknown): NormalizationResult<Registry> {
  if (!isRecord(raw)) {
    throw new Error("Invalid registry format");
  }

  const issues: string[] = [];
  let changed = false;

  for (const key of Object.keys(raw)) {
    if (key !== "version" && key !== "repos") {
      issues.push(`registry dropped unknown field "${key}"`);
      changed = true;
    }
  }

  if (typeof raw.version !== "string") {
    throw new Error("Invalid registry format");
  }

  if (!Array.isArray(raw.repos)) {
    throw new Error("Invalid registry format");
  }

  const repos: RegistryEntry[] = raw.repos.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid registry format (repos[${index}])`);
    }
    const normalized = normalizeRegistryEntry(entry, issues, index);
    if (normalized.changed) {
      changed = true;
    }
    return normalized.entry;
  });

  return {
    data: { version: raw.version, repos },
    changed,
    issues,
  };
}

export function normalizeLocalState(raw: unknown): NormalizationResult<LocalState> {
  if (!isRecord(raw)) {
    throw new Error("Invalid local state format");
  }

  const issues: string[] = [];
  let changed = false;

  for (const key of Object.keys(raw)) {
    if (!LOCAL_STATE_KEYS.has(key)) {
      issues.push(`local.json dropped unknown field "${key}"`);
      changed = true;
    }
  }

  if (typeof raw.version !== "string") {
    throw new Error("Invalid local state format");
  }

  if (!isRecord(raw.repos)) {
    throw new Error("Invalid local state format");
  }

  const repos: LocalState["repos"] = {};
  for (const [repoId, value] of Object.entries(raw.repos)) {
    if (!isRecord(value)) {
      issues.push(`local.json dropped invalid repo state for "${repoId}"`);
      changed = true;
      continue;
    }

    let lastSyncedAt: string | undefined;
    if (typeof value.lastSyncedAt === "string") {
      lastSyncedAt = value.lastSyncedAt;
    } else if (value.lastSyncedAt !== undefined) {
      issues.push(`local.json dropped invalid lastSyncedAt for "${repoId}"`);
      changed = true;
    }

    repos[repoId] = { lastSyncedAt };
  }

  let lastSyncRun: string | undefined;
  if (typeof raw.lastSyncRun === "string") {
    lastSyncRun = raw.lastSyncRun;
  } else if (raw.lastSyncRun !== undefined) {
    issues.push("local.json dropped invalid lastSyncRun");
    changed = true;
  }

  return {
    data: {
      version: raw.version,
      lastSyncRun,
      repos,
    },
    changed,
    issues,
  };
}
