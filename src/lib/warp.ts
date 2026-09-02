import { invoke } from "@tauri-apps/api/core";
import { z } from "zod";
import type { ChatStreamEvent } from "./chat";
import type { ChatTools } from "./chatTools";
import { byokId, getSecret } from "./secrets";

// Experimental Warp (warpllm) chat backend. Non-streaming per step: one Tauri
// round-trip returns the whole reply, we emit it as a single `token` + `finish`
// so ChatNode renders it through the same event pipeline as the API and CLI
// paths. Cancel drops the reply on arrival — warpllm has streaming since 0.3
// but the turn-based agent loop below needs a full reply to decide the next
// step, so a single non-streaming call per turn is the cleaner cut.
//
// Two entrypoints:
// - streamWarp: one-shot chat, no tools. Backwards-compatible with the caller
//   that existed before tool-use landed.
// - runWarpAgent: agent loop. Pass a ChatTools set; the model can call them
//   through OpenAI-style function calling, we dispatch locally and feed the
//   results back until the model returns a plain reply or the step cap fires.

// ── model info cache ─────────────────────────────────────────────────────────
// Autodetect provider + BYOK env var from warpllm's own registry, so the
// hand-maintained WARP_PROVIDER_ENV in chatModels.ts can go. Cache per-model
// because the roster is baked into the Rust binary and never changes at
// runtime.

interface WarpModelInfo {
  provider: string;
  env_var: string | null;
  max_input_tokens: number | null;
  max_output_tokens: number | null;
}

const MODEL_INFO_CACHE = new Map<string, Promise<WarpModelInfo>>();

function modelInfo(modelId: string): Promise<WarpModelInfo> {
  let cached = MODEL_INFO_CACHE.get(modelId);
  if (!cached) {
    cached = invoke<WarpModelInfo>("warp_model_info", { model: modelId });
    MODEL_INFO_CACHE.set(modelId, cached);
  }
  return cached;
}

async function pickApiKey(modelId: string): Promise<string> {
  const info = await modelInfo(modelId);
  // Reuse the same BYOK slot the AI-SDK chat path uses. `openrouter` uses its
  // own slot; every other provider matches its registry name exactly.
  const slot = info.provider;
  return await getSecret(byokId(slot));
}

// ── one-shot chat (no tools) ─────────────────────────────────────────────────

export interface StreamWarpOptions {
  model: string;
  messages: { role: "user" | "assistant"; content: string }[];
  system?: string;
  onEvent: (event: ChatStreamEvent) => void;
}

interface WarpToolCall {
  id: string;
  name: string;
  arguments: string;
}

interface WarpChatMessage {
  role: string;
  content?: string | null;
  tool_calls?: WarpToolCall[];
  tool_call_id?: string;
}

interface WarpChatResult {
  content: string;
  tool_calls: WarpToolCall[];
  finish_reason: string;
  input_tokens: number;
  output_tokens: number;
}

async function callWarp(args: {
  model: string;
  messages: WarpChatMessage[];
  system?: string;
  api_key: string;
  tools?: { name: string; description?: string; parameters?: unknown }[];
}): Promise<WarpChatResult> {
  return invoke<WarpChatResult>("warp_chat", {
    args: {
      model: args.model,
      messages: args.messages,
      system: args.system ?? null,
      api_key: args.api_key,
      tools: args.tools ?? null,
    },
  });
}

