import { useRef, useState, useEffect, useCallback } from "react";
import { X, Eye, Globe, FileCode, MessageSquare, TerminalSquare } from "lucide-react";
import { AgentIcon } from "./NewSessionMenu";
import { WorkStateBadge, QueueBadge } from "./SessionBadges";
import ProgressiveBlur from "./ProgressiveBlur";

export interface SessionTab {
  id: string;
  name: string;
  kind?: "terminal" | "diff" | "preview" | "editor" | "chat";
  agent?: string;
}

interface Props {
  sessions: SessionTab[];
  activeSessionId: string | null;
  tabsMode: string;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  dragTabId: string | null;
  dragOverTabId: string | null;
  dragOverSide: "before" | "after";
  onDragStart: (id: string, e: React.DragEvent<HTMLButtonElement>) => void;
  onDragOver: (id: string, e: React.DragEvent<HTMLButtonElement>) => void;
  onDrop: (id: string, e: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  onDragLeave: (e: React.DragEvent) => void;
  renamingSessionId: string | null;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameCommit: () => void;
  onRenameClear: () => void;
  onRenameStart: (id: string, name: string) => void;
  onQueueClick: (id: string, e: React.MouseEvent) => void;
}

function SessionIcon({ session }: { session: SessionTab }) {
  if (session.kind === "diff")    return <Eye            size={13} className="agent-icon" />;
  if (session.kind === "preview") return <Globe          size={13} className="agent-icon" />;
  if (session.kind === "editor")  return <FileCode       size={13} className="agent-icon" />;
  if (session.kind === "chat")    return <MessageSquare  size={13} className="agent-icon" />;
  if (session.agent)              return <AgentIcon hint={session.agent} size={13} />;
  return                                 <TerminalSquare size={13} className="agent-icon" />;
}

export default function AgentTabs({
  sessions, activeSessionId, tabsMode,
  onTabClick, onTabClose,
  dragTabId, dragOverTabId, dragOverSide,
  onDragStart, onDragOver, onDrop, onDragEnd, onDragLeave,
  renamingSessionId, renameValue, onRenameChange, onRenameCommit, onRenameClear, onRenameStart,
  onQueueClick,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeft,  setShowLeft]  = useState(false);
  const [showRight, setShowRight] = useState(false);
  const useBlur = tabsMode === "designer";

  const syncBlur = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeft(el.scrollLeft > 1);
    setShowRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
  }, []);

  useEffect(() => {
    if (!useBlur) return;
    const el = scrollRef.current;
    if (!el) return;
    syncBlur();
    el.addEventListener("scroll", syncBlur, { passive: true });
    const ro = new ResizeObserver(syncBlur);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", syncBlur);
      ro.disconnect();
    };
  }, [useBlur, syncBlur, sessions.length]);

  const strip = (
    <div className="agent-tabs" ref={scrollRef} onDragLeave={onDragLeave}>
      {sessions.map((s, i) => {
        const isActive     = s.id === activeSessionId;
        const isDragging   = dragTabId === s.id;
        const isDropTarget = dragOverTabId === s.id && !isDragging;
        const cls = [
          "agent-box",
          isActive ? "active" : "",
          isDragging ? "session-tab--dragging" : "",
          isDropTarget && dragOverSide === "before" ? "session-tab--drop-before" : "",
          isDropTarget && dragOverSide === "after"  ? "session-tab--drop-after"  : "",
        ].filter(Boolean).join(" ");

        return (
          <div key={s.id} style={{ display: "contents" }}>
            {i > 0 && <div className="sep" />}
            <button
              draggable
              className={cls}
              onDragStart={(e) => onDragStart(s.id, e)}
              onDragOver={(e)  => onDragOver(s.id, e)}
              onDrop={(e)      => onDrop(s.id, e)}
              onDragEnd={onDragEnd}
              onClick={() => onTabClick(s.id)}
            >
              <SessionIcon session={s} />
              {renamingSessionId === s.id ? (
                <input
                  className="session-tab-rename"
                  value={renameValue}
                  onChange={(e) => onRenameChange(e.target.value)}
                  onBlur={onRenameCommit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter")  onRenameCommit();
                    if (e.key === "Escape") onRenameClear();
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span
                  className="session-tab-name"
                  onDoubleClick={(e) => { e.stopPropagation(); onRenameStart(s.id, s.name); }}
                >
                  {s.name}
                </span>
              )}
              {s.agent && <WorkStateBadge sessionId={s.id} />}
              {s.agent && (
                <QueueBadge sessionId={s.id} onClick={(e) => onQueueClick(s.id, e)} />
              )}
              <button className="tab-close" onClick={(e) => { e.stopPropagation(); onTabClose(s.id); }}>
                <X />
              </button>
            </button>
          </div>
        );
      })}

    </div>
  );

  if (useBlur) {
    return (
      <div className="agent-tabs-blur-wrap">
        {strip}
        {showLeft  && <ProgressiveBlur direction="left"  size={28} />}
        {showRight && <ProgressiveBlur direction="right" size={28} />}
      </div>
    );
  }

  return strip;
}
