//! Experimental Warp (warpllm) chat backend.
//!
//! Two Tauri commands:
//!
//! - `warp_chat` — one round-trip of an OpenAI-compatible chat completion.
//!   Non-streaming (warpllm has streaming since 0.3, but the frontend loop is
//!   turn-based so a single call per step is the cleaner cut for now). Accepts
//!   optional `tools`, and returns `tool_calls` alongside the assistant reply
//!   so the TS-side agent loop can dispatch them and call back with results.
//!
//! - `warp_model_info` — reads warpllm's registry for a model id, and hands
//!   the frontend the provider name + env-var name so it can look up the right
//!   BYOK key in the OS keychain. Replaces the hand-maintained
//!   `WARP_PROVIDER_ENV` map in `chatModels.ts` — the roster is authoritative.
//!
//! Keys: passed INLINE via `ClientConfig.providers[<provider>].api_key` (new in
//! warpllm 0.4). No more process-wide `std::env::set_var` hack — that was a
//! race across concurrent chat nodes and leaked the key to every subprocess
//! Tempest spawned afterwards. Gated by the frontend's "Warp chat backend"
//! experimental toggle; this module is never invoked unless the user opts in.

use std::collections::BTreeMap;

use warpllm::{
    ChatCompletionMessageToolCall, ChatCompletionMessageToolCallUnion, ChatCompletionRequestMessage,
    ChatCompletionRequestMessageContent, ChatCompletionTool, Client, ClientConfig,
    CreateChatCompletionRequest, FunctionObject, ProviderConfig, fetch_model,
};

// ── warp_chat ────────────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
pub struct WarpMessage {
    pub role: String,
    pub content: Option<String>,
    /// Set on assistant turns replayed back into a conversation after a tool
    /// call. Each entry is answered by a later `role: "tool"` message with the
    /// matching `tool_call_id`.
    #[serde(default)]
    pub tool_calls: Option<Vec<WarpToolCall>>,
    /// Set on `role: "tool"` messages. Names the call this message answers.
    #[serde(default)]
    pub tool_call_id: Option<String>,
}

#[derive(serde::Deserialize, serde::Serialize)]
pub struct WarpToolCall {
    pub id: String,
    pub name: String,
    /// JSON-encoded arguments string. Model-generated, so may be invalid JSON;
    /// the TS caller parses it before dispatching the tool.
    pub arguments: String,
}

#[derive(serde::Deserialize)]
pub struct WarpToolSpec {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    /// JSON Schema for the arguments, passed through verbatim to the provider.
    #[serde(default)]
    pub parameters: Option<serde_json::Value>,
}

#[derive(serde::Deserialize)]
pub struct WarpChatArgs {
    pub model: String,
    pub messages: Vec<WarpMessage>,
    pub system: Option<String>,
    /// BYOK key for the model's provider. Passed inline; no env mutation. The
    /// frontend picks the right one by calling `warp_model_info` first.
    pub api_key: Option<String>,
    /// Optional tool list. Each becomes a `function` tool on the OpenAI-shaped
    /// request; when the reply carries `tool_calls`, the TS loop dispatches
    /// them and calls `warp_chat` again with `role: "tool"` messages.
    #[serde(default)]
    pub tools: Option<Vec<WarpToolSpec>>,
}

#[derive(serde::Serialize)]
pub struct WarpChatResult {
    pub content: String,
    pub tool_calls: Vec<WarpToolCall>,
    pub finish_reason: String,
    pub input_tokens: u32,
    pub output_tokens: u32,
}