export function streamWarp(options: StreamWarpOptions): { cancel: () => void } {
  const { model, messages, system, onEvent } = options;
  let cancelled = false;

  (async () => {
    try {
      const apiKey = await pickApiKey(model);
      const res = await callWarp({ model, messages, system, api_key: apiKey });
      if (cancelled) return;
      if (res.content) onEvent({ type: "token", delta: res.content });
      onEvent({
        type: "finish",
        inputTokens: res.input_tokens ?? 0,
        outputTokens: res.output_tokens ?? 0,
      });
    } catch (err) {
      if (cancelled) return;
      onEvent({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  })();

  return { cancel: () => { cancelled = true; } };
}

// ── agent loop (with tools) ──────────────────────────────────────────────────

export interface RunWarpAgentOptions {
  model: string;
  messages: { role: "user" | "assistant"; content: string }[];
  system?: string;
  tools: ChatTools;
  onEvent: (event: ChatStreamEvent) => void;
  /** Max round-trips before the loop bails out. Matches the AI-SDK path's stopWhen(24). */
  maxSteps?: number;
}

// A ChatTools entry is an AI SDK v5 `tool()` result — the fields we need are
// `description`, `inputSchema` (zod), and `execute` (async). We don't rely on
// the AI SDK's own internal types beyond that.
interface ToolLike {
  description?: string;
  inputSchema: z.ZodTypeAny;
  execute: (args: unknown, opts?: unknown) => Promise<unknown> | unknown;
}

function toolSpecs(tools: ChatTools): { name: string; description?: string; parameters?: unknown }[] {
  return Object.entries(tools as unknown as Record<string, ToolLike>).map(([name, t]) => ({
    name,
    description: t.description,
    // Zod v4 ships JSON-schema emission natively. Providers pass this through
    // verbatim to OpenAI/DeepSeek/Kimi as the function's `parameters`.
    parameters: t.inputSchema ? z.toJSONSchema(t.inputSchema) : { type: "object" },
  }));
}

function safeParseArgs(raw: string): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

export function runWarpAgent(options: RunWarpAgentOptions): { cancel: () => void } {
  const { model, messages, system, tools, onEvent, maxSteps = 24 } = options;
  let cancelled = false;

  (async () => {
    try {
      const apiKey = await pickApiKey(model);
      const specs = toolSpecs(tools);
      const toolMap = tools as unknown as Record<string, ToolLike>;

      // Working conversation. Grows with each assistant reply that called tools
      // (recorded as an assistant turn carrying `tool_calls`) plus one `role:
      // "tool"` message per call answering it.
      const convo: WarpChatMessage[] = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      let totalInput = 0;
      let totalOutput = 0;

      for (let step = 0; step < maxSteps; step++) {
        if (cancelled) return;
        const res = await callWarp({
          model,
          messages: convo,
          system,
          api_key: apiKey,
          tools: specs.length > 0 ? specs : undefined,
        });
        if (cancelled) return;
        totalInput += res.input_tokens ?? 0;
        totalOutput += res.output_tokens ?? 0;

        // A step with no tool calls is the final assistant turn — stream its
        // text (if any) and finish. Some providers emit empty content on a
        // tool-only turn; that's the loop-continuation case below, not this.
        if (res.tool_calls.length === 0) {
          if (res.content) onEvent({ type: "token", delta: res.content });
          onEvent({ type: "finish", inputTokens: totalInput, outputTokens: totalOutput });
          return;
        }

        // Any assistant text that arrived alongside the tool_calls is shown to
        // the user immediately — think of it as the model narrating what it's
        // about to do.
        if (res.content) onEvent({ type: "token", delta: res.content });

        // Record the assistant's tool-calling turn on the conversation exactly
        // as OpenAI expects it to be replayed.
        convo.push({
          role: "assistant",
          content: res.content || null,
          tool_calls: res.tool_calls,
        });

        // Dispatch each tool. Sequential rather than parallel: the ChatTools
        // set includes things like `write` and `atlas_*` that read/write the
        // same workspace state, and out-of-order execution would surface bugs
        // no other backend has to worry about.
        for (const call of res.tool_calls) {
          if (cancelled) return;
          onEvent({
            type: "tool-call",
            id: call.id,
            toolName: call.name,
            args: safeParseArgs(call.arguments),
          });
          const tool = toolMap[call.name];
          let result: unknown;
          if (!tool) {
            result = { error: `Unknown tool: ${call.name}` };
          } else {
            try {
              const parsed = safeParseArgs(call.arguments);
              result = await tool.execute(parsed, { toolCallId: call.id, messages: convo });
            } catch (e) {
              result = { error: e instanceof Error ? e.message : String(e) };
            }
          }
          if (cancelled) return;
          onEvent({
            type: "tool-result",
            id: call.id,
            toolName: call.name,
            result,
          });
          convo.push({
            role: "tool",
            tool_call_id: call.id,
            content: typeof result === "string" ? result : JSON.stringify(result ?? null),
          });
        }
      }

      // Hit the step cap. Surface it as an error the same way the API path
      // would — a runaway loop is a bug or a jailbreak, not a normal finish.
      onEvent({
        type: "error",
        message: `Warp agent reached the ${maxSteps}-step cap without a final reply.`,
      });
    } catch (err) {
      if (cancelled) return;
      onEvent({ type: "error", message: err instanceof Error ? err.message : String(err) });
    }
  })();

  return { cancel: () => { cancelled = true; } };
}
