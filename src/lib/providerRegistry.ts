import bundledProviders from "../../config/providers.json";
import {
  sanitizeProviders,
  providersForAgent,
  resolveProviderEnv,
  type AgentProvider,
} from "./agentProviders";
import { getAgentConfig } from "./runtimeState";
import { byokId, getSecret } from "./secrets";

// The provider-preset registry — the impure half of agentProviders.ts (bundled
// asset import + keychain + runtime state), kept separate so the types, the
// sanitizer, and the env resolver stay node-testable. Mirrors the
// agentManifest.ts / agentRegistry.ts split.
//
// There is deliberately NO fetch channel here: see the header of
// agentProviders.ts for why a preset must not ride an unsigned patch channel.
// This list is fixed at build time.

export type { AgentProvider } from "./agentProviders";

export const PROVIDERS: AgentProvider[] =
  sanitizeProviders((bundledProviders as { providers: unknown }).providers);

export function getProvider(id: string): AgentProvider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/// The presets offered for this agent in Settings. Empty for most agents — a
/// preset only appears where its vendor's recipe has been verified.
export function getProvidersForAgent(agentId: string): AgentProvider[] {
  return providersForAgent(PROVIDERS, agentId);
}

/// The env the selected preset contributes for this agent, ready to merge at
/// spawn. `{}` when no preset is selected, the selection is stale (a preset
/// removed in a later release), it has no recipe for this agent, or its key has
/// not been pasted yet.
///
/// Async because the API key lives in the OS keychain, never in the persisted
/// `agentConfigs` blob — the whole point of routing it through `secrets.ts`.
export async function resolveAgentProviderEnv(agentId: string): Promise<Record<string, string>> {
  const selected = getAgentConfig(agentId).provider;
  if (!selected) return {};
  const provider = getProvider(selected);
  if (!provider) return {};
  try {
    const key = await getSecret(byokId(provider.id));
    return resolveProviderEnv(provider, agentId, key);
  } catch {
    // Keychain unavailable / user declined the prompt. Launch the agent on its
    // own credentials rather than failing the spawn.
    return {};
  }
}
