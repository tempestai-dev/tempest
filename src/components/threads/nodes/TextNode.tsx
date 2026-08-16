import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { NodeResizeControl, ResizeControlVariant, useReactFlow } from "@xyflow/react";
import { EditorView, placeholder, keymap, drawSelection, highlightSpecialChars } from "@codemirror/view";
import { Compartment, EditorState, EditorSelection } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  Check, Code2, Copy, Eye, Pencil, Trash2,
  Heading1, Heading2, Heading3, Bold, Italic, Strikethrough, Underline,
  Code, List, ListOrdered, Quote,
} from "lucide-react";
import { NodeConnector } from "./NodeConnector";
import { CollapsedNode } from "./CollapsedNode";
import { markdownLivePreview, livePreviewTheme } from "./markdownLivePreview";
import { applyWrap, applyLineOp, type LineOp } from "./markdownEdit";
import { getNodeData, patchNodeData, patchNodeDataLocal } from "../../../store/threads";
import { useZoomCounterScale } from "./useZoomCounterScale";
import "./TextNode.css";

// Free-form markdown note node (threads-plan.md §5). A CodeMirror editor with
// Obsidian-style live preview (markdownLivePreview): you always type raw
// markdown and it renders in place. The footer button flips to plain source.
// Body persists to the node's `data.body` on blur. Header is the drag handle
// (no `nodrag`); editor + footer carry `nodrag`/`nowheel` so typing and scroll
// don't move the canvas.

// Static CSS-var-based theme — no rebuild needed when the app theme changes.
const baseTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", color: "var(--tempest-fg-default)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "'Geist', system-ui, sans-serif", fontSize: "13px",
    lineHeight: "1.65", overflow: "auto",
  },
  ".cm-content": { padding: "10px", caretColor: "var(--tempest-fg-default)" },
  ".cm-cursor": { borderLeftColor: "var(--tempest-fg-default)" },
  // Selection — CM6's built-in stylesheet wins on ordering, so !important.
  ".cm-selectionBackground": { backgroundColor: "var(--tempest-bg-selection) !important" },
  "&.cm-focused .cm-selectionBackground": { backgroundColor: "var(--tempest-bg-selection-focused) !important" },
});
const rawTheme = EditorView.theme({
  ".cm-content": { fontFamily: "var(--font-mono, 'Geist Mono', monospace)", fontSize: "12px" },
});
const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

// ── Formatting commands ────────────────────────────────────────────────────
// Thin CM wrappers around the pure transforms in markdownEdit.ts. `wrap` acts
// on the selected span (inline marks); `lineOp` acts on every line the
// selection touches (headings / lists / quote).
function wrap(view: EditorView, before: string, after = before) {
  const r = view.state.selection.main;
  const out = applyWrap(view.state.sliceDoc(r.from, r.to), before, after);
  const delta = out.length - (r.to - r.from);
  view.dispatch({
    changes: { from: r.from, to: r.to, insert: out },
    selection: EditorSelection.range(r.from, r.to + delta),
    userEvent: "input",
  });
  view.focus();
}
function lineOp(view: EditorView, op: LineOp) {
  const { doc } = view.state;
  const first = doc.lineAt(view.state.selection.main.from);
  const last = doc.lineAt(view.state.selection.main.to);
  const lines = [];
  for (let n = first.number; n <= last.number; n++) lines.push(doc.line(n).text);
  const out = applyLineOp(lines, op).join("\n");
  view.dispatch({
    changes: { from: first.from, to: last.to, insert: out },
    selection: EditorSelection.range(first.from, first.from + out.length),
    userEvent: "input",
  });
  view.focus();
}

// Toolbar layout — shared by the top strip and the selection bubble. `null` is
// a divider. Icons are Lucide; `run` is the CM command for that button.
type Tool = { title: string; Icon: typeof Bold; run: (v: EditorView) => void };
const TOOLS: (Tool | null)[] = [
  { title: "Heading 1", Icon: Heading1, run: (v) => lineOp(v, "h1") },
  { title: "Heading 2", Icon: Heading2, run: (v) => lineOp(v, "h2") },
  { title: "Heading 3", Icon: Heading3, run: (v) => lineOp(v, "h3") },
  null,
  { title: "Bold", Icon: Bold, run: (v) => wrap(v, "**") },
  { title: "Italic", Icon: Italic, run: (v) => wrap(v, "*") },
  { title: "Strikethrough", Icon: Strikethrough, run: (v) => wrap(v, "~~") },
  { title: "Underline", Icon: Underline, run: (v) => wrap(v, "<u>", "</u>") },
  { title: "Code", Icon: Code, run: (v) => wrap(v, "`") },
  null,
  { title: "Bullet list", Icon: List, run: (v) => lineOp(v, "bullet") },
  { title: "Numbered list", Icon: ListOrdered, run: (v) => lineOp(v, "numbered") },
  { title: "Quote", Icon: Quote, run: (v) => lineOp(v, "quote") },
];

