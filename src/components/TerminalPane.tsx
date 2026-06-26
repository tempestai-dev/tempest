import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { SearchAddon } from "@xterm/addon-search";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTheme } from "../themes/ThemeContext";
import { setWorkState, getWorkState } from "../store/workState";
import { getSettings, useSettings } from "../store/appSettings";
import "@xterm/xterm/css/xterm.css";
import "./TerminalPane.css";

interface Props {
  sessionId: string;
  hidden?: boolean;
  isAgent?: boolean;
  onAgentDone?: () => void;
  onOutputChunk?: (data: string) => void;
}

// Idle period (ms) with no PTY output before an active agent is considered "done".
const QUIET_MS = 4000;
// Window (ms) after the user presses Enter during which "done" signals are ignored,
// so the shell/agent echo of the just-sent line can't immediately trip the timer.
const DEAD_ZONE_MS = 300;

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

export function TerminalPane({ sessionId, hidden = false, isAgent = false, onAgentDone, onOutputChunk }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const onAgentDoneRef = useRef(onAgentDone);
  onAgentDoneRef.current = onAgentDone;
  const onOutputChunkRef = useRef(onOutputChunk);
  onOutputChunkRef.current = onOutputChunk;
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { theme } = useTheme();
  const settings = useSettings();

  // Keep the latest isAgent flag readable from inside the (stable) event handlers
  // without re-creating the terminal when the prop changes.
  const isAgentRef = useRef(isAgent);
  isAgentRef.current = isAgent;

  // Refit when this tab is revealed. Double rAF gives the browser two frames to
  // finish flex layout before xterm measures the container.
  useEffect(() => {
    if (!hidden && fitAddonRef.current) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => fitAddonRef.current?.fit());
      });
    }
  }, [hidden]);

  // Hot-swap theme on existing terminal without touching the PTY session
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getTerminalTheme();
    }
  }, [theme]);

  // Hot-swap terminal display settings without recreating the session
  useEffect(() => {
    const t = termRef.current;
    if (!t) return;
    t.options.fontSize = settings.terminalFontSize;
    t.options.fontFamily = `"${settings.terminalFontFamily}", monospace`;
    t.options.cursorStyle = settings.terminalCursorStyle;
    t.options.cursorBlink = settings.terminalCursorBlink;
    t.options.scrollback = settings.terminalScrollback;
    requestAnimationFrame(() => fitAddonRef.current?.fit());
  }, [settings.terminalFontSize, settings.terminalFontFamily, settings.terminalCursorStyle, settings.terminalCursorBlink, settings.terminalScrollback]);

  // Create terminal once per sessionId
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

    // fit
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    term.loadAddon(fitAddon);

    // unicode11 — correct CJK/emoji glyph widths; must be activated after load
    const unicode11 = new Unicode11Addon();
    term.loadAddon(unicode11);
    term.unicode.activeVersion = "11";

    // search
    const searchAddon = new SearchAddon();
    searchAddonRef.current = searchAddon;
    term.loadAddon(searchAddon);

    // web-links — Ctrl/Cmd+click to open URLs in the system browser
    term.loadAddon(
      new WebLinksAddon((_, url) => {
        openUrl(url).catch(() => {});
      })
    );

    term.open(el);

    // WebGL renderer — try GPU path, fall back to canvas silently
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => webgl.dispose());
      term.loadAddon(webgl);
    } catch {
      // software rasterizer or WebGL unavailable — canvas renderer used automatically
    }

    // Two rAFs: first lets the browser compute flex layout after mount, second
    // fires after the layout pass so xterm reads the correct container dimensions.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fitAddon.fit();
        invoke("resize_pty", { sessionId, rows: term.rows, cols: term.cols }).catch(() => {});
      });
    });

    // ── Work-done detection (agent sessions only) ──────────────────────────
    let quietTimer: ReturnType<typeof setTimeout> | null = null;
    let deadZoneUntil = 0; // timestamp; "done" signals before this are suppressed

    const clearQuietTimer = () => {
      if (quietTimer !== null) {
        clearTimeout(quietTimer);
        quietTimer = null;
      }
    };

    // Mark the agent done unless we're still inside the post-Enter dead zone or
    // it isn't actually working. Resets any pending quiet timer.
    const markDone = () => {
      clearQuietTimer();
      if (Date.now() < deadZoneUntil) return;
      if (getWorkState(sessionId) === "working") {
        setWorkState(sessionId, "done");
        onAgentDoneRef.current?.();
      }
    };

    const scheduleQuiet = () => {
      clearQuietTimer();
      quietTimer = setTimeout(markDone, QUIET_MS);
    };

    const unlistenPromise = listen<{ session_id: string; data: string }>(
      "pty-output",
      (event) => {
        if (event.payload.session_id !== sessionId) return;
        const data = event.payload.data;
        term.write(data);
        onOutputChunkRef.current?.(data);

        if (!isAgentRef.current) return;

        // OSC 9 (Claude Code "Send notification") → done immediately.
        // ESC ] 9 ; ... — terminated by BEL (\x07) or ST (ESC \).
        if (data.includes("\x1b]9;")) {
          markDone();
          return;
        }

        // Any other output means the agent is still producing — (re)arm the
        // byte-quiet timer so "done" only fires after QUIET_MS of silence.
        if (getWorkState(sessionId) === "working") {
          scheduleQuiet();
        }
      }
    );

    term.onData((data) => {
      const bytes = Array.from(new TextEncoder().encode(data));
      invoke("write_to_pty", { sessionId, data: bytes }).catch(() => {});

      // Enter (CR) from the user → the agent is now working. Open a dead zone so
      // the echoed input can't immediately satisfy the byte-quiet "done" check.
      if (isAgentRef.current && data.includes("\r")) {
        deadZoneUntil = Date.now() + DEAD_ZONE_MS;
        setWorkState(sessionId, "working");
        scheduleQuiet();
      }
    });

    const observer = new ResizeObserver(() => {
      if (!containerRef.current || containerRef.current.offsetWidth === 0) return;
      fitAddon.fit();
      invoke("resize_pty", { sessionId, rows: term.rows, cols: term.cols }).catch(() => {});
    });
    observer.observe(el);

    // Intercept Ctrl/Cmd+F before xterm consumes it so we can toggle search.
    // Return false to suppress xterm's default handling for matched keys.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "f") {
        setSearchOpen((o) => !o);
        return false;
      }
      return true;
    });

    return () => {
      clearQuietTimer();
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      observer.disconnect();
      unlistenPromise.then((fn) => fn());
      term.dispose();
    };
  }, [sessionId]);

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
}
