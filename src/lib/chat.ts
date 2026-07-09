import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createXai } from "@ai-sdk/xai";
import { createGroq } from "@ai-sdk/groq";
import { streamText } from "ai";
import type { LanguageModel } from "ai";

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
): Promise<void> {
  const apiKey = LOCAL_PROVIDERS.has(providerId)
    ? ""
    : localStorage.getItem(`tempest-byok-key-${providerId}`) ?? "";
  if (!apiKey && !LOCAL_PROVIDERS.has(providerId))
    throw new Error(`No API key for ${providerId}. Add it in Settings → API Keys.`);

  const model = buildModel(providerId, modelId, apiKey);

  const result = streamText({ model, messages, abortSignal: signal });

  for await (const chunk of result.textStream) {
    onChunk(chunk);
  }
}
