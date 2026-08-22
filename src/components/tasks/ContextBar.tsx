import { GithubContextBar } from "./context/GithubContextBar";
import { LinearContextBar } from "./context/LinearContextBar";
import { UnifiedContextBar } from "./context/UnifiedContextBar";
import type { GhRepo, LinearBootstrap, TasksState } from "./types";

export function ContextBar({
  state,
  patch,
  repos,
  reposHasMore,
  onLoadMoreRepos,
  linearBootstrap,
}: {
  state: TasksState;
  patch: (p: Partial<TasksState>) => void;
  repos: GhRepo[];
  reposHasMore: boolean;
  onLoadMoreRepos: () => void;
  linearBootstrap: LinearBootstrap | null;
}) {
  return (
    <section className="context-bar">
      {state.source === "github" && (
        <GithubContextBar
          state={state}
          patch={patch}
          repos={repos}
          reposHasMore={reposHasMore}
          onLoadMoreRepos={onLoadMoreRepos}
        />
      )}
      {state.source === "linear" && <LinearContextBar state={state} patch={patch} bootstrap={linearBootstrap} />}
      {state.source === "unified" && <UnifiedContextBar state={state} patch={patch} />}
    </section>
  );
}
