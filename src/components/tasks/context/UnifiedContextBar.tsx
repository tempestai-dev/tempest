import { Icon } from "../icons";
import type { TasksState } from "../types";

export function UnifiedContextBar({
  state,
  patch,
}: {
  state: TasksState;
  patch: (p: Partial<TasksState>) => void;
}) {
  return (
    <>
      <div className="ctx-row">
        <span className="ctx-note">
          Merges your live GitHub + Linear results. Adjust the source-specific
          filters in the GitHub / Linear tabs; changes there flow through here.
        </span>
      </div>
      <div className="ctx-row">
        <div className="search">
          {Icon.search()}
          <input
            placeholder="Filter merged results by title…"
            value={state.query}
            onChange={(e) => patch({ query: e.target.value })}
          />
        </div>
      </div>
    </>
  );
}
