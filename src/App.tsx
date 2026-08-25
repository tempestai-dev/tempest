import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { getVersion } from "@tauri-apps/api/app";
import { WorkspaceView } from "./components/WorkspaceView";
import Onboarding from "./components/onboarding/Onboarding";
import { getRuntimeState, setRuntimeState } from "./lib/runtimeState";
import { getSettings } from "./store/appSettings";
import { track, setPersonProperties, osName } from "./lib/telemetry";
import { checkAgentAvailability } from "./store/agentAvailability";
import { startRemoteAgentsFetch } from "./lib/remoteAgents";
import { toggleFullscreen } from "./lib/windowFullscreen";
import "./App.css";

// Dev-only: set VITE_FORCE_ONBOARDING=true in .env.local to always land on onboarding. Prod builds ignore it (DEV-gated).
const FORCE_ONBOARDING =
  import.meta.env.DEV && import.meta.env.VITE_FORCE_ONBOARDING === "true";

export default function App() {
  const [zenProject, setZenProject] = useState<{ name: string; path: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [onboardingDone, setOnboardingDone] = useState(
    () => !FORCE_ONBOARDING && getRuntimeState().onboardingComplete
  );

  useEffect(() => {
    // Renderer crash/error signal — no message text, only the error name (an
    // enum-safe value like "TypeError"). track() is a no-op without consent.
    const onErr = (e: ErrorEvent) =>
      void track("crash_or_error", { surface: "renderer", error_kind: e.error?.name ?? "error" });
    const onRej = () =>
      void track("crash_or_error", { surface: "renderer", error_kind: "unhandled_rejection" });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F11" || (e.key.toLowerCase() === "f" && e.ctrlKey && e.metaKey)) {
        e.preventDefault();
        void toggleFullscreen();
      }
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onRej);
    window.addEventListener("keydown", onKey);

    const label = getCurrentWindow().label;
    // Defer everything the first paint doesn't need: Windows `where` probes for
    // every agent, remote-manifest fetch, telemetry — none of it blocks the
    // welcome screen. requestIdleCallback in Chromium/WebView2; setTimeout(0)
    // fallback covers older WebView2 (and lets Safari-ish paths not choke).
    const idle: (cb: () => void) => number =
      (window as unknown as { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
        ?? ((cb: () => void) => window.setTimeout(cb, 0));
    idle(() => {
      checkAgentAvailability();
      void startRemoteAgentsFetch();
      if (!label.startsWith("zen-")) {
        void (async () => {
          const app_version = await getVersion().catch(() => "unknown");
          const os = osName();
          void track("app_opened", { app_version, os, is_first_launch: !getRuntimeState().onboardingComplete });
          void setPersonProperties({ app_version, os, atlas_enabled: getSettings().atlasEnabled });
        })();
      }
    });
    if (label.startsWith("zen-")) {
      invoke<[string, string] | null>("get_zen_config", { label })
        .then((result) => {
          if (result) setZenProject({ path: result[0], name: result[1] });
          setReady(true);
        })
        .catch(() => setReady(true));
    } else {
      setReady(true);
    }
    return () => {
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onRej);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function completeOnboarding() {
    void track("onboarding_finished", { at_step: 3 });
    setRuntimeState({ onboardingComplete: true });
    setOnboardingDone(true);
  }

  if (!ready) return null;

  // Zen windows skip onboarding entirely
  if (zenProject) return <WorkspaceView zen name={zenProject.name} path={zenProject.path} />;

  if (!onboardingDone) return <Onboarding onComplete={completeOnboarding} />;

  return <WorkspaceView />;
}
