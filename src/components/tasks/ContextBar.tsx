import { GithubContextBar } from "./context/GithubContextBar";
import { LinearContextBar } from "./context/LinearContextBar";
import { UnifiedContextBar } from "./context/UnifiedContextBar";
import type { GhRepo, LinearBootstrap, TasksState } from "./types";

export function ContextBar({
  state,
  patch,
  repos,
  linearBootstrap,
}: {
  state: TasksState;
  patch: (p: Partial<TasksState>) => void;
  repos: GhRepo[];
  linearBootstrap: LinearBootstrap | null;
}) {
  return (
    <section className="context-bar">
      {state.source === "github" && <GithubContextBar state={state} patch={patch} repos={repos} />}
      {state.source === "linear" && <LinearContextBar state={state} patch={patch} bootstrap={linearBootstrap} />}
      {state.source === "unified" && <UnifiedContextBar state={state} patch={patch} />}
    </section>
  );
}