export function TextNode({ id, data }: { id: string; data?: { collapsed?: boolean } }) {
  const collapsed = data?.collapsed ?? false;
  const { deleteElements } = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const bodyRef = useRef<string>(getNodeData<{ body?: string }>(id).body ?? "");
  const previewCompartment = useRef(new Compartment());
  const editCompartment = useRef(new Compartment());
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState(false);
  const [words, setWords] = useState(() => wordCount(bodyRef.current));
  const [title, setTitle] = useState(() => getNodeData<{ title?: string }>(id).title ?? "new note");
  const [editingTitle, setEditingTitle] = useState(false);
  const [copied, setCopied] = useState(false);
  const titleScale = useZoomCounterScale();
  // Screen coords of the floating selection toolbar, or null when hidden.
  const [bubble, setBubble] = useState<{ left: number; top: number } | null>(null);

  // Run a toolbar/bubble command against the live editor. Ensures edit mode so
  // the change sticks and the caret stays put for continued typing.
  const applyFmt = (run: (v: EditorView) => void) => {
    const v = viewRef.current;
    if (!v) return;
    if (!editing) setEditing(true);
    run(v);
  };

  function commitTitle() {
    setEditingTitle(false);
    const t = title.trim() || "new note";
    setTitle(t);
    patchNodeData(id, { title: t });
  }

  // Recreate the editor whenever the container mounts — including on expand from
  // collapsed, where the old body DOM was unmounted (containerRef went null) and
  // this effect must re-attach a fresh EditorView. `collapsed` in the deps forces
  // that teardown/rebuild; the doc is seeded from bodyRef (latest, committed on
  // collapse), so no content is lost across minimize/maximize.
  useEffect(() => {
    if (!containerRef.current) return;
    const commit = () => patchNodeData(id, { body: bodyRef.current });

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: bodyRef.current,
        extensions: [
          // Deliberately NOT `minimalSetup` — it bundles defaultHighlightStyle,
          // which underlines headings. Live preview does its own styling, so we
          // take only history/selection/keymap and skip the highlight style.
          highlightSpecialChars(),
          history(),
          drawSelection(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          baseTheme,
          previewCompartment.current.of([markdownLivePreview, livePreviewTheme]),
          // Starts read-only: the whole node is a drag handle until you
          // double-click into it (see the `editing` effect below).
          editCompartment.current.of(EditorView.editable.of(false)),
          placeholder("Write markdown…"),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) {
              bodyRef.current = u.state.doc.toString();
              setWords(wordCount(bodyRef.current));
              // Mirror-only: a connected chat node reads current text before blur.
              patchNodeDataLocal(id, { body: bodyRef.current });
            }
            // Show the bubble toolbar above a non-empty selection; hide it
            // otherwise. Coords are screen px (survive canvas zoom/pan).
            if (u.selectionSet || u.docChanged || u.focusChanged) {
              const sel = u.state.selection.main;
              const c = !sel.empty && u.view.hasFocus ? u.view.coordsAtPos(sel.from) : null;
              setBubble(c ? { left: (c.left + c.right) / 2, top: c.top } : null);
            }
          }),
          EditorView.domEventHandlers({ blur: () => { commit(); setEditing(false); setBubble(null); return false; } }),
        ],
      }),
    });
    viewRef.current = view;
    return () => { commit(); view.destroy(); viewRef.current = null; };
  }, [id, collapsed]);

  // Double-click enters edit mode: the editor becomes editable + focused;
  // blur (handled above) drops back to read-only so the node drags again.
  useEffect(() => {
    const v = viewRef.current;
    if (!v) return;
    v.dispatch({ effects: editCompartment.current.reconfigure(EditorView.editable.of(editing)) });
    if (editing) v.focus();
  }, [editing]);

  function toggleRaw() {
    const next = !raw;
    setRaw(next);
    viewRef.current?.dispatch({
      effects: previewCompartment.current.reconfigure(
        next ? [rawTheme] : [markdownLivePreview, livePreviewTheme],
      ),
    });
  }

  // Shared button row for the top strip and the selection bubble. mousedown is
  // prevented so clicking a button doesn't blur the editor (which would drop
  // edit mode and clear the selection before the command runs).
  const toolButtons = TOOLS.map((t, i) =>
    t === null ? (
      <span key={i} className="tnode-tool-sep" />
    ) : (
      <button
        key={i}
        className="tnode-tool"
        title={t.title}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyFmt(t.run)}
      >
        <t.Icon size={15} />
      </button>
    ),
  );

  if (collapsed) return <CollapsedNode id={id} />;

  return (
    <div
      className="tnode-card"
      style={{
        width: "100%", height: "100%", boxSizing: "border-box",
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: "var(--tempest-bg-elevated, #161616)",
        border: "1px solid var(--tempest-border-subtle, #2a2a2a)",
        borderRadius: 8,
      }}
    >
      {/* One full-edge resize control per side (always mounted). The strip is an
          invisible hit-area; a grip pill sits at the midpoint and fades in while
          hovering that edge. Left/right resize width, top/bottom resize height. */}
      {(["top", "right", "bottom", "left"] as const).map((pos) => (
        <NodeResizeControl
          key={pos}
          position={pos}
          variant={ResizeControlVariant.Line}
          minWidth={180}
          minHeight={120}
          className={`tnode-edge tnode-edge--${pos}`}
        >
          <span className={`tnode-grip tnode-grip--${pos === "left" || pos === "right" ? "v" : "h"}`} />
        </NodeResizeControl>
      ))}

      {/* Header — drag handle. Title pill (left), then trash + connector (right).
          The gap between the pill and the buttons stays draggable. */}
      <div
        style={{
          flex: "0 0 auto", padding: "6px 8px", cursor: "grab", userSelect: "none",
          display: "flex", alignItems: "center", gap: 6,
        }}
      >
        <NodeConnector nodeId={id} side="left" />

        <div
          className="tnode-title-pill nodrag"
          onDoubleClick={() => setEditingTitle(true)}
          style={{ transform: `scale(${titleScale})`, transformOrigin: "left center" }}
        >
          {editingTitle ? (
            <input
              className="tnode-title-input"
              autoFocus
              value={title}
              style={{ width: `${Math.max(title.length, 4) + 1}ch` }}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitTitle();
                else if (e.key === "Escape") { setTitle(getNodeData<{ title?: string }>(id).title ?? "new note"); setEditingTitle(false); }
                e.stopPropagation();
              }}
              onFocus={(e) => e.currentTarget.select()}
            />
          ) : (
            <>
              <span className="tnode-title-text">{title}</span>
              <button className="tnode-title-edit" title="Rename note" onClick={() => setEditingTitle(true)}>
                <Pencil size={11} strokeWidth={2.2} />
              </button>
            </>
          )}
        </div>

        {/* draggable gap */}
        <div style={{ flex: 1 }} />

        {/* Copy the note body to the clipboard; icon flips to a check for 1.5s. */}
        <button
          className="tnode-header-btn nodrag"
          title={copied ? "Copied" : "Copy text"}
          onClick={(e) => {
            e.stopPropagation();
            void navigator.clipboard.writeText(bodyRef.current);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>

        {/* Delete this node. */}
        <button
          className="tnode-header-btn nodrag"
          title="Delete note"
          onClick={(e) => { e.stopPropagation(); void deleteElements({ nodes: [{ id }] }); }}
        >
          <Trash2 size={13} />
        </button>

        {/* Connector (rightmost). connectOnClick is on, so a single click starts
            the line; it fills yellow while connecting. */}
        <NodeConnector nodeId={id} side="right" />
      </div>

      {/* Text toolbar — icon-only formatting controls, driven by TOOLS. */}
      <div className="tnode-toolbar nodrag">{toolButtons}</div>

      {/* Body — live-preview editor. Read-only + click-through until you
          double-click, so the whole node drags in the meantime. */}
      <div
        ref={containerRef}
        className={`tnode-body${editing ? " editing nodrag nowheel" : ""}`}
        style={{ flex: "1 1 auto", minHeight: 0, overflow: "hidden" }}
        onDoubleClick={() => setEditing(true)}
      />

      {/* Footer — word count + rendered/raw toggle. */}
      <div
        className="nodrag"
        style={{
          flex: "0 0 auto", padding: "4px 10px", display: "flex", alignItems: "center",
          color: "var(--tempest-fg-muted, #888)",
          font: '11px "Geist", system-ui, sans-serif',
        }}
      >
        <span>{words} {words === 1 ? "word" : "words"}</span>
        <button
          onClick={toggleRaw}
          title={raw ? "Show rendered markdown" : "Show raw markdown"}
          style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: 4,
            background: "none", border: "none", cursor: "pointer", padding: 2,
            color: "var(--tempest-fg-muted, #888)", font: "inherit",
          }}
        >
          {raw ? <Eye size={13} /> : <Code2 size={13} />}
          {raw ? "Rendered" : "Raw"}
        </button>
      </div>

      {/* Floating selection toolbar — same buttons, hovering above the
          selection like a professional editor. Portaled to <body> so it isn't
          clipped by the node or the canvas viewport. */}
      {bubble &&
        createPortal(
          <div
            className="tnode-bubble"
            style={{ left: bubble.left, top: bubble.top }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {toolButtons}
          </div>,
          document.body,
        )}
    </div>
  );
}
