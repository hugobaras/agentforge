export async function waitUntil(
  predicate: () => Promise<boolean>,
  timeoutMs = 20000,
  intervalMs = 250,
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timeout après ${timeoutMs}ms`);
}
