import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2, Copy, Check, Globe, Folder, Pencil } from "lucide-react";
import { EditorView, placeholder, keymap, drawSelection, highlightSpecialChars } from "@codemirror/view";
import { EditorState, EditorSelection } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { markdownLivePreview, livePreviewTheme } from "../threads/nodes/markdownLivePreview";
import { SpSelect } from "../ui/SpSelect";

type Props = {
  pos: { top: number; right: number };
  projectPath?: string;
  projectName?: string;
};

type Note = {
  id: string;
  body: string;
  title?: string; // user-set; when empty, derived from body
  scope: "global" | string;
  updatedAt: number;
};

async function upsertNote(n: Note): Promise<void> {
  await invoke("notes_upsert", { req: n });
}
async function deleteNoteDb(id: string): Promise<void> {
  await invoke("notes_delete", { id });
}
async function listNotesDb(): Promise<Note[]> {
  return await invoke<Note[]>("notes_list");
}

function autoTitle(body: string): string {
  const first = body.split("\n").find((l) => l.trim());
  if (!first) return "Untitled";
  // First sentence — stop at ., !, ? or line end.
  const stripped = first.replace(/^#+\s*/, "").trim();
  const m = stripped.match(/^(.+?[.!?])(\s|$)/);
  const sentence = m ? m[1] : stripped;
  return sentence.slice(0, 60) || "Untitled";
}
function displayTitle(n: Note): string {
  return n.title?.trim() ? n.title.trim() : autoTitle(n.body);
}

function relTime(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return "now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
  return `${Math.floor(d / 86_400_000)}d`;
}

const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", color: "var(--tempest-fg-default)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "'Geist', system-ui, sans-serif",
    fontSize: "13px",
    lineHeight: "1.65",
    overflow: "auto",
  },
  ".cm-content": { padding: "14px 16px", caretColor: "var(--tempest-fg-default)" },
  ".cm-cursor": { borderLeftColor: "var(--tempest-fg-default)" },
  ".cm-selectionBackground": { backgroundColor: "var(--tempest-bg-selection) !important" },
  "&.cm-focused .cm-selectionBackground": { backgroundColor: "var(--tempest-bg-selection-focused) !important" },
});

