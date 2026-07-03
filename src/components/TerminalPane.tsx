import { memo, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { SearchAddon } from "@xterm/addon-search";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { useTheme } from "../themes/ThemeContext";
import { getSettings, useSettings } from "../store/appSettings";
import { getBindings, matchesEvent } from "../store/keybindings";
import { sessionManager } from "../store/sessionManager";
import { webglPool } from "../lib/webglPool";
import "@xterm/xterm/css/xterm.css";
import "./TerminalPane.css";

interface Props {
  sessionId: string;
  hidden?: boolean;
  isAgent?: boolean;
}

function getTerminalTheme() {
  const s = getComputedStyle(document.documentElement);
  const v = (name: string) => s.getPropertyValue(`--tempest-${name}`).trim();
  return {
    background:          v("bg-editor"),
    foreground:          v("terminal-fg"),
    cursor:              v("terminal-fg"),
    cursorAccent:        v("bg-editor"),
    selectionBackground: v("terminal-selection"),
    black:               v("terminal-black"),
    red:                 v("terminal-red"),
    green:               v("terminal-green"),
    yellow:              v("terminal-yellow"),
    blue:                v("terminal-blue"),
    magenta:             v("terminal-purple"),
    cyan:                v("terminal-cyan"),
    white:               v("terminal-white"),
    brightBlack:         v("terminal-brightBlack"),
    brightRed:           v("terminal-brightRed"),
    brightGreen:         v("terminal-brightGreen"),
    brightYellow:        v("terminal-brightYellow"),
    brightBlue:          v("terminal-brightBlue"),
    brightMagenta:       v("terminal-brightPurple"),
    brightCyan:          v("terminal-brightCyan"),
    brightWhite:         v("terminal-brightWhite"),
  };
}

export const TerminalPane = memo(function TerminalPane({ sessionId, hidden = false, isAgent = false }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  // Stable reference to the data callback so attach/detach always use the same function identity.
  const onDataRef = useRef<(data: string) => void>(() => {});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { theme } = useTheme();
  const settings = useSettings();

  const fitIfVisible = () => {
    const c = containerRef.current;
    if (!c || c.offsetWidth === 0 || c.offsetHeight === 0) return;
    fitAddonRef.current?.fit();
  };

  // Hot-swap theme on existing terminal without touching the PTY session.
  useEffect(() => {
    if (termRef.current) termRef.current.options.theme = getTerminalTheme();
  }, [theme]);

  // Hot-swap terminal display settings without recreating the session.
  useEffect(() => {
    const t = termRef.current;
    if (!t) return;
    t.options.fontSize = settings.terminalFontSize;
    t.options.fontFamily = `"${settings.terminalFontFamily}", monospace`;
    t.options.cursorStyle = settings.terminalCursorStyle;
    t.options.cursorBlink = settings.terminalCursorBlink;
    t.options.scrollback = settings.terminalScrollback;
    requestAnimationFrame(fitIfVisible);
  }, [settings.terminalFontSize, settings.terminalFontFamily, settings.terminalCursorStyle, settings.terminalCursorBlink, settings.terminalScrollback]);

  // Create terminal once per sessionId. Work-done detection, buffering, and channel
  // ownership all live in the SessionManager — TerminalPane is a thin renderer.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const s = getSettings();
    const term = new Terminal({
      theme: getTerminalTheme(),
      fontFamily: `"${s.terminalFontFamily}", monospace`,
      fontSize: s.terminalFontSize,
      cursorStyle: s.terminalCursorStyle,
      cursorBlink: s.terminalCursorBlink,
      scrollback: s.terminalScrollback,
      allowProposedApi: true,
    });
    termRef.current = term;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    const searchAddon = new SearchAddon();
    searchAddonRef.current = searchAddon;
    term.loadAddon(searchAddon);

    term.loadAddon(new WebLinksAddon((_, url) => openUrl(url).catch(() => {})));

    term.open(el);

    // Register as a renderer with the Session Manager and replay any buffered output.
    // The Manager owns the Channel and runs work-done detection independently.
    const onData = (data: string) => term.write(data);
    onDataRef.current = onData;
    const buffered = sessionManager.attach(sessionId, onData);
    for (const chunk of buffered) term.write(chunk);

    const fitAndResize = () => {
      if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
      fitAddon.fit();
      invoke("resize_pty", { sessionId, rows: term.rows, cols: term.cols }).catch(() => {});
    };

    // Two rAFs: first yields to layout, second reads committed dimensions.
    requestAnimationFrame(() => requestAnimationFrame(fitAndResize));

    term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      invoke("write_to_pty", { sessionId, data: bytes }).catch(() => {});
      // Signal Enter to the Manager so it can arm the work-done timer. Manager
      // checks isAgent internally — this is a no-op for plain terminal sessions.
      if (isAgent && data.includes("\r")) sessionManager.markUserInput(sessionId);
    });

    // Feed OSC 0/2 title changes into the Session Manager so it can classify
    // the agent's busy/idle state from the title (e.g. Claude Code's ✳ glyph).
    if (isAgent) {
      term.onTitleChange((title) => sessionManager.updateTitle(sessionId, title));
    }

    const observer = new ResizeObserver(() => {
      if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
      if (resizeTimerRef.current !== null) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(fitAndResize, 16);
    });
    observer.observe(el);

    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;

      // Ctrl/Cmd+F toggles the in-terminal search bar.
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        setSearchOpen((o) => !o);
        return false;
      }

      // Plain Ctrl+C: smart copy-or-SIGINT (Windows Terminal / iTerm2 behaviour).
      // With a selection, copy it and swallow the key; otherwise let xterm send
      // SIGINT to the PTY.
      if (e.ctrlKey && !e.shiftKey && (e.key === "C" || e.key === "c")) {
        const sel = term.getSelection();
        if (sel) {
          navigator.clipboard.writeText(sel).catch(() => {});
          return false; // copy; don't send SIGINT
        }
        return true; // no selection → send SIGINT
      }

      // Plain Ctrl+V pastes clipboard contents into the terminal.
      if (e.ctrlKey && !e.shiftKey && (e.key === "V" || e.key === "v")) {
        readText().then((text) => { if (text) term.paste(text); }).catch(() => {});
        return false;
      }

      // Ctrl+Shift+C copies the current terminal selection to the clipboard.
      if (e.ctrlKey && e.shiftKey && (e.key === "C" || e.key === "c")) {
        const selection = term.getSelection();
        if (selection) navigator.clipboard.writeText(selection).catch(() => {});
        return false;
      }

      // Ctrl+Shift+V pastes clipboard contents into the terminal.
      if (e.ctrlKey && e.shiftKey && (e.key === "V" || e.key === "v")) {
        readText().then((text) => { if (text) term.paste(text); }).catch(() => {});
        return false;
      }

      // Let app-level shortcuts (e.g. Ctrl+Shift+T, Ctrl+B, Ctrl+Shift+M) pass
      // through instead of being consumed by the PTY. Returning false stops xterm
      // from calling preventDefault, so WorkspaceView's capture-phase keydown
      // listener can act on them. Bindings are read live so this stays in sync
      // with any user customisations.
      if (Object.values(getBindings()).some((sc) => matchesEvent(sc, e))) {
        return false;
      }

      return true;
    });

    return () => {
      if (resizeTimerRef.current !== null) clearTimeout(resizeTimerRef.current);
      sessionManager.detach(sessionId, onDataRef.current);
      webglPool.release(sessionId);
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      observer.disconnect();
      term.dispose();
    };
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Manage WebGL context on show/hide. Releasing on hide returns the context to the
  // OS pool so other visible panes can use it. Re-acquiring on show ensures the
  // active pane always gets GPU rendering up to the pool cap (6 contexts).
  useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    if (hidden) {
      webglPool.release(sessionId);
    } else {
      webglPool.acquire(term, sessionId);
      requestAnimationFrame(() => requestAnimationFrame(fitIfVisible));
    }
  }, [hidden, sessionId]);

  // Repaint after minimize/restore. WebView2 may drop the rendered content when the
  // window is minimized; when focus returns, force xterm to redraw all visible rows.
  useEffect(() => {
    const onFocus = () => {
      const term = termRef.current;
      if (!term || hidden) return;
      webglPool.acquire(term, sessionId);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        fitIfVisible();
        termRef.current?.refresh(0, (termRef.current?.rows ?? 1) - 1);
      }));
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [sessionId, hidden]);

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    if (q) searchAddonRef.current?.findNext(q, { incremental: true });
  }

  return (
    <div
      className="terminal-pane-wrapper"
      style={hidden ? { display: "none" } : undefined}
    >
      {searchOpen && (
        <div className="terminal-search-bar">
          <input
            className="terminal-search-input"
            type="text"
            placeholder="Search…"
            value={searchQuery}
            autoFocus
            onChange={(e) => handleSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.shiftKey
                  ? searchAddonRef.current?.findPrevious(searchQuery)
                  : searchAddonRef.current?.findNext(searchQuery);
              }
              if (e.key === "Escape") {
                setSearchOpen(false);
                setSearchQuery("");
              }
              e.stopPropagation();
            }}
          />
          <button
            className="terminal-search-close"
            onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
            aria-label="Close search"
          >
            ×
          </button>
        </div>
      )}
      <div ref={containerRef} className="terminal-pane" />
    </div>
  );
});
