/**
 * Autocomplete Multiselect Component
 *
 * Adapted from unpublished @clack/prompts autocomplete implementation.
 * This provides a searchable multiselect prompt that combines type-ahead
 * filtering with multiselect in one UI.
 *
 * Can be removed once @clack/prompts publishes autocompleteMultiselect.
 */

import { stdin, stdout } from "node:process";
import readline, { type Key, type ReadLine } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { wrapAnsi } from "fast-wrap-ansi";
import { cursor, erase } from "sisteransi";
import color from "picocolors";
import isUnicodeSupported from "is-unicode-supported";

// ─────────────────────────────────────────────────────────────────────────────
// Constants and Symbols
// ─────────────────────────────────────────────────────────────────────────────

const unicode = isUnicodeSupported();
const unicodeOr = (c: string, fallback: string) => (unicode ? c : fallback);

const S_STEP_ACTIVE = unicodeOr("◆", "*");
const S_STEP_CANCEL = unicodeOr("■", "x");
const S_STEP_ERROR = unicodeOr("▲", "x");
const S_STEP_SUBMIT = unicodeOr("◇", "o");
const S_BAR = unicodeOr("│", "|");
const S_BAR_END = unicodeOr("└", "—");
const S_CHECKBOX_SELECTED = unicodeOr("◼", "[+]");
const S_CHECKBOX_INACTIVE = unicodeOr("◻", "[ ]");

const CANCEL_SYMBOL = Symbol("clack:cancel");

type ClackState = "initial" | "active" | "cancel" | "submit" | "error";

