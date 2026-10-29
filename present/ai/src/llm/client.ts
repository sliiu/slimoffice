// LLM 客户端工厂：根据 TextConfig 构造 Vercel AI SDK 的 LanguageModel 实例。
//
// 关键设计：
//   1. 所有 provider 通过同一个 createLlm(text) 入口暴露 —— 调用方（chat / generate）
//      只关心 LanguageModel，不关心后面是哪家。
//   2. 浏览器直连 OpenAI / Anthropic / Google 官方 endpoint 通常被 CORS 拦截：
//        a) 默认把 text.baseURL 作为 baseURL；
//        b) text.proxyUrl 非空时包成 `${proxyUrl}/${baseURL}`，走用户自部署反代
//           （path-prefix 约定，与社区常见 Cloudflare Worker / Vercel Edge 一致）。
//   3. Node 宿主（MCP server / gateway）直连官方 endpoint，无需反代。

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { parseCustomHeaders, type TextConfig } from "../config/types";
import { applyProxyUrl, clampTextRequestConcurrency, getProviderPreset, isLocalLlmEndpoint, resolveTextConfig } from "../config/presets";
import { setGenerateJsonConcurrency } from "./limit";
import { systemTextRoute } from "./offline-route";

export interface LlmClient {
  model: LanguageModel;
  /** UI 状态栏 / 错误信息里使用（如 "OpenAI · gpt-4o-mini"）。 */
  label: string;
}

export function createLlm(text: TextConfig): LlmClient {
  const system = systemTextRoute();
  if (system) {
    setGenerateJsonConcurrency(clampTextRequestConcurrency(text.concurrency));
    const provider = createOpenAICompatible({
      name: "slimppt-system",
      apiKey: "session",
      baseURL: system.baseURL,
      fetch: system.fetchImpl,
    });
    const model = system.model || "auto";
    return { model: provider(model), label: model === "auto" ? "Auto" : model };
  }
  // 先按 provider preset 兜底空字段 —— UI 显示 / 日志 / 标签都拿到实际生效配置。
  const resolved = resolveTextConfig(text);
  setGenerateJsonConcurrency(clampTextRequestConcurrency(resolved.concurrency));
  const preset = getProviderPreset(resolved.provider);

  const { headers, error } = parseCustomHeaders(resolved.customHeaders);
  if (error) {
    // 不抛 —— 让调用方在 UI 状态栏看到原因，避免一个 JSON 输错就完全用不了。
    console.warn("[ai] customHeaders parse error:", error);
  }
  const extraHeaders = mergeProviderHeaders(resolved.provider, headers);
  const finalBaseURL = applyProxyUrl(resolved.baseURL, resolved.proxyUrl);
  const apiKey =
    resolved.apiKey ||
    (preset.requiresApiKey === false || isLocalLlmEndpoint(resolved.baseURL) ? "local" : resolved.apiKey);

  if (resolved.provider === "openai") {
    const provider = createOpenAI({ apiKey, baseURL: finalBaseURL, headers: extraHeaders });
    return { model: provider(resolved.model), label: `${preset.label} · ${resolved.model}` };
  }
  if (resolved.provider === "anthropic") {
    const provider = createAnthropic({ apiKey, baseURL: finalBaseURL, headers: extraHeaders });
    return { model: provider(resolved.model), label: `${preset.label} · ${resolved.model}` };
  }
  if (resolved.provider === "google") {
    const provider = createGoogleGenerativeAI({ apiKey, baseURL: finalBaseURL, headers: extraHeaders });
    return { model: provider(resolved.model), label: `${preset.label} · ${resolved.model}` };
  }

  // 其余一律 OpenAI-Compatible：DeepSeek / Kimi / HF / OpenRouter / Groq / 通义 / 硅基 / Ollama…
  const provider = createOpenAICompatible({
    name: resolved.provider,
    apiKey,
    baseURL: finalBaseURL,
    headers: extraHeaders,
  });
  return { model: provider(resolved.model), label: `${preset.label} · ${resolved.model}` };
}

function mergeProviderHeaders(
  kind: TextConfig["provider"],
  user: Record<string, string>,
): Record<string, string> | undefined {
  const defaults: Record<string, string> =
    kind === "openrouter"
      ? { "HTTP-Referer": "https://slimppt.app", "X-Title": "SlimPPT" }
      : {};
  const merged = { ...defaults, ...user };
  return Object.keys(merged).length > 0 ? merged : undefined;
}
