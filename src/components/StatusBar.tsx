import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, Cpu, Shield } from "lucide-react";

interface IndexingItem {
  path: string;
  name: string;
  done: boolean;
}

interface Props {
  indexingPaths: { path: string; name: string }[];
  /**
   * Isolation state of the active session.
   * `true`  = agent session, sandboxed via Hephaestus
   * `false` = agent session, not sandboxed
   * `undefined` = non-agent session (terminal/diff/editor) — shield hidden
   */
  sandboxed?: boolean;
  /** When a project finishes indexing, remove it from the parent's list */
  onIndexComplete: (path: string) => void;
}

export function StatusBar({ indexingPaths, sandboxed, onIndexComplete }: Props) {
  const [items, setItems] = useState<IndexingItem[]>([]);
  const onCompleteRef = useRef(onIndexComplete);
  useEffect(() => { onCompleteRef.current = onIndexComplete; }, [onIndexComplete]);

  // Sync items with incoming indexingPaths — add new entries, keep done ones briefly
  useEffect(() => {
    setItems((prev) => {
      const next = [...prev];
      for (const { path, name } of indexingPaths) {
        if (!next.find((e) => e.path === path)) {
          next.push({ path, name, done: false });
        }
      }
      return next;
    });
  }, [indexingPaths]);

  // Poll each pending item every 2s
  useEffect(() => {
    const pending = items.filter((e) => !e.done);
    if (pending.length === 0) return;

    const ids = pending.map(({ path }) =>
      setInterval(() => {
        invoke<boolean>("check_atlas_db", { projectPath: path })
          .then((exists) => {
            if (exists) {
              setItems((prev) =>
                prev.map((e) => (e.path === path ? { ...e, done: true } : e))
              );
              // Show "Indexed" for 1.5 s then remove
              setTimeout(() => {
                setItems((prev) => prev.filter((e) => e.path !== path));
                onCompleteRef.current(path);
              }, 1500);
            }
          })
          .catch(() => {});
      }, 2000)
    );

    return () => ids.forEach(clearInterval);
  }, [items]);

  const hasItems = items.length > 0;
  // sandboxed === undefined means no agent session active → hide shield entirely
  const showShield = sandboxed !== undefined;

  if (!hasItems && !showShield) return null;

  return (
    <div className="status-bar" role="status" aria-live="polite">
      <div className="status-bar-left">
        {items.map((item) => (
          <div
            key={item.path}
            className={`status-bar-chip${item.done ? " status-bar-chip--done" : " status-bar-chip--indexing"}`}
          >
            {item.done ? (
              <Check size={10} className="status-bar-chip-icon" />
            ) : (
              <Cpu size={10} className="status-bar-chip-icon status-bar-chip-icon--spin" />
            )}
            <span className="status-bar-chip-label">
              {item.done ? `Indexed ${item.name}` : `Indexing ${item.name}…`}
            </span>
          </div>
        ))}
      </div>

      {showShield && (
        <div className="status-bar-right">
          <div
            className={`status-bar-chip status-bar-chip--shield${sandboxed ? " status-bar-chip--isolated" : ""}`}
            title={sandboxed ? "Isolated via Hephaestus (Job Object)" : "Not isolated — enable in Settings → Security"}
          >
            <Shield size={10} className="status-bar-chip-icon" />
            <span className="status-bar-chip-label">{sandboxed ? "Isolated" : "Not isolated"}</span>
          </div>
        </div>
      )}
    </div>
  );
}
