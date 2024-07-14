export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function every(
  ms: number,
  fn: () => Promise<void>
): Promise<void> {
  while (true) {
    await fn();
    await sleep(ms);
  }
}
