import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createXai } from "@ai-sdk/xai";
import { createGroq } from "@ai-sdk/groq";
import { streamText } from "ai";
import type { LanguageModel, LanguageModelUsage } from "ai";

function buildModel(providerId: string, modelId: string, apiKey: string): LanguageModel {
  switch (providerId) {
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey })(modelId);
    case "gemini":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "mistral":
      return createMistral({ apiKey })(modelId);
    case "deepseek":
      return createDeepSeek({ apiKey })(modelId);
    case "xai":
      return createXai({ apiKey })(modelId);
    case "groq":
      return createGroq({ apiKey })(modelId);
    case "openrouter":
      return createOpenAI({ apiKey, baseURL: "https://openrouter.ai/api/v1" })(modelId);
    case "ollama":
      return createOpenAI({ apiKey: "ollama", baseURL: "http://localhost:11434/v1" })(modelId);
    default:
      throw new Error(`Unknown provider: ${providerId}`);
  }
}

const LOCAL_PROVIDERS = new Set(["ollama"]);

export async function streamChat(
  providerId: string,
  modelId: string,
  messages: { role: "user" | "assistant"; content: string }[],
  onChunk: (delta: string) => void,
  signal?: AbortSignal,
  onUsage?: (inputTokens: number, outputTokens: number) => void,
): Promise<void> {
  const apiKey = LOCAL_PROVIDERS.has(providerId)
    ? ""
    : localStorage.getItem(`tempest-byok-key-${providerId}`) ?? "";
  if (!apiKey && !LOCAL_PROVIDERS.has(providerId))
    throw new Error(`No API key for ${providerId}. Add it in Settings → API Keys.`);

  const model = buildModel(providerId, modelId, apiKey);

  // Capture usage from the onFinish callback — the reliable way to read token
  // usage in AI SDK v7. It fires once the model call settles with the final,
  // aggregated LanguageModelUsage ({ inputTokens, outputTokens, ... }).
  let finishUsage: LanguageModelUsage | undefined;
  const result = streamText({
    model,
    messages,
    abortSignal: signal,
    onFinish: ({ usage }) => { finishUsage = usage; },
  });

  for await (const chunk of result.textStream) {
    onChunk(chunk);
  }

  if (onUsage) {
    try {
      // Prefer the value captured in onFinish; fall back to the (auto-consuming)
      // usage promise in case onFinish hasn't flushed by the time the loop ends.
      const usage = finishUsage ?? (await result.usage);
      onUsage(usage.inputTokens ?? 0, usage.outputTokens ?? 0);
    } catch { /* provider doesn't report usage */ }
  }
}