const symbol = (state: ClackState) => {
  switch (state) {
    case "initial":
    case "active":
      return color.cyan(S_STEP_ACTIVE);
    case "cancel":
      return color.red(S_STEP_CANCEL);
    case "error":
      return color.yellow(S_STEP_ERROR);
    case "submit":
      return color.green(S_STEP_SUBMIT);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function setRawMode(input: Readable, value: boolean) {
  const i = input as typeof stdin;
  if (i.isTTY) i.setRawMode(value);
}

const getColumns = (output: Writable): number => {
  if ("columns" in output && typeof output.columns === "number") {
    return output.columns;
  }
  return 80;
};

const getRows = (output: Writable): number => {
  if ("rows" in output && typeof output.rows === "number") {
    return output.rows;
  }
  return 20;
};

function diffLines(prev: string, next: string) {
  const prevLines = prev.split("\n");
  const nextLines = next.split("\n");
  const lines: number[] = [];

  for (let i = 0; i < Math.max(prevLines.length, nextLines.length); i++) {
    if (prevLines[i] !== nextLines[i]) {
      lines.push(i);
    }
  }

  if (lines.length === 0) return null;

  return {
    lines,
    numLinesBefore: prevLines.length,
    numLinesAfter: nextLines.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Limit Options (for scrolling through long lists)
// ─────────────────────────────────────────────────────────────────────────────

interface LimitOptionsParams<TOption> {
  options: TOption[];
  maxItems: number | undefined;
  cursor: number;
  style: (option: TOption, active: boolean) => string;
  columnPadding?: number;
  rowPadding?: number;
  output?: Writable;
}

const trimLines = (
  groups: Array<string[]>,
  initialLineCount: number,
  startIndex: number,
  endIndex: number,
  maxLines: number
) => {
  let lineCount = initialLineCount;
  let removals = 0;
  for (let i = startIndex; i < endIndex; i++) {
    const group = groups[i];
    lineCount = lineCount - group.length;
    removals++;
    if (lineCount <= maxLines) {
      break;
    }
  }
  return { lineCount, removals };
};

const limitOptions = <TOption>(
  params: LimitOptionsParams<TOption>
): string[] => {
  const { cursor, options, style } = params;
  const output: Writable = params.output ?? stdout;
  const columns = getColumns(output);
  const columnPadding = params.columnPadding ?? 0;
  const rowPadding = params.rowPadding ?? 4;
  const maxWidth = columns - columnPadding;
  const rows = getRows(output);
  const overflowFormat = color.dim("...");

  const paramMaxItems = params.maxItems ?? Number.POSITIVE_INFINITY;
  const outputMaxItems = Math.max(rows - rowPadding, 0);
  const maxItems = Math.max(Math.min(paramMaxItems, outputMaxItems), 5);
  let slidingWindowLocation = 0;

  if (cursor >= maxItems - 3) {
    slidingWindowLocation = Math.max(
      Math.min(cursor - maxItems + 3, options.length - maxItems),
      0
    );
  }

  let shouldRenderTopEllipsis =
    maxItems < options.length && slidingWindowLocation > 0;
  let shouldRenderBottomEllipsis =
    maxItems < options.length &&
    slidingWindowLocation + maxItems < options.length;

  const slidingWindowLocationEnd = Math.min(
    slidingWindowLocation + maxItems,
    options.length
  );
  const lineGroups: Array<string[]> = [];
  let lineCount = 0;
  if (shouldRenderTopEllipsis) lineCount++;
  if (shouldRenderBottomEllipsis) lineCount++;

  const slidingWindowLocationWithEllipsis =
    slidingWindowLocation + (shouldRenderTopEllipsis ? 1 : 0);
  const slidingWindowLocationEndWithEllipsis =
    slidingWindowLocationEnd - (shouldRenderBottomEllipsis ? 1 : 0);

  for (
    let i = slidingWindowLocationWithEllipsis;
    i < slidingWindowLocationEndWithEllipsis;
    i++
  ) {
    const wrappedLines = wrapAnsi(style(options[i], i === cursor), maxWidth, {
      hard: true,
      trim: false,
    }).split("\n");
    lineGroups.push(wrappedLines);
    lineCount += wrappedLines.length;
  }

  if (lineCount > outputMaxItems) {
    let precedingRemovals = 0;
    let followingRemovals = 0;
    let newLineCount = lineCount;
    const cursorGroupIndex = cursor - slidingWindowLocationWithEllipsis;
    const trimLinesLocal = (startIndex: number, endIndex: number) =>
      trimLines(lineGroups, newLineCount, startIndex, endIndex, outputMaxItems);

    if (shouldRenderTopEllipsis) {
      ({ lineCount: newLineCount, removals: precedingRemovals } =
        trimLinesLocal(0, cursorGroupIndex));
      if (newLineCount > outputMaxItems) {
        ({ lineCount: newLineCount, removals: followingRemovals } =
          trimLinesLocal(cursorGroupIndex + 1, lineGroups.length));
      }
    } else {
      ({ lineCount: newLineCount, removals: followingRemovals } =
        trimLinesLocal(cursorGroupIndex + 1, lineGroups.length));
      if (newLineCount > outputMaxItems) {
        ({ lineCount: newLineCount, removals: precedingRemovals } =
          trimLinesLocal(0, cursorGroupIndex));
      }
    }

    if (precedingRemovals > 0) {
      shouldRenderTopEllipsis = true;
      lineGroups.splice(0, precedingRemovals);
    }
    if (followingRemovals > 0) {
      shouldRenderBottomEllipsis = true;
      lineGroups.splice(lineGroups.length - followingRemovals, followingRemovals);
    }
  }

  const result: string[] = [];
  if (shouldRenderTopEllipsis) result.push(overflowFormat);
  for (const lineGroup of lineGroups) {
    for (const line of lineGroup) {
      result.push(line);
    }
  }
  if (shouldRenderBottomEllipsis) result.push(overflowFormat);

  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// Option Type
// ─────────────────────────────────────────────────────────────────────────────

type Primitive = Readonly<string | boolean | number>;

export type Option<Value> = Value extends Primitive
  ? { value: Value; label?: string; hint?: string }
  : { value: Value; label: string; hint?: string };

/**
 * Type for custom filter functions used with autocompleteMultiselect.
 * Return true if the option should be shown for the given search text.
 */
export type FilterFn<Value> = (searchText: string, option: Option<Value>) => boolean;

// ─────────────────────────────────────────────────────────────────────────────
// Base Prompt Class (simplified for autocomplete use)
// ─────────────────────────────────────────────────────────────────────────────

interface PromptOptions {
  render: () => string | undefined;
  input?: Readable;
  output?: Writable;
  signal?: AbortSignal;
}

class BasePrompt {
  protected input: Readable;
  protected output: Writable;
  private _abortSignal?: AbortSignal;
  private rl: ReadLine | undefined;
  private _render: () => string | undefined;
  private _prevFrame = "";
  private _subscribers = new Map<
    string,
    { cb: (...args: any) => any; once?: boolean }[]
  >();
  protected _cursor = 0;

  public state: ClackState = "initial";
  public error = "";
  public value: any;
  public userInput = "";

  constructor(options: PromptOptions) {
    const { input = stdin, output = stdout, render, signal } = options;
    this.onKeypress = this.onKeypress.bind(this);
    this.close = this.close.bind(this);
    this.render = this.render.bind(this);
    this._render = render.bind(this);
    this._abortSignal = signal;
    this.input = input;
    this.output = output;
  }

  protected unsubscribe() {
    this._subscribers.clear();
  }

  private setSubscriber(
    event: string,
    opts: { cb: (...args: any) => any; once?: boolean }
  ) {
    const params = this._subscribers.get(event) ?? [];
    params.push(opts);
    this._subscribers.set(event, params);
  }

  public on(event: string, cb: (...args: any) => any) {
    this.setSubscriber(event, { cb });
  }

  public once(event: string, cb: (...args: any) => any) {
    this.setSubscriber(event, { cb, once: true });
  }

  public emit(event: string, ...data: any[]) {
    const cbs = this._subscribers.get(event) ?? [];
    const cleanup: (() => void)[] = [];

    for (const subscriber of cbs) {
      subscriber.cb(...data);
      if (subscriber.once) {
        cleanup.push(() => cbs.splice(cbs.indexOf(subscriber), 1));
      }
    }

    for (const cb of cleanup) {
      cb();
    }
  }

  public prompt(): Promise<any | symbol> {
    return new Promise((resolve) => {
      if (this._abortSignal) {
        if (this._abortSignal.aborted) {
          this.state = "cancel";
          this.close();
          return resolve(CANCEL_SYMBOL);
        }

        this._abortSignal.addEventListener(
          "abort",
          () => {
            this.state = "cancel";
            this.close();
          },
          { once: true }
        );
      }

      this.rl = readline.createInterface({
        input: this.input,
        tabSize: 2,
        prompt: "",
        escapeCodeTimeout: 50,
        terminal: true,
      });
      this.rl.prompt();

      this.input.on("keypress", this.onKeypress);
      setRawMode(this.input, true);
      this.output.on("resize", this.render);

      this.render();

      this.once("submit", () => {
        this.output.write(cursor.show);
        this.output.off("resize", this.render);
        setRawMode(this.input, false);
        resolve(this.value);
      });
      this.once("cancel", () => {
        this.output.write(cursor.show);
        this.output.off("resize", this.render);
        setRawMode(this.input, false);
        resolve(CANCEL_SYMBOL);
      });
    });
  }

  protected _isActionKey(char: string | undefined, key: Key): boolean {
    return (
      char === "\t" ||
      (key.name === "space" && char !== undefined && char !== "")
    );
  }

  private onKeypress(char: string | undefined, key: Key) {
    // Track user input for text-based filtering
    if (key.name !== "return" && !this._isActionKey(char, key)) {
      if (key.name === "backspace") {
        this.userInput = this.userInput.slice(0, -1);
      } else if (
        char &&
        !key.ctrl &&
        !key.meta &&
        key.name !== "up" &&
        key.name !== "down"
      ) {
        this.userInput += char;
      }
      this._cursor = this.userInput.length;
      this.emit("userInput", this.userInput);
    }

    if (this.state === "error") {
      this.state = "active";
    }

    this.emit("key", char?.toLowerCase(), key);

    if (key?.name === "return") {
      this.state = "submit";
    }

    const isCancel =
      (key.ctrl && key.name === "c") ||
      key.name === "escape";
    if (isCancel) {
      this.state = "cancel";
    }

    if (this.state === "submit" || this.state === "cancel") {
      this.emit("finalize");
    }
    this.render();
    if (this.state === "submit" || this.state === "cancel") {
      this.close();
    }
  }

  protected close() {
    this.input.unpipe();
    this.input.removeListener("keypress", this.onKeypress);
    this.output.write("\n");
    setRawMode(this.input, false);
    this.rl?.close();
    this.rl = undefined;
    this.emit(`${this.state}`, this.value);
    this.unsubscribe();
  }

  private restoreCursor() {
    const lines =
      wrapAnsi(this._prevFrame, process.stdout.columns, {
        hard: true,
        trim: false,
      }).split("\n").length - 1;
    this.output.write(cursor.move(-999, lines * -1));
  }

  private render() {
    const frame = wrapAnsi(this._render() ?? "", process.stdout.columns, {
      hard: true,
      trim: false,
    });
    if (frame === this._prevFrame) return;

    if (this.state === "initial") {
      this.output.write(cursor.hide);
    } else {
      const diff = diffLines(this._prevFrame, frame);
      const rows = getRows(this.output);
      this.restoreCursor();
      if (diff) {
        const diffOffsetAfter = Math.max(0, diff.numLinesAfter - rows);
        const diffOffsetBefore = Math.max(0, diff.numLinesBefore - rows);
        let diffLine = diff.lines.find((line) => line >= diffOffsetAfter);

        if (diffLine === undefined) {
          this._prevFrame = frame;
          return;
        }

        if (diff.lines.length === 1) {
          this.output.write(cursor.move(0, diffLine - diffOffsetBefore));
          this.output.write(erase.lines(1));
          const lines = frame.split("\n");
          this.output.write(lines[diffLine]);
          this._prevFrame = frame;
          this.output.write(cursor.move(0, lines.length - diffLine - 1));
          return;
        } else if (diff.lines.length > 1) {
          if (diffOffsetAfter < diffOffsetBefore) {
            diffLine = diffOffsetAfter;
          } else {
            const adjustedDiffLine = diffLine - diffOffsetBefore;
            if (adjustedDiffLine > 0) {
              this.output.write(cursor.move(0, adjustedDiffLine));
            }
          }
          this.output.write(erase.down());
          const lines = frame.split("\n");
          const newLines = lines.slice(diffLine);
          this.output.write(newLines.join("\n"));
          this._prevFrame = frame;
          return;
        }
      }

      this.output.write(erase.down());
    }

    this.output.write(frame);
    if (this.state === "initial") {
      this.state = "active";
    }
    this._prevFrame = frame;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Autocomplete Multiselect
// ─────────────────────────────────────────────────────────────────────────────

export interface AutocompleteMultiSelectOptions<Value> {
  message: string;
  options: Option<Value>[];
  initialValues?: Value[];
  required?: boolean;
  maxItems?: number;
  placeholder?: string;
  /**
   * Custom filter function. If not provided, filters by label, hint, and stringified value.
   */
  filter?: FilterFn<Value>;
}

function getLabel<T>(option: Option<T>) {
  return option.label ?? String(option.value ?? "");
}

function getFilteredOption<T>(searchText: string, option: Option<T>): boolean {
  if (!searchText) return true;
  const label = (option.label ?? String(option.value ?? "")).toLowerCase();
  const hint = (option.hint ?? "").toLowerCase();
  const value = String(option.value).toLowerCase();
  const term = searchText.toLowerCase();
  return label.includes(term) || hint.includes(term) || value.includes(term);
}

export const autocompleteMultiselect = <Value>(
  opts: AutocompleteMultiSelectOptions<Value>
): Promise<Value[] | symbol> => {
  const allOptions = opts.options;
  let filteredOptions = [...allOptions];
  let selectedValues: Value[] = opts.initialValues ? [...opts.initialValues] : [];
  let cursor = 0;
  let isNavigating = false;
  const filterFn = opts.filter ?? getFilteredOption;

  const formatOption = (
    option: Option<Value>,
    active: boolean
  ) => {
    const isSelected = selectedValues.includes(option.value);
    const label = option.label ?? String(option.value ?? "");
    const hint =
      option.hint && active ? color.dim(` (${option.hint})`) : "";
    const checkbox = isSelected
      ? color.green(S_CHECKBOX_SELECTED)
      : color.dim(S_CHECKBOX_INACTIVE);

    if (active) {
      return `${checkbox} ${label}${hint}`;
    }
    return `${checkbox} ${color.dim(label)}`;
  };

  const prompt = new BasePrompt({
    render() {
      const title = `${color.gray(S_BAR)}\n${symbol(this.state)}  ${opts.message}\n`;
      const userInput = this.userInput;
      const placeholder = opts.placeholder;
      const showPlaceholder = userInput === "" && placeholder !== undefined;

      // Update filtered options based on search
      if (userInput) {
        filteredOptions = allOptions.filter((opt) => filterFn(userInput, opt));
      } else {
        filteredOptions = [...allOptions];
      }

      // Ensure cursor is within bounds
      if (cursor >= filteredOptions.length) {
        cursor = Math.max(0, filteredOptions.length - 1);
      }

      const focusedValue = filteredOptions[cursor]?.value;

      // Search input display
      const searchText =
        isNavigating || showPlaceholder
          ? color.dim(showPlaceholder ? placeholder : userInput)
          : userInput + "█";

      const matches =
        filteredOptions.length !== allOptions.length
          ? color.dim(
              ` (${filteredOptions.length} match${filteredOptions.length === 1 ? "" : "es"})`
            )
          : "";

      switch (this.state) {
        case "submit": {
          return `${title}${color.gray(S_BAR)}  ${color.dim(`${selectedValues.length} items selected`)}`;
        }
        case "cancel": {
          return `${title}${color.gray(S_BAR)}  ${color.strikethrough(color.dim(userInput))}`;
        }
        default: {
          const barColor = this.state === "error" ? color.yellow : color.cyan;

          const instructions = [
            `${color.dim("↑/↓")} navigate`,
            `${color.dim(isNavigating ? "Space/Tab:" : "Tab:")} select`,
            `${color.dim("Enter:")} confirm`,
            `${color.dim("Type:")} search`,
          ];

          const noResults =
            filteredOptions.length === 0 && userInput
              ? [`${barColor(S_BAR)}  ${color.yellow("No matches found")}`]
              : [];

          const errorMessage =
            this.state === "error"
              ? [`${barColor(S_BAR)}  ${color.yellow(this.error)}`]
              : [];

          const headerLines = [
            ...`${title}${barColor(S_BAR)}`.split("\n"),
            `${barColor(S_BAR)}  ${color.dim("Search:")} ${searchText}${matches}`,
            ...noResults,
            ...errorMessage,
          ];
          const footerLines = [
            `${barColor(S_BAR)}  ${color.dim(instructions.join(" • "))}`,
            `${barColor(S_BAR_END)}`,
          ];

          const displayOptions = limitOptions({
            cursor,
            options: filteredOptions,
            style: (option, active) => formatOption(option, active),
            maxItems: opts.maxItems,
            rowPadding: headerLines.length + footerLines.length,
          });

          return [
            ...headerLines,
            ...displayOptions.map((option) => `${barColor(S_BAR)}  ${option}`),
            ...footerLines,
          ].join("\n");
        }
      }
    },
  });

  // Handle navigation and selection
  prompt.on("key", (char: string | undefined, key: Key) => {
    const isUpKey = key.name === "up";
    const isDownKey = key.name === "down";

    if (isUpKey || isDownKey) {
      cursor = Math.max(
        0,
        Math.min(cursor + (isUpKey ? -1 : 1), filteredOptions.length - 1)
      );
      isNavigating = true;
    } else if (key.name === "tab" || (isNavigating && key.name === "space")) {
      // Toggle selection
      const focusedValue = filteredOptions[cursor]?.value;
      if (focusedValue !== undefined) {
        if (selectedValues.includes(focusedValue)) {
          selectedValues = selectedValues.filter((v) => v !== focusedValue);
        } else {
          selectedValues = [...selectedValues, focusedValue];
        }
      }
    } else if (key.name !== "return" && key.name !== "escape" && !key.ctrl) {
      isNavigating = false;
    }

    if (key.name === "return") {
      if (opts.required && selectedValues.length === 0) {
        prompt.state = "error";
        prompt.error = "Please select at least one item";
      } else {
        prompt.value = selectedValues;
      }
    }
  });

  return prompt.prompt() as Promise<Value[] | symbol>;
};

export function isCancel(value: unknown): value is symbol {
  return value === CANCEL_SYMBOL;
}
