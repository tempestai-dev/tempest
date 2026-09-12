import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { homeDir } from "@tauri-apps/api/path";
import { computeNextRunAt } from "../lib/automationSchedule";
import { getProjectPath } from "./sessions";
import { getAgent } from "../lib/agentRegistry";
import { getAgentConfig } from "../lib/runtimeState";
import { resolveAgentProviderEnv } from "../lib/providerRegistry";
import type { AgentConfig } from "../lib/agentManifest";
import { getSettings } from "./appSettings";
import { sessionManager } from "./sessionManager";

export interface Automation {
  id: string;
  projectId: string | null;
  name: string;
  agent: string;
  schedule: string;
  prompt: string;
  model: string | null;
  enabled: boolean;
  nextRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  status: string;
  triggeredBy: string;
  createdAt?: string;
}

export interface PromptVersion {
  id: string;
  automationId: string;
  prompt: string;
  source: string;
  bucketAt: string;
  createdAt: string;
}

export interface CreateAutomationReq {
  projectId?: string;
  name: string;
  agent?: string;
  schedule?: string;
  prompt?: string;
  model?: string;
  nextRunAt?: string;
}

export interface UpdateAutomationReq {
  name?: string;
  agent?: string;
  schedule?: string;
  prompt?: string;
  model?: string; // "" clears the model override
  enabled?: boolean;
  nextRunAt?: string | null;
}

let _automations: Automation[] = [];
let _dispatchUnlisten: (() => void) | null = null;
// Tracks the automationId + triggeredBy for each in-flight run so the
// sessionManager onDone callback can attribute the succeeded upsert without an
// extra DB round-trip. Cleared when the run completes.
const _runMeta = new Map<string, { automationId: string; triggeredBy: string }>();

export async function loadAutomations(projectId?: string): Promise<Automation[]> {
  _automations = await invoke<Automation[]>("list_automations", { projectId: projectId ?? null });
  if (!_dispatchUnlisten) {
    _dispatchUnlisten = await listen<string>("automation:dispatch", (ev) => {
      void _handleScheduledDispatch(ev.payload);
    });
  }
  return _automations;
}

async function _handleScheduledDispatch(id: string) {
  const automation = _automations.find((a) => a.id === id);
  if (!automation) return;
  try {
    await runAutomationNow(automation, "scheduler");
  } catch {
    // runAutomationNow already recorded dispatch_failed; nothing more to do.
  }
  // Advance next_run_at regardless of dispatch outcome so a broken automation
  // doesn't get stuck re-firing on the next scheduler tick.
  const next = computeNextRunAt(automation.schedule);
  await invoke("update_automation", { id, req: { nextRunAt: next } });
  const idx = _automations.findIndex((a) => a.id === id);
  if (idx >= 0) _automations[idx] = { ..._automations[idx], nextRunAt: next };
}

/// Build the argv for a one-shot headless run. Uses the agent manifest's
/// `printArgs` (e.g. claude's `-p "{PROMPT}"`) so the prompt reaches the CLI
/// through the flag that's designed to receive it — not as a bare positional,
/// which several CLIs (claude included) treat as a project path.
function buildHeadlessArgs(cfg: AgentConfig, prompt: string, model?: string): string[] {
  const print = cfg.printArgs ?? [];
  const flags: string[] = [];
  if (model && cfg.modelArgs) {
    for (const a of cfg.modelArgs) flags.push(a.replace("{MODEL}", model));
  }
  if (cfg.autoApproveArgs && getSettings().autoApprove) {
    for (const a of cfg.autoApproveArgs) flags.push(a);
  }
  // If printArgs starts with a subcommand (e.g. opencode's `run`), the subcommand
  // must be argv[1] or yargs routes to the default command and treats it as a
  // positional (opencode has `[project]` on default → prints --help). Insert
  // model/auto flags AFTER the subcommand. For flag-style print (claude's `-p
  // {PROMPT}`), keep the original order so flags don't split the -p/value pair.
  const args: string[] = [];
  if (print.length > 0 && !print[0].startsWith("-")) {
    args.push(print[0]);
    args.push(...flags);
    for (let i = 1; i < print.length; i++) args.push(print[i].replace("{PROMPT}", prompt));
  } else {
    args.push(...flags);
    for (const a of print) args.push(a.replace("{PROMPT}", prompt));
  }
  return args;
}

