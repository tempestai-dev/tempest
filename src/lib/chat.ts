import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createXai } from "@ai-sdk/xai";
import { createGroq } from "@ai-sdk/groq";
import { streamText, stepCountIs } from "ai";
import type { LanguageModel, ToolSet, ModelMessage } from "ai";

function buildModel(providerId: string, modelId: string, apiKey: string): LanguageModel {
  switch (providerId) {
    case "anthropic":    return createAnthropic({ apiKey })(modelId);
    case "openai":       return createOpenAI({ apiKey })(modelId);
    case "gemini":       return createGoogleGenerativeAI({ apiKey })(modelId);
    case "mistral":      return createMistral({ apiKey })(modelId);
    case "deepseek":     return createDeepSeek({ apiKey })(modelId);
    case "xai":          return createXai({ apiKey })(modelId);
    case "groq":         return createGroq({ apiKey })(modelId);
    case "openrouter":   return createOpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" })(modelId);
    case "ollama":       return createOpenAI({ apiKey: "ollama", baseURL: "http://localhost:11434/v1" })(modelId);
    default: throw new Error(`Unknown provider: ${providerId}`);
  }
}

const LOCAL_PROVIDERS = new Set(["ollama"]);

export type ChatStreamEvent =
  | { type: "token";        delta: string }
  | { type: "tool-call";    id: string; toolName: string; args: unknown }
  | { type: "tool-result";  id: string; toolName: string; result: unknown }
  | { type: "finish";       inputTokens: number; outputTokens: number }
  | { type: "error";        message: string };

export interface StreamChatOptions {
  providerId: string;
  modelId: string;
  messages: { role: "user" | "assistant"; content: string }[];
  system?: string;
  tools?: ToolSet;
  onEvent: (event: ChatStreamEvent) => void;
}

export function streamChat(options: StreamChatOptions): { cancel: () => void } {
  const { providerId, modelId, messages, system, tools, onEvent } = options;
  const controller = new AbortController();

  (async () => {
    try {
      const apiKey = LOCAL_PROVIDERS.has(providerId)
        ? ""
        : localStorage.getItem(`tempest-byok-key-${providerId}`) ?? "";
      if (!apiKey && !LOCAL_PROVIDERS.has(providerId))
        throw new Error(`No API key for ${providerId}. Add it in Settings → API Keys.`);

      const model = buildModel(providerId, modelId, apiKey);
      const historyMsgs: ModelMessage[] = messages.map(m => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

      const result = streamText({
        model,
        messages: historyMsgs,
        ...(system && system.trim() ? { system } : {}),
        ...(tools ? { tools, stopWhen: stepCountIs(24) } : {}),
        abortSignal: controller.signal,
      });

      for await (const part of result.fullStream) {
        if (controller.signal.aborted) break;

        switch (part.type) {
          case "text-delta":
            onEvent({ type: "token", delta: (part as unknown as { text: string }).text });
            break;

          case "tool-call":
            onEvent({
              type:     "tool-call",
              id:       part.toolCallId,
              toolName: part.toolName,
              args:     (part as unknown as { input?: unknown }).input,
            });
            break;

          case "tool-result":
            onEvent({
              type:     "tool-result",
              id:       part.toolCallId,
              toolName: part.toolName,
              result:   (part as unknown as { output?: unknown }).output,
            });
            break;

          case "finish":
            onEvent({
              type:         "finish",
              inputTokens:  part.totalUsage.inputTokens  ?? 0,
              outputTokens: part.totalUsage.outputTokens ?? 0,
            });
            break;

          case "error":
            onEvent({ type: "error", message: String(part.error) });
            break;
        }
      }
    } catch (e) {
      if (!controller.signal.aborted) {
        onEvent({ type: "error", message: e instanceof Error ? e.message : String(e) });
      }
    }
  })();

  return { cancel: () => controller.abort() };
}
