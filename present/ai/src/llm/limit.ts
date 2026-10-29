let maxConcurrent = 4;
let active = 0;
const waiters: Array<() => void> = [];

export const LLM_TIMEOUT = { stepMs: 8 * 60 * 1000 } as const;

export function setGenerateJsonConcurrency(n: number): void {
  maxConcurrent = Math.max(1, Math.min(8, Math.floor(n) || 1));
}

export function isTimeoutLlmError(e: unknown): boolean {
  const name = e instanceof Error ? e.name : "";
  if (name === "AbortError" || name === "TimeoutError") return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /timeout|timed out|time out|ETIMEDOUT|超过\s*\d+\s*分钟|ERR_CONNECTION|Failed to fetch|ECONNRESET|ECONNREFUSED/i.test(
    msg,
  );
}

export function observeLlmError(e: unknown): number | undefined {
  if (isTimeoutLlmError(e)) return undefined;
  const msg = e instanceof Error ? e.message : String(e);
  const conc = /max (?:organization )?concurrency:\s*(\d+)/i.exec(msg);
  if (conc) setGenerateJsonConcurrency(Number(conc[1]));
  else if (/429|rate limit|concurrency/i.test(msg)) setGenerateJsonConcurrency(1);
  const after = /try again after (\d+)\s*seconds?/i.exec(msg);
  if (after) return (Number(after[1]) + 1) * 1000;
  if (/429|rate limit|concurrency/i.test(msg)) return 1500;
  return undefined;
}

export async function withGenerateJsonSlot<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

function acquire(): Promise<void> {
  if (active < maxConcurrent) {
    active += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    waiters.push(resolve);
  });
}

function release(): void {
  active -= 1;
  while (waiters.length > 0 && active < maxConcurrent) {
    active += 1;
    waiters.shift()?.();
  }
}
