/**
 * Shared UI utilities for formatting and display
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Convert an absolute path to a user-friendly path with ~ for home directory
 */
export function toUserPath(absolutePath: string): string {
  const home = process.env.HOME;
  if (!home) return absolutePath;

  // Exact match (path IS the home directory)
  if (absolutePath === home) {
    return "~";
  }

  // Path under home directory (must have / after home path)
  if (absolutePath.startsWith(home + "/")) {
    return "~" + absolutePath.slice(home.length);
  }

  return absolutePath;
}

/**
 * Format an ISO timestamp as a human-readable relative time
 */
export function formatRelativeTime(isoString: string): string {
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

/**
 * Format an ISO timestamp as a full date
 */
export function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Copy text to the system clipboard (cross-platform)
 */
export async function copyToClipboard(text: string): Promise<void> {
  const platform = process.platform;
  const escaped = text.replace(/'/g, "'\\''");

  try {
    if (platform === "darwin") {
      await execAsync(`printf '%s' '${escaped}' | pbcopy`);
    } else if (platform === "linux") {
      try {
        await execAsync(`printf '%s' '${escaped}' | xclip -selection clipboard`);
      } catch {
        await execAsync(`printf '%s' '${escaped}' | xsel --clipboard --input`);
      }
    } else if (platform === "win32") {
      await execAsync(`echo ${JSON.stringify(text)} | clip`);
    } else {
      throw new Error(`Unsupported platform: ${platform}`);
    }
  } catch (error) {
    throw new Error(`Could not copy to clipboard. Text: ${text}`);
  }
}
