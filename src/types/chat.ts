export type TextPart = { type: "text"; content: string };

export type ToolCallPart = {
  type: "tool-call";
  id: string;
  toolName: string;
  args: unknown;
  result?: unknown;
  status: "running" | "complete";
};

export type ProposalPart = {
  type: "proposal";
  id: string;
  agent: string;
  model?: string;
  task: string;
  reason: string;
  launched: boolean;
  dismissed: boolean;
};

export type MessagePart = TextPart | ToolCallPart | ProposalPart;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  parts: MessagePart[];
}

export interface PersistedMessage {
  id: string;
  role: "user" | "assistant";
  content?: string;
  parts?: MessagePart[];
}
