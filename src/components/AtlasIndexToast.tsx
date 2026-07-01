import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Check, Cpu, X } from "lucide-react";

interface Props {
  projectPath: string;
  projectName: string;
  onDismiss: () => void;
}

export function AtlasIndexToast({ projectPath, projectName, onDismiss }: Props) {
  const [done, setDone] = useState(false);
  const onDismissRef = useRef(onDismiss);
  useEffect(() => { onDismissRef.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    const tick = () => {
      invoke<boolean>("check_atlas_db", { projectPath })
        .then((exists) => {
          if (exists) {
            setDone(true);
            clearInterval(id);
            setTimeout(() => onDismissRef.current(), 2500);
          }
        })
        .catch(() => {});
    };
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [projectPath]);

  return (
    <div className={`atlas-toast${done ? " atlas-toast--done" : ""}`}>
      <div className="atlas-toast-icon">
        {done ? <Check size={13} /> : <Cpu size={13} />}
      </div>
      <div className="atlas-toast-body">
        <div className="atlas-toast-title">{done ? "Index ready" : "Indexing project"}</div>
        <div className="atlas-toast-sub">{projectName}</div>
      </div>
      {!done && <div className="atlas-toast-spinner" />}
      <button className="atlas-toast-dismiss" onClick={onDismiss} title="Dismiss">
        <X size={11} />
      </button>
    </div>
  );
}
