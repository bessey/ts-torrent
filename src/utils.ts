export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function every(ms: number, fn: () => void): Promise<void> {
  while (true) {
    await Promise.resolve(fn());
    await sleep(ms);
  }
}
