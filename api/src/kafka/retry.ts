export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runWithExponentialBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts: number;
    baseDelayMs: number;
    sleepFn?: (ms: number) => Promise<void>;
  },
): Promise<T> {
  const sleepFn = options.sleepFn ?? sleep;
  let lastError: unknown;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === options.maxAttempts) {
        break;
      }
      await sleepFn(options.baseDelayMs * 2 ** (attempt - 1));
    }
  }

  throw lastError;
}
