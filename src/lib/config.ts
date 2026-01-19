import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

/**
 * Get the clones directory from environment or default to ~/Clones
 */
export function getClonesDir(): string {
  return process.env.CLONES_DIR || join(homedir(), "Clones");
}

/**
 * Get the path to registry.json
 */
export function getRegistryPath(): string {
  return join(getClonesDir(), "registry.json");
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
 * Default values for new registry entries
 */
export const DEFAULTS = {
  updateStrategy: "hard-reset" as const,
  submodules: "none" as const,
  lfs: "auto" as const,
  defaultRemoteName: "origin",
};
