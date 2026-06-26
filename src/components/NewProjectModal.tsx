import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { FolderOpen } from "lucide-react";
import "./NewProjectModal.css";

interface Props {
  onClose: () => void;
  onCreated: (path: string, name: string) => void;
}

export function NewProjectModal({ onClose, onCreated }: Props) {
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function browse() {
    const path = await open({ directory: true, multiple: false, title: "Select location" });
    if (path) setLocation(path);
  }

  async function create() {
    const trimmedName = name.trim();
    if (!trimmedName || !location) {
      setError("Name and location are required.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const fullPath = await invoke<string>("create_workspace", { location, name: trimmedName });
      onCreated(fullPath, trimmedName);
    } catch (e) {
      setError(String(e));
      setCreating(false);
    }
  }

  const canCreate = name.trim().length > 0 && location.length > 0 && !creating;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">New Project</h2>

        <div className="modal-field">
          <label className="modal-label">Name</label>
          <input
            className="modal-input"
            placeholder="my-project"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(""); }}
            onKeyDown={(e) => e.key === "Enter" && canCreate && create()}
            autoFocus
          />
        </div>

        <div className="modal-field">
          <label className="modal-label">Location</label>
          <div className="modal-location-row">
            <input
              className="modal-input modal-input--location"
              placeholder="Select a folder…"
              value={location}
              readOnly
              onClick={browse}
            />
            <button className="modal-browse-btn" onClick={browse}>
              <FolderOpen size={14} />
            </button>
          </div>
        </div>

        {error && <p className="modal-error">{error}</p>}

        <div className="modal-footer">
          <button className="modal-btn modal-btn--cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="modal-btn modal-btn--create" onClick={create} disabled={!canCreate}>
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}
