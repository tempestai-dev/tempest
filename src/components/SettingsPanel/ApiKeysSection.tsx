import { useEffect, useRef, useState } from "react";
import { Pencil, Trash2, Plus, Eye, EyeOff, Check } from "lucide-react";
import { Tooltip } from "../Tooltip";

const CDN = "https://cdn.jsdelivr.net/npm/@lobehub/icons-static-svg@latest/icons/";

const API_KEY_PROVIDERS = [
  { id: "anthropic",  label: "Anthropic",  icon: "anthropic.svg",      invert: true,  local: false },
  { id: "openai",     label: "OpenAI",     icon: "openai.svg",          invert: true,  local: false },
  { id: "gemini",     label: "Gemini",     icon: "gemini-color.svg",    invert: false, local: false },
  { id: "mistral",    label: "Mistral",    icon: "mistral-color.svg",   invert: false, local: false },
  { id: "deepseek",   label: "DeepSeek",   icon: "deepseek-color.svg",  invert: false, local: false },
  { id: "xai",        label: "xAI",        icon: "xai.svg",             invert: true,  local: false },
  { id: "groq",       label: "Groq",       icon: "groq.svg",            invert: true,  local: false },
  { id: "openrouter", label: "OpenRouter", icon: "openrouter.svg",      invert: true,  local: false },
  { id: "ollama",     label: "Ollama",     icon: "ollama.svg",          invert: true,  local: true  },
];

function maskKey(key: string) {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 4) + "••••••••" + key.slice(-4);
}

export function ApiKeysSection() {
  const [keys, setKeys] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const p of API_KEY_PROVIDERS) {
      const k = localStorage.getItem(`tempest-byok-key-${p.id}`);
      if (k) out[p.id] = k;
    }
    return out;
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [showId, setShowId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) setTimeout(() => inputRef.current?.focus(), 0);
  }, [editingId]);

  function startEdit(id: string) {
    setEditingId(id);
    setEditValue(keys[id] ?? "");
  }

  function saveEdit(id: string) {
    const v = editValue.trim();
    if (v) {
      localStorage.setItem(`tempest-byok-key-${id}`, v);
      setKeys(prev => ({ ...prev, [id]: v }));
      setSavedId(id);
      setTimeout(() => setSavedId(null), 1500);
    }
    setEditingId(null);
    setEditValue("");
  }

  function removeKey(id: string) {
    localStorage.removeItem(`tempest-byok-key-${id}`);
    setKeys(prev => { const n = { ...prev }; delete n[id]; return n; });
  }

  return (
    <div className="sp-section">
      <div className="sp-section-heading">API Keys</div>
      <p className="sp-section-desc">
        Keys are stored locally in your browser and never leave your device.
        They power the Chat tab via your own provider accounts.
      </p>

      <div className="sp-apikeys-list">
        {API_KEY_PROVIDERS.map((p) => {
          const key = keys[p.id];
          const isEditing = editingId === p.id;
          const isSaved = savedId === p.id;
          const isVisible = showId === p.id;

          return (
            <div key={p.id} className={`sp-apikey-row${isEditing ? " sp-apikey-row--editing" : ""}`}>
              <div className="sp-apikey-provider">
                <img
                  src={CDN + p.icon}
                  alt={p.label}
                  width={16}
                  height={16}
                  className={p.invert ? "sp-apikey-logo-invert" : ""}
                  style={{ objectFit: "contain", flexShrink: 0 }}
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
                <span className="sp-apikey-name">{p.label}</span>
              </div>

              <div className="sp-apikey-right">
                {p.local ? (
                  <span className="sp-apikey-local">Local · no key needed</span>
                ) : isEditing ? (
                  <div className="sp-apikey-edit">
                    <input
                      ref={inputRef}
                      className="sp-apikey-input"
                      type="text"
                      value={editValue}
                      placeholder="Paste API key…"
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); saveEdit(p.id); }
                        if (e.key === "Escape") { setEditingId(null); setEditValue(""); }
                        e.stopPropagation();
                      }}
                    />
                    <div className="sp-apikey-edit-actions">
                      <button
                        className="sp-apikey-btn sp-apikey-btn--primary"
                        onClick={() => saveEdit(p.id)}
                        disabled={!editValue.trim()}
                      >
                        Save
                      </button>
                      <button
                        className="sp-apikey-btn"
                        onClick={() => { setEditingId(null); setEditValue(""); }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : key ? (
                  <div className="sp-apikey-set">
                    <span className="sp-apikey-mask">
                      {isVisible ? key : maskKey(key)}
                    </span>
                    <Tooltip content={isVisible ? "Hide" : "Show"} placement="top">
                      <button
                        className="sp-apikey-icon-btn"
                        onClick={() => setShowId(isVisible ? null : p.id)}
                      >
                        {isVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </Tooltip>
                    <Tooltip content={isSaved ? "Saved!" : "Edit"} placement="top">
                      <button
                        className={`sp-apikey-icon-btn${isSaved ? " sp-apikey-icon-btn--saved" : ""}`}
                        onClick={() => startEdit(p.id)}
                      >
                        {isSaved ? <Check size={13} /> : <Pencil size={13} />}
                      </button>
                    </Tooltip>
                    <Tooltip content="Remove" placement="top">
                      <button
                        className="sp-apikey-icon-btn sp-apikey-icon-btn--danger"
                        onClick={() => removeKey(p.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </Tooltip>
                  </div>
                ) : (
                  <button className="sp-apikey-add-btn" onClick={() => startEdit(p.id)}>
                    <Plus size={12} />
                    Add key
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
