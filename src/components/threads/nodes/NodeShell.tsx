import { useState, type ReactNode } from "react";
import { NodeResizeControl, ResizeControlVariant, useReactFlow } from "@xyflow/react";
import { Pencil, Trash2 } from "lucide-react";
import { NodeConnector } from "./NodeConnector";
import { useZoomCounterScale } from "./useZoomCounterScale";
import { CollapsedNode } from "./CollapsedNode";
import { getNodeData, patchNodeData } from "../../../store/threads";

// Shared card shell for the "content" nodes (image/file/site/media). Text and
// chat nodes hand-roll their shells because their bodies (CodeMirror, message
// stream + composer) drive their own dimensions and behavior; the four content
// nodes share the same layout — resize edges, header with title pill + delete +
// connectors, a fixed body area. Factoring here avoids ~150 lines × 4.

export function NodeShell({
  id,
  data,
  defaultTitle,
  headerRight,
  children,
  minWidth = 200,
  minHeight = 120,
  autoHeight = false,
}: {
  id: string;
  data?: { collapsed?: boolean };
  defaultTitle: string;
  /** Header action buttons to render before the delete button. */
  headerRight?: ReactNode;
  children: ReactNode;
  minWidth?: number;
  minHeight?: number;
  /** Height driven by content — omits top/bottom resize handles. */
  autoHeight?: boolean;
}) {
  const { deleteElements } = useReactFlow();
  const [title, setTitle] = useState(() => getNodeData<{ title?: string }>(id).title ?? defaultTitle);
  const [editingTitle, setEditingTitle] = useState(false);
  const titleScale = useZoomCounterScale();

  function commitTitle() {
    setEditingTitle(false);
    const t = title.trim() || defaultTitle;
    setTitle(t);
    patchNodeData(id, { title: t });
  }

  if (data?.collapsed) return <CollapsedNode id={id} />;

  const edgeSides = autoHeight ? (["right", "left"] as const) : (["top", "right", "bottom", "left"] as const);

  return (
    <div
      className="tnode-card"
      style={{
        width: "100%",
        height: autoHeight ? undefined : "100%",
        minHeight: autoHeight ? 160 : undefined,
        boxSizing: "border-box",
        display: "flex", flexDirection: "column", overflow: "hidden",
        background: "var(--tempest-bg-elevated, #161616)",
        border: "1px solid var(--tempest-border-subtle, #2a2a2a)",
        borderRadius: 8,
      }}
    >
      {edgeSides.map((pos) => (
        <NodeResizeControl
          key={pos}
          position={pos}
          variant={ResizeControlVariant.Line}
          minWidth={minWidth}
          {...(autoHeight ? {} : { minHeight })}
          className={`tnode-edge tnode-edge--${pos}`}
        >
          <span className={`tnode-grip tnode-grip--${pos === "left" || pos === "right" ? "v" : "h"}`} />
        </NodeResizeControl>
      ))}

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
                else if (e.key === "Escape") { setTitle(getNodeData<{ title?: string }>(id).title ?? defaultTitle); setEditingTitle(false); }
                e.stopPropagation();
              }}
              onFocus={(e) => e.currentTarget.select()}
            />
          ) : (
            <>
              <span className="tnode-title-text">{title}</span>
              <button className="tnode-title-edit" title="Rename node" onClick={() => setEditingTitle(true)}>
                <Pencil size={11} strokeWidth={2.2} />
              </button>
            </>
          )}
        </div>

        <div style={{ flex: 1 }} />

        {headerRight}

        <button
          className="tnode-header-btn nodrag"
          title="Delete node"
          onClick={(e) => { e.stopPropagation(); void deleteElements({ nodes: [{ id }] }); }}
        >
          <Trash2 size={13} />
        </button>

        <NodeConnector nodeId={id} side="right" />
      </div>

      {children}
    </div>
  );
}