#[tauri::command]
pub async fn warp_chat(args: WarpChatArgs) -> Result<WarpChatResult, String> {
    let WarpChatArgs {
        model,
        messages: input_messages,
        system,
        api_key,
        tools: tool_specs,
    } = args;

    let (provider_spec, _) = fetch_model(&model).map_err(|e| e.to_string())?;
    let provider_name = provider_spec.name().to_string();

    // Inline the caller's key for exactly this provider. `providers: Some({..})`
    // narrows both routing AND which env vars warpllm reads — a key exported
    // for something else can't be quietly adopted. Absent api_key falls back to
    // the process environment for that provider only.
    let mut providers = BTreeMap::new();
    providers.insert(
        provider_name.clone(),
        ProviderConfig {
            api_key: api_key.filter(|k| !k.is_empty()),
        },
    );
    let config = ClientConfig {
        providers: Some(providers),
        ..Default::default()
    };
    let client = Client::new(config).map_err(|e| e.to_string())?;

    // ── request build ────────────────────────────────────────────────────────
    let mut messages: Vec<ChatCompletionRequestMessage> = Vec::new();
    if let Some(sys) = system.as_deref().filter(|s| !s.trim().is_empty()) {
        messages.push(ChatCompletionRequestMessage::new("system", sys));
    }
    for m in input_messages {
        let content_field = match m.content.as_deref() {
            Some(text) if !text.is_empty() => {
                Some(Some(ChatCompletionRequestMessageContent::Text(text.into())))
            }
            _ => None,
        };
        let tool_calls_field = m.tool_calls.map(|calls| {
            calls
                .into_iter()
                .map(|c| {
                    ChatCompletionMessageToolCallUnion::Function(ChatCompletionMessageToolCall {
                        id: c.id,
                        r#type: "function".into(),
                        function: warpllm::Function {
                            name: c.name,
                            arguments: c.arguments,
                            unknown_fields: Default::default(),
                        },
                        unknown_fields: Default::default(),
                    })
                })
                .collect()
        });
        messages.push(ChatCompletionRequestMessage {
            role: m.role,
            content: content_field,
            tool_calls: tool_calls_field,
            tool_call_id: m.tool_call_id,
            unknown_fields: Default::default(),
        });
    }

    let tools = tool_specs.map(|specs| {
        specs
            .into_iter()
            .map(|t| ChatCompletionTool {
                r#type: "function".into(),
                function: Some(FunctionObject {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters,
                    strict: None,
                    unknown_fields: Default::default(),
                }),
                unknown_fields: Default::default(),
            })
            .collect()
    });

    let request = CreateChatCompletionRequest {
        model,
        messages,
        tools,
        ..Default::default()
    };

    let resp = client
        .chat_completions(request)
        .await
        .map_err(|e| e.to_string())?;

    let choice = resp.choices.into_iter().next();
    let (content, tool_calls, finish_reason) = match choice {
        Some(c) => {
            let msg = c.message;
            let content = msg.content.unwrap_or_default();
            let tool_calls: Vec<WarpToolCall> = msg
                .tool_calls
                .unwrap_or_default()
                .into_iter()
                .filter_map(|u| match u {
                    ChatCompletionMessageToolCallUnion::Function(call) => Some(WarpToolCall {
                        id: call.id,
                        name: call.function.name,
                        arguments: call.function.arguments,
                    }),
                    // Custom tool calls go unused by our TS agent for now — a
                    // model that emits one round-trips as no-op rather than a
                    // hard error, matching how OpenAI-compat clients treat it.
                    ChatCompletionMessageToolCallUnion::Custom(_) => None,
                })
                .collect();
            (content, tool_calls, c.finish_reason)
        }
        None => (String::new(), Vec::new(), String::new()),
    };
    let usage = resp.usage.as_ref();
    Ok(WarpChatResult {
        content,
        tool_calls,
        finish_reason,
        input_tokens: usage.map(|u| u.prompt_tokens).unwrap_or(0),
        output_tokens: usage.map(|u| u.completion_tokens).unwrap_or(0),
    })
}

// ── warp_model_info ──────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
pub struct WarpModelInfo {
    pub provider: String,
    /// The env-var name warpllm's roster ties this provider's key to, or
    /// `null` for a provider whose roster entry names no variable (rare, but
    /// legal since 0.4 — such providers only work via inline keys).
    pub env_var: Option<String>,
    pub max_input_tokens: Option<u32>,
    pub max_output_tokens: Option<u32>,
}

#[tauri::command]
pub async fn warp_model_info(model: String) -> Result<WarpModelInfo, String> {
    let (provider, model_spec) = fetch_model(&model).map_err(|e| e.to_string())?;
    let caps = model_spec.capabilities();
    Ok(WarpModelInfo {
        provider: provider.name().to_string(),
        env_var: provider.env_api_key().map(|s| s.to_string()),
        max_input_tokens: caps.max_input_tokens(),
        max_output_tokens: caps.max_output_tokens(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn args_deserialize() {
        let raw = r#"{"model":"openai/gpt-5-nano","messages":[{"role":"user","content":"hi"}]}"#;
        let a: WarpChatArgs = serde_json::from_str(raw).unwrap();
        assert_eq!(a.model, "openai/gpt-5-nano");
        assert_eq!(a.messages.len(), 1);
        assert!(a.system.is_none());
        assert!(a.tools.is_none());
    }

    #[test]
    fn args_with_tools() {
        let raw = r#"{
            "model": "openai/gpt-5-nano",
            "messages": [
                {"role": "user", "content": "read /tmp/foo"},
                {"role": "assistant", "tool_calls": [{"id": "c1", "name": "read_file", "arguments": "{\"path\":\"/tmp/foo\"}"}]},
                {"role": "tool", "tool_call_id": "c1", "content": "file contents"}
            ],
            "tools": [{"name": "read_file", "description": "read a file", "parameters": {"type": "object"}}]
        }"#;
        let a: WarpChatArgs = serde_json::from_str(raw).unwrap();
        assert_eq!(a.messages.len(), 3);
        assert_eq!(a.tools.as_ref().unwrap().len(), 1);
        assert_eq!(a.messages[2].tool_call_id.as_deref(), Some("c1"));
    }
}
