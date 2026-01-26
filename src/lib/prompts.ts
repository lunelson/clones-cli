/**
 * Mockable prompt re-exports
 *
 * This module re-exports prompt functions with the same interface,
 * allowing tests to mock interactive prompts without touching @clack internals.
 *
 * Usage in tests:
 *   import * as prompts from "../lib/prompts.js";
 *   vi.spyOn(prompts, "autocompleteMultiselect").mockResolvedValue([mockRepo]);
 */

// Re-export our custom autocomplete multiselect
export {
  autocompleteMultiselect,
  isCancel,
  type Option,
  type AutocompleteMultiSelectOptions,
} from "./autocomplete-multiselect.js";

// Re-export @clack/prompts for single-select, text, etc.
import * as p from "@clack/prompts";

export const select = p.select;
export const text = p.text;
export const confirm = p.confirm;
export const spinner = p.spinner;
export const intro = p.intro;
export const outro = p.outro;
export const log = p.log;
export const cancel = p.cancel;

// Re-export isCancel from @clack/prompts for their prompts
export const isClackCancel = p.isCancel;
