/**
 * Reusable filter factories for autocomplete/search components
 */

import type { Option, FilterFn } from './autocomplete-multiselect.js';
import type { RegistryEntry } from '../types/index.js';

// Re-export FilterFn for convenience
export type { FilterFn };

/**
 * Create a filter function for repository entries
 * Searches across owner/repo name, tags, and description
 */
export function createRepoFilter(): FilterFn<RegistryEntry> {
  return (searchText: string, option: Option<RegistryEntry>): boolean => {
    if (!searchText) return true;

    const term = searchText.toLowerCase();
    const entry = option.value;
    const label = `${entry.owner}/${entry.repo}`.toLowerCase();
    const tags = entry.tags?.join(' ').toLowerCase() ?? '';
    const desc = entry.description?.toLowerCase() ?? '';

    return label.includes(term) || tags.includes(term) || desc.includes(term);
  };
}
