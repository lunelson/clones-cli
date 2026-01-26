import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

/**
 * Get the clones directory from environment or default to ~/Clones
 */
export function getClonesDir(): string {
  return (
    process.env.CLONES_CONTENT_DIR ||
    process.env.CLONES_DIR ||
    join(homedir(), "Clones")
  );
}

/**
 * Get the config directory (for registry.json and local.json)
 * Uses CLONES_CONFIG_DIR if set, otherwise XDG_CONFIG_HOME/clones, otherwise ~/.config/clones
 */
export function getConfigDir(): string {
  if (process.env.CLONES_CONFIG_DIR) {
    return process.env.CLONES_CONFIG_DIR;
  }

  const xdgConfig = process.env.XDG_CONFIG_HOME;
  return xdgConfig
    ? join(xdgConfig, "clones")
    : join(homedir(), ".config", "clones");
}

/**
 * Get the path to registry.json (shared across machines)
 */
export function getRegistryPath(): string {
  return join(getConfigDir(), "registry.json");
}

/**
 * Get the path to local.json (machine-specific state)
 */
export function getLocalStatePath(): string {
  return join(getConfigDir(), "local.json");
}

/**
 * Get the local path for a repository based on owner/repo
 */
export function getRepoPath(owner: string, repo: string): string {
  return join(getClonesDir(), owner, repo);
}

/**
 * Ensure the clones directory exists
 */
export async function ensureClonesDir(): Promise<void> {
  const dir = getClonesDir();
  await mkdir(dir, { recursive: true });
}

/**
 * Ensure the config directory exists
 */
export async function ensureConfigDir(): Promise<void> {
  const dir = getConfigDir();
  await mkdir(dir, { recursive: true });
}

/**
 * Default values for new registry entries
 */
export const DEFAULTS = {
  updateStrategy: "hard-reset" as const,
  submodules: "none" as const,
  lfs: "auto" as const,
  defaultRemoteName: "origin",
};
