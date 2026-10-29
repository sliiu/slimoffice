// 哪些模型收得了原文件字节。收不了的要先问用户，同意才抽文字。

import { applyProxyUrl, resolveTextConfig, textModelSupportsVision } from "../config/presets";
import { parseCustomHeaders, type TextConfig } from "../config/types";
import { classifySourceFile, type SourceKind } from "./kinds";

/** chat：现有文本客户端的文件块。openai-responses：OpenAI 文件输入。degrade：先问再抽文字。 */
export type ByteRoute = "chat" | "openai-responses" | "degrade";

export function byteRouteFor(text: TextConfig, kind: SourceKind): ByteRoute {
  const resolved = resolveTextConfig(text);
  if (kind === "image") return textModelSupportsVision(resolved) ? "chat" : "degrade";
  if (kind === "unknown" || kind === "legacy" || kind === "text") return "degrade";
  if (kind === "docx" || kind === "xlsx" || kind === "document") {
    return resolved.provider === "openai" ? "openai-responses" : "degrade";
  }
  if (resolved.provider === "anthropic" || resolved.provider === "google") return "chat";
  if (resolved.provider === "openai" && textModelSupportsVision(resolved)) return "chat";
  if (textModelSupportsVision(resolved)) return "chat";
  return "degrade";
}

export interface ResponsesAuth {
  apiKey: string;
  baseURL: string;
  model: string;
  headers: Record<string, string>;
}

export function responsesAuth(text: TextConfig): ResponsesAuth {
  const resolved = resolveTextConfig(text);
  const { headers } = parseCustomHeaders(resolved.customHeaders);
  return {
    apiKey: resolved.apiKey,
    baseURL: applyProxyUrl(resolved.baseURL, resolved.proxyUrl).replace(/\/$/, ""),
    model: resolved.model,
    headers,
  };
}

export function filesNeedingDegrade(
  text: TextConfig,
  files: Array<{ name: string; mediaType: string }>,
): string[] {
  const names: string[] = [];
  for (const file of files) {
    const kind = classifySourceFile(file.name, file.mediaType);
    if (kind === "unknown") continue;
    if (kind === "image" && byteRouteFor(text, kind) === "degrade") continue;
    if (byteRouteFor(text, kind) === "degrade") names.push(file.name);
  }
  return names;
}

export function unknownSourceNames(files: Array<{ name: string; mediaType: string }>): string[] {
  return files.filter((f) => classifySourceFile(f.name, f.mediaType) === "unknown").map((f) => f.name);
}
