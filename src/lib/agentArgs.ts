import { AGENT_CONFIGS } from "../components/NewSessionMenu";
import { getSettings } from "../store/appSettings";

export function buildAgentArgs(
  agent: string,
  sessionId: string,
  conversationId?: string,
  prompt?: string,
  model?: string,
): string[] {
  const config = AGENT_CONFIGS.find((a) => a.hint === agent);
  const args: string[] = [];

  if (model && (agent === "claude" || agent === "gemini" || agent === "codex")) {
    args.push("--model", model);
  }

  if (config && conversationId && config.resumeArgs) {
    for (const arg of config.resumeArgs) {
      args.push(arg.replace("{UUID}", conversationId));
    }
  } else if (config && conversationId && config.captureResumeArgs) {
    for (const arg of config.captureResumeArgs) {
      args.push(arg.replace("{UUID}", conversationId));
    }
  } else if (config && !conversationId && config.sessionIdArgs) {
    for (const arg of config.sessionIdArgs) {
      args.push(arg.replace("{UUID}", sessionId));
    }
  }

  if (config?.autoApproveArgs && getSettings().autoApprove) {
    for (const arg of config.autoApproveArgs) {
      args.push(arg);
    }
  }

  if (prompt) args.push(prompt);
  return args;
}
