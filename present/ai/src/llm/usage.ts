export interface LlmUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_tokens?: number;
  cache_creation_tokens?: number;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function asFiniteNumber(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function pickUsageObject(source: Record<string, unknown>): Record<string, unknown> {
  if (isObj(source.totalUsage)) return source.totalUsage;
  if (isObj(source.usage)) return source.usage;
  return source;
}

export function extractLlmUsage(source: unknown): LlmUsage | undefined {
  if (!isObj(source)) return undefined;
  const usage = pickUsageObject(source);
  const details = isObj(usage.inputTokenDetails) ? usage.inputTokenDetails : {};
  const metaRaw = source.providerMetadata ?? source.experimental_providerMetadata;
  const meta = isObj(metaRaw) ? metaRaw : {};
  const anth = isObj(meta.anthropic) ? meta.anthropic : {};

  const input = asFiniteNumber(
    usage.inputTokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.prompt_tokens,
  );
  const output = asFiniteNumber(
    usage.outputTokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.completion_tokens,
  );
  const cacheRead = asFiniteNumber(
    usage.cachedInputTokens ??
      usage.cache_read_tokens ??
      usage.cacheReadTokens ??
      details.cacheReadTokens ??
      details.cache_read_tokens ??
      anth.cacheReadInputTokens ??
      anth.cache_read_input_tokens,
  );
  const cacheCreate = asFiniteNumber(
    usage.cacheCreationTokens ??
      usage.cache_creation_tokens ??
      details.cacheWriteTokens ??
      details.cache_write_tokens ??
      anth.cacheCreationInputTokens ??
      anth.cache_creation_input_tokens,
  );

  if (input == null && output == null && cacheRead == null && cacheCreate == null) return undefined;
  return {
    input_tokens: input ?? 0,
    output_tokens: output ?? 0,
    ...(cacheRead != null ? { cache_read_tokens: cacheRead } : {}),
    ...(cacheCreate != null ? { cache_creation_tokens: cacheCreate } : {}),
  };
}
