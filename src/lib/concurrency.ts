type NormalizeOptions = {
  defaultValue?: number;
  min?: number;
  max?: number;
};

type NormalizeResult = {
  value: number;
  warning?: string;
};

export function normalizeConcurrency(
  input: unknown,
  options: NormalizeOptions = {}
): NormalizeResult {
  const defaultValue = options.defaultValue ?? 4;
  const min = options.min ?? 1;
  const max = options.max ?? 10;

  if (input === undefined || input === null || input === '') {
    return { value: defaultValue };
  }

  const raw = typeof input === 'number' ? input : Number.parseInt(String(input), 10);
  if (!Number.isFinite(raw)) {
    return {
      value: defaultValue,
      warning: `Invalid concurrency "${String(input)}"; using ${defaultValue}.`,
    };
  }

  if (raw <= 0) {
    return {
      value: defaultValue,
      warning: `Concurrency must be >= ${min}; using ${defaultValue}.`,
    };
  }

  const rounded = Math.floor(raw);
  if (rounded > max) {
    return {
      value: max,
      warning: `Concurrency capped at ${max}.`,
    };
  }

  if (rounded < min) {
    return {
      value: min,
      warning: `Concurrency must be >= ${min}; using ${min}.`,
    };
  }

  if (rounded !== raw) {
    return {
      value: rounded,
      warning: `Concurrency must be an integer; using ${rounded}.`,
    };
  }

  return { value: rounded };
}