export function NotesPopover({ pos, projectPath, projectName }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const editorHostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const bodyRef = useRef<string>("");
  const [copied, setCopied] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");

  const active = useMemo(() => notes.find((n) => n.id === activeId) ?? notes[0], [notes, activeId]);

  // Hydrate from SQLite once. If empty, seed a blank note.
  useEffect(() => {
    let cancelled = false;
    listNotesDb().then((loaded) => {
      if (cancelled) return;
      if (loaded.length) {
        setNotes(loaded);
        setActiveId(loaded[0].id);
      } else {
        const seed: Note = { id: crypto.randomUUID(), body: "", scope: "global", updatedAt: Date.now() };
        setNotes([seed]);
        setActiveId(seed.id);
        void upsertNote(seed);
      }
    }).catch(() => {
      // Fall back to an in-memory blank so the UI still opens.
      const seed: Note = { id: crypto.randomUUID(), body: "", scope: "global", updatedAt: Date.now() };
      setNotes([seed]);
      setActiveId(seed.id);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { setRenaming(false); }, [active?.id]);

  useEffect(() => {
    if (!editorHostRef.current || !active) return;
    bodyRef.current = active.body;
    const view = new EditorView({
      parent: editorHostRef.current,
      state: EditorState.create({
        doc: active.body,
        extensions: [
          highlightSpecialChars(),
          history(),
          drawSelection(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          editorTheme,
          markdownLivePreview,
          livePreviewTheme,
          placeholder("Start Typing..."),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) bodyRef.current = u.state.doc.toString();
          }),
          EditorView.domEventHandlers({
            paste: (event, v) => {
              const files = Array.from(event.clipboardData?.files ?? []);
              const image = files.find((f) => f.type.startsWith("image/"));
              if (!image) return false;
              event.preventDefault();
              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = reader.result as string;
                const alt = image.name?.replace(/\.[^.]+$/, "") || "image";
                const md = `![${alt}](${dataUrl})`;
                const r = v.state.selection.main;
                v.dispatch({
                  changes: { from: r.from, to: r.to, insert: md },
                  selection: EditorSelection.cursor(r.from + md.length),
                  userEvent: "input.paste",
                });
              };
              reader.readAsDataURL(image);
              return true;
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    view.focus();
    const noteId = active.id;
    return () => {
      const finalBody = bodyRef.current;
      const now = Date.now();
      setNotes((prev) => {
        const target = prev.find((n) => n.id === noteId);
        if (target && target.body !== finalBody) {
          const updated = { ...target, body: finalBody, updatedAt: now };
          void upsertNote(updated);
          return prev.map((n) => (n.id === noteId ? updated : n));
        }
        return prev;
      });
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active?.id]);

  function newNote() {
    const scope: Note["scope"] = projectPath ?? "global";
    const n: Note = { id: crypto.randomUUID(), body: "", scope, updatedAt: Date.now() };
    setNotes((prev) => [n, ...prev]);
    setActiveId(n.id);
    void upsertNote(n);
  }

  function deleteActive() {
    if (!active) return;
    const goneId = active.id;
    void deleteNoteDb(goneId);
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== goneId);
      if (next.length === 0) {
        const seed: Note = { id: crypto.randomUUID(), body: "", scope: "global", updatedAt: Date.now() };
        void upsertNote(seed);
        setActiveId(seed.id);
        return [seed];
      }
      setActiveId(next[0].id);
      return next;
    });
  }

  function copyActive() {
    void navigator.clipboard.writeText(bodyRef.current);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function setScope(scope: string) {
    if (!active) return;
    const updated = { ...active, scope, updatedAt: Date.now() };
    setNotes((prev) => prev.map((n) => (n.id === active.id ? updated : n)));
    void upsertNote(updated);
  }

  function startRename() {
    if (!active) return;
    setRenameDraft(displayTitle(active));
    setRenaming(true);
  }
  function commitRename() {
    if (!active) return;
    const next = renameDraft.trim();
    // Empty draft = clear override, revert to auto-derived title.
    const updated = { ...active, title: next || undefined, updatedAt: Date.now() };
    setNotes((prev) => prev.map((n) => (n.id === active.id ? updated : n)));
    void upsertNote(updated);
    setRenaming(false);
  }

  const scopeOptions = [
    { value: "global", label: "Global", icon: <Globe size={12} /> },
    ...(projectPath ? [{ value: projectPath, label: projectName ?? "Project", icon: <Folder size={12} /> }] : []),
  ];

  return createPortal(
    <div
      className="sub-bar-notes-picker"
      style={{ top: pos.top, right: pos.right, position: "fixed" }}
    >
      <div className="sub-bar-notes-header">
        <span className="sub-bar-notes-title">Notes</span>
        <button className="sub-bar-notes-new" onClick={newNote} title="New note">
          <Plus size={12} />
          <span>New</span>
        </button>
      </div>

      <div className="sub-bar-notes-body">
        <ul className="sub-bar-notes-list">
          {notes.map((n) => {
            const isActive = n.id === active?.id;
            const isProject = n.scope !== "global";
            return (
              <li
                key={n.id}
                className={`sub-bar-notes-item${isActive ? " sub-bar-notes-item--active" : ""}`}
                onClick={() => setActiveId(n.id)}
              >
                <div className="sub-bar-notes-item-title">{displayTitle(n)}</div>
                <div className="sub-bar-notes-item-meta">
                  {isProject ? <Folder size={10} /> : <Globe size={10} />}
                  <span className="sub-bar-notes-item-scope">
                    {isProject
                      ? (n.scope === projectPath ? projectName ?? "Project" : n.scope.split(/[\\/]/).pop())
                      : "Global"}
                  </span>
                  <span className="sub-bar-notes-item-time">{relTime(n.updatedAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="sub-bar-notes-pane">
          <div className="sub-bar-notes-toolbar">
            {renaming ? (
              <input
                className="sub-bar-notes-title-input"
                autoFocus
                value={renameDraft}
                onChange={(e) => setRenameDraft(e.target.value)}
                onBlur={commitRename}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename();
                  else if (e.key === "Escape") setRenaming(false);
                }}
                placeholder="Note title"
              />
            ) : (
              <button
                className="sub-bar-notes-title-btn"
                onClick={startRename}
                title="Rename note"
              >
                <span className="sub-bar-notes-title-text">
                  {active ? displayTitle(active) : ""}
                </span>
                <Pencil size={11} className="sub-bar-notes-title-edit-icon" />
              </button>
            )}
            <div className="sub-bar-notes-toolbar-spacer" />
            <SpSelect
              value={active?.scope ?? "global"}
              options={scopeOptions}
              onChange={setScope}
            />
            <button className="sub-bar-notes-icon-btn" onClick={copyActive} title={copied ? "Copied" : "Copy"}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
            <button className="sub-bar-notes-icon-btn" onClick={deleteActive} title="Delete note">
              <Trash2 size={13} />
            </button>
          </div>
          <div ref={editorHostRef} className="sub-bar-notes-editor" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
