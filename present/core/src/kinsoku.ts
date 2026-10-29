import type { Kinsoku } from "./slide";

/** JSON snapshot for round-trip idempotent compare. */
export function kinsokuSnapshot(kinsoku: Kinsoku | undefined): string {
  if (!kinsoku) return "";
  return JSON.stringify(kinsoku);
}