/// Dispatch an automation into a PTY session. No workspace tab, no PowerShell
/// spawn — the same `create_pty_session` the workspace uses, consumed by the
/// Automations detail page's TerminalPane. On spawn success the run is marked
/// `dispatched`; sessionManager's work-done heuristics flip it to `succeeded`.
/// Throws only when spawn setup fails; manual runs surface it, the scheduler
/// swallows.
export async function runAutomationNow(a: Automation, triggeredBy: "manual" | "scheduler" = "manual"): Promise<string> {
  const runId = crypto.randomUUID();
  await upsertAutomationRun({ id: runId, automationId: a.id, status: "dispatching", triggeredBy });

  const cfg = getAgent(a.agent);
  if (!cfg?.printArgs) {
    await upsertAutomationRun({ id: runId, automationId: a.id, status: "dispatch_failed", triggeredBy });
    throw new Error(`${a.agent} does not support headless runs (no print/-p flag in its manifest).`);
  }

  // Project-scoped needs the project to be loaded (its on-disk path is only
  // known when open). Global-scoped runs use the user's home dir.
  let cwd = "";
  if (a.projectId) {
    const p = getProjectPath(a.projectId);
    if (!p) {
      await upsertAutomationRun({ id: runId, automationId: a.id, status: "dispatch_failed", triggeredBy });
      throw new Error("This automation's project isn't loaded — open it first.");
    }
    cwd = p;
  } else {
    cwd = await homeDir();
  }

  const args = buildHeadlessArgs(cfg, a.prompt, a.model ?? undefined);
  _runMeta.set(runId, { automationId: a.id, triggeredBy });

  // Per-agent launch defaults apply to headless runs too, on the same precedence
  // as the workspace spawn (provider preset < per-agent env < TEMPEST_SESSION).
  // Without this an automation ignores the agent's configured env entirely — so a
  // Claude Code pointed at MiniMax in Settings would keep billing Anthropic on
  // every scheduled run, which is a surprise in the wrong direction.
  //
  // `subdir` is deliberately NOT applied: an automation's cwd is its project root
  // (or home for global ones) and is part of the automation's own definition.
  const agentCfg = getAgentConfig(cfg.id);
  const providerEnv = await resolveAgentProviderEnv(cfg.id);

  const channel = new Channel<{ session_id: string; data: string }>();
  try {
    await invoke<void>("create_pty_session", {
      sessionId: runId,
      cwd,
      rows: 40,
      cols: 120,
      command: cfg.hint,
      args,
      sandbox: null,
      // No policy for automations: creating the automation IS the opt-in.
      policy: null,
      dbIsolation: false,
      env: { ...providerEnv, ...agentCfg.env, TEMPEST_SESSION: runId },
      onEvent: channel,
    });
  } catch (e) {
    _runMeta.delete(runId);
    await upsertAutomationRun({ id: runId, automationId: a.id, status: "dispatch_failed", triggeredBy });
    throw e;
  }

  sessionManager.register(
    runId,
    channel,
    true,
    () => {
      const meta = _runMeta.get(runId);
      if (!meta) return;
      _runMeta.delete(runId);
      void upsertAutomationRun({
        id: runId,
        automationId: meta.automationId,
        status: "succeeded",
        triggeredBy: meta.triggeredBy,
      });
    },
    undefined,
    cfg.hint,
  );

  await upsertAutomationRun({ id: runId, automationId: a.id, status: "dispatched", triggeredBy });
  return runId;
}

export async function createAutomation(req: CreateAutomationReq): Promise<Automation> {
  const a = await invoke<Automation>("create_automation", { req });
  _automations = [..._automations, a];
  return a;
}

export async function updateAutomation(id: string, req: UpdateAutomationReq): Promise<Automation> {
  const a = await invoke<Automation>("update_automation", { id, req });
  _automations = _automations.map((x) => (x.id === id ? a : x));
  return a;
}

export async function deleteAutomation(id: string): Promise<void> {
  await invoke("delete_automation", { id });
  _automations = _automations.filter((x) => x.id !== id);
}

export async function listAutomationRuns(automationId: string): Promise<AutomationRun[]> {
  return invoke<AutomationRun[]>("list_automation_runs", { automationId });
}

export async function upsertAutomationRun(req: AutomationRun): Promise<AutomationRun> {
  return invoke<AutomationRun>("upsert_automation_run", { req });
}

export async function listPromptVersions(automationId: string): Promise<PromptVersion[]> {
  return invoke<PromptVersion[]>("list_prompt_versions", { automationId });
}

export async function savePromptVersion(req: {
  automationId: string;
  prompt: string;
  source?: string;
  bucketAt: string;
}): Promise<void> {
  return invoke("save_prompt_version", { req });
}
