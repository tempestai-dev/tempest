import { memo, useEffect, useRef, useState } from "react";
import { PencilLine, SplitSquareHorizontal, Keyboard, BookOpen } from "lucide-react";
import { Toolbar } from "../Toolbar";
import { Tooltip } from "../Tooltip";
import { NotesPopover } from "./NotesPopover";
import { PromptPickerPopover } from "./PromptPickerPopover";
import { getPrompts, type PromptEntry } from "../../store/prompts";

export interface TopBarProps {
  tabsMode: "designed" | "tabbed" | "ver1" | "designer";
  projectName: string;
  projectPath?: string;
  diffIconActive: boolean;
  onOpenDiffPicker: () => void;
  onOpenSettings: (section?: string) => void;
}

function TopBarImpl(props: TopBarProps) {
  const { tabsMode, projectName, projectPath, diffIconActive, onOpenDiffPicker, onOpenSettings } = props;

  const [notesOpen, setNotesOpen] = useState(false);
  const [notesPos, setNotesPos] = useState<{ top: number; right: number } | null>(null);
  const notesBtnRef = useRef<SVGSVGElement>(null);

  const [promptPickerOpen, setPromptPickerOpen] = useState(false);
  const [promptPickerItems, setPromptPickerItems] = useState<PromptEntry[]>([]);
  const [promptSentId, setPromptSentId] = useState<string | null>(null);
  const promptPickerRef = useRef<HTMLDivElement>(null);
  const promptBtnRef = useRef<SVGSVGElement>(null);
  const [promptPickerPos, setPromptPickerPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!notesOpen) return;
    if (notesBtnRef.current) {
      const r = notesBtnRef.current.getBoundingClientRect();
      setNotesPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      const inBtn = notesBtnRef.current?.contains(target);
      const inPicker = (e.target as Element)?.closest?.(".sub-bar-notes-picker");
      if (!inBtn && !inPicker) setNotesOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [notesOpen]);

  useEffect(() => {
    if (!promptPickerOpen) return;
    setPromptPickerItems(getPrompts().filter((p) => p.enabled));
    if (promptBtnRef.current) {
      const r = promptBtnRef.current.getBoundingClientRect();
      setPromptPickerPos({ top: r.bottom + 8, right: window.innerWidth - r.right });
    }
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      const inBtn = promptBtnRef.current?.contains(target);
      const inPicker = (e.target as Element)?.closest?.(".sub-bar-prompt-picker");
      if (!inBtn && !inPicker) setPromptPickerOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [promptPickerOpen]);

  return (
    <Toolbar
      tabsMode={tabsMode}
      projectName={projectName}
      rightActions={
        <>
          <Tooltip content="Notes" placement="bottom">
            <PencilLine
              ref={notesBtnRef}
              className={`topbar-icon${notesOpen ? " active" : ""}`}
              onClick={() => setNotesOpen((o) => !o)}
            />
          </Tooltip>
          {notesOpen && notesPos && (
            <NotesPopover
              pos={notesPos}
              projectPath={projectPath}
              projectName={projectName}
            />
          )}
          <Tooltip content="Open diff view" placement="bottom">
            <SplitSquareHorizontal
              className={`topbar-icon${diffIconActive ? " active" : ""}`}
              onClick={onOpenDiffPicker}
            />
          </Tooltip>
          <Tooltip content="Keyboard shortcuts" placement="bottom">
            <Keyboard
              className="topbar-icon"
              onClick={() => onOpenSettings("keyboard")}
            />
          </Tooltip>
          <div className="topbar-prompt-wrap" ref={promptPickerRef}>
            <Tooltip content="Prompts" placement="bottom">
              <BookOpen
                ref={promptBtnRef}
                className={`topbar-icon${promptPickerOpen ? " active" : ""}`}
                onClick={() => setPromptPickerOpen((o) => !o)}
              />
            </Tooltip>
            {promptPickerOpen && promptPickerPos && (
              <PromptPickerPopover
                pos={promptPickerPos}
                items={promptPickerItems}
                sentId={promptSentId}
                onCopy={(p) => {
                  navigator.clipboard.writeText(p.body);
                  setPromptSentId(p.id);
                  setTimeout(() => {
                    setPromptPickerOpen(false);
                    setPromptSentId(null);
                  }, 800);
                }}
                onManage={() => {
                  setPromptPickerOpen(false);
                  onOpenSettings("prompts");
                }}
              />
            )}
          </div>
        </>
      }
    />
  );
}

export const TopBar = memo(TopBarImpl);
