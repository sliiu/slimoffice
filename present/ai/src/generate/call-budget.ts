export const GENERATE_MODEL_CALL_BUDGET = 8;

export interface PlannedGenerateCallsInput {
  fromOutline?: boolean;
  enableDesignSpec?: boolean;
  enableArtDirector?: boolean;
  hasThemeOverride?: boolean;
}

export function plannedGenerateModelCalls(input: PlannedGenerateCallsInput = {}): number {
  let n = 0;
  if (!input.fromOutline) n += 1;
  if (input.enableDesignSpec) n += 1;
  n += 1; // research
  n += 1; // organize
  n += 1; // canvas author. Decks of 10+ pages may spend leftover budget on extra chunks; this count does not grow with pages.
  if (input.enableArtDirector) n += 1;
  return n;
}

export class ModelCallBudget {
  used = 0;

  constructor(readonly limit = GENERATE_MODEL_CALL_BUDGET) {}

  remaining(): number {
    return Math.max(0, this.limit - this.used);
  }

  tryConsume(n = 1): boolean {
    if (this.used + n > this.limit) return false;
    this.used += n;
    return true;
  }
}
