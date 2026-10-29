// 把源文件和提示一起交给模型。字节优先；OpenAI 的 Word / Excel 走 Responses 文件输入。

import { generateText, type LanguageModel } from "ai";
import { LLM_TIMEOUT } from "../llm/limit";
import type { ResponsesAuth } from "./support";

export interface ModelFilePart {
  name: string;
  mediaType: string;
  bytes: Uint8Array;
  route: "chat" | "openai-responses";
}

export async function completeWithFiles(args: {
  model: LanguageModel;
  system: string;
  prompt: string;
  files: ModelFilePart[];
  responses?: ResponsesAuth;
  signal?: AbortSignal;
  timeoutMs?: number;
}): Promise<string> {
  const responsesFiles = args.files.filter((f) => f.route === "openai-responses");
  const chatFiles = args.files.filter((f) => f.route === "chat");
  if (responsesFiles.length > 0) {
    if (!args.responses) throw new Error("OpenAI file input needs an API key");
    return completeOpenAiResponses({
      auth: args.responses,
      system: args.system,
      prompt: args.prompt,
      files: [...responsesFiles, ...chatFiles],
      signal: args.signal,
    });
  }
  if (chatFiles.length === 0) {
    const result = await generateText({
      model: args.model,
      system: args.system,
      prompt: args.prompt,
      abortSignal: args.signal,
      timeout: { stepMs: args.timeoutMs ?? LLM_TIMEOUT.stepMs },
      maxRetries: 0,
    });
    return result.text;
  }
  const result = await generateText({
    model: args.model,
    messages: [
      { role: "system", content: args.system },
      {
        role: "user",
        content: [
          { type: "text", text: args.prompt },
          ...chatFiles.map((f) => ({
            type: "file" as const,
            data: f.bytes,
            mediaType: f.mediaType,
            filename: f.name,
          })),
        ],
      },
    ],
    abortSignal: args.signal,
    timeout: { stepMs: args.timeoutMs ?? LLM_TIMEOUT.stepMs },
    maxRetries: 0,
  });
  return result.text;
}

async function completeOpenAiResponses(args: {
  auth: ResponsesAuth;
  system: string;
  prompt: string;
  files: ModelFilePart[];
  signal?: AbortSignal;
}): Promise<string> {
  const content: Array<Record<string, string>> = [
    { type: "input_text", text: args.prompt },
  ];
  for (const file of args.files) {
    content.push({
      type: "input_file",
      filename: file.name,
      file_data: `data:${file.mediaType};base64,${bytesToBase64(file.bytes)}`,
    });
  }
  const res = await fetch(`${args.auth.baseURL}/responses`, {
    method: "POST",
    signal: args.signal,
    headers: {
      Authorization: `Bearer ${args.auth.apiKey}`,
      "Content-Type": "application/json",
      ...args.auth.headers,
    },
    body: JSON.stringify({
      model: args.auth.model,
      instructions: args.system,
      input: [{ role: "user", content }],
    }),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(raw.slice(0, 500) || `OpenAI responses ${res.status}`);
  const json = JSON.parse(raw) as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (json.output_text?.trim()) return json.output_text;
  const texts: string[] = [];
  for (const item of json.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.text) texts.push(part.text);
    }
  }
  if (!texts.length) throw new Error("OpenAI responses returned no text");
  return texts.join("\n");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
