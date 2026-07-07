import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Globe, RefreshCw, ArrowLeft, ArrowRight, X,
  Smartphone, Tablet, Monitor, ExternalLink, Loader,
} from "lucide-react";
import "./PreviewPane.css";

// ── Constants ──────────────────────────────────────────────────────────────

const COMMON_PORTS = [
  { port: 5173, label: "Vite" },
  { port: 3000, label: "Next / CRA" },
  { port: 4173, label: "Vite preview" },
  { port: 8080, label: "Generic" },
];

type PresetKey = "mobile" | "tablet" | "desktop";

const PRESETS: Record<PresetKey, { w: number | null; h: number | null; label: string }> = {
  mobile:  { w: 375,  h: 812,  label: "Mobile"  },
  tablet:  { w: 768,  h: 1024, label: "Tablet"  },
  desktop: { w: null, h: null, label: "Desktop" },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function normalize(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^\d+$/.test(t)) return `http://localhost:${t}`;
  if (/^https?:\/\//i.test(t)) return t;
  return `http://${t}`;
}

function sameUrl(a: string, b: string): boolean {
  if (a === b) return true;
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    const pa = ua.pathname.replace(/\/$/, "") || "/";
    const pb = ub.pathname.replace(/\/$/, "") || "/";
    return ua.origin === ub.origin && pa === pb && ua.search === ub.search && ua.hash === ub.hash;
  } catch {
    return false;
  }
}

function detectPreset(w: number | null, h: number | null): PresetKey {
  if (w === 375 && h === 812) return "mobile";
  if (w === 768 && h === 1024) return "tablet";
  return "desktop";
}

// ── UrlPicker — shown when no URL is set yet ───────────────────────────────

function UrlPicker({ onNavigate }: { onNavigate: (url: string) => void }) {
  const [input, setInput] = useState("");

  function go(raw: string) {
    const url = normalize(raw);
    if (url) onNavigate(url);
  }

  return (
    <div className="preview-picker">
      <Globe size={36} className="preview-picker-icon" />

      <div className="preview-picker-text">
        <p className="preview-picker-title">Live Preview</p>
        <p className="preview-picker-subtitle">Enter a URL or port number to preview your dev server</p>
      </div>

      <div className="preview-picker-input-row">
        <div className="preview-picker-input">
          <Globe size={12} className="preview-picker-input-icon" />
          <input
            autoFocus
            placeholder="localhost:3000 or https://…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") go(input); }}
            spellCheck={false}
            className="preview-picker-text-input"
          />
        </div>
        <button className="preview-picker-go" onClick={() => go(input)}>Go</button>
      </div>

      <div className="preview-picker-ports">
        {COMMON_PORTS.map(({ port, label }) => (
          <button
            key={port}
            className="preview-picker-port-btn"
            onClick={() => onNavigate(`http://localhost:${port}`)}
          >
            :{port} <span className="preview-picker-port-label">{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── DimInput — clickable inline dimension value ────────────────────────────

function DimInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function commit() {
    const n = parseInt(draft, 10);
    if (!isNaN(n) && n > 0) onChange(n);
    else if (draft === "" || draft.toLowerCase() === "auto") onChange(null);
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") setEditing(false);
          e.stopPropagation();
        }}
        onBlur={commit}
        className="preview-dim-editing"
        style={{ width: `${Math.max(3, draft.length)}ch` }}
      />
    );
  }

  return (
    <span
      className="preview-dim-value"
      onClick={() => { setEditing(true); setDraft(value !== null ? String(value) : ""); }}
      title="Click to edit"
    >
      {value !== null ? value : "Auto"}
    </span>
  );
}

// ── PreviewPane ────────────────────────────────────────────────────────────

interface Props {
  sessionId: string;
  hidden: boolean;
  previewUrl?: string;
  onUrlChange: (url: string) => void;
  suppressPanel?: boolean;
}

export function PreviewPane({ sessionId, hidden, previewUrl, onUrlChange, suppressPanel }: Props) {
  const panelId = `preview-${sessionId}`;
  const containerRef = useRef<HTMLDivElement>(null);
  const outerWrapperRef = useRef<HTMLDivElement>(null);
  const panelEmbedded = useRef(false);
  const urlBarFocusedRef = useRef(false);
  const expectedNavUrlRef = useRef<string | null>(null);
  // Tracks the most recently committed display URL so onBlur reverts correctly
  // even when state updates from navigation are still queued.
  const currentDisplayUrlRef = useRef(previewUrl ?? "");

  const [history, setHistory] = useState<string[]>(previewUrl ? [previewUrl] : []);
  const [historyIdx, setHistoryIdx] = useState(previewUrl ? 0 : -1);
  const [inputUrl, setInputUrl] = useState(previewUrl ?? "");
  const [reloadKey, setReloadKey] = useState(0);
  const [viewW, setViewW] = useState<number | null>(null);
  const [viewH, setViewH] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const url = historyIdx >= 0 ? history[historyIdx] : null;
  const canGoBack = historyIdx > 0;
  const canGoForward = historyIdx < history.length - 1;
  const activePreset = detectPreset(viewW, viewH);

  function pushEntry(to: string) {
    expectedNavUrlRef.current = to;
    currentDisplayUrlRef.current = to;
    setHistory((prev) => [...prev.slice(0, historyIdx + 1), to]);
    setHistoryIdx(historyIdx + 1);
    setInputUrl(to);
    onUrlChange(to);
  }

  function navigateFresh(to: string) {
    expectedNavUrlRef.current = to;
    currentDisplayUrlRef.current = to;
    setLoading(true);
    setHistory([to]);
    setHistoryIdx(0);
    setInputUrl(to);
    onUrlChange(to);
  }

  function moveTo(nextIdx: number) {
    const to = history[nextIdx];
    if (!to) return;
    expectedNavUrlRef.current = to;
    currentDisplayUrlRef.current = to;
    setLoading(true);
    setHistoryIdx(nextIdx);
    setInputUrl(to);
    onUrlChange(to);
  }

  function handleUrlBarNavigate(raw: string) {
    const next = normalize(raw);
    if (!next) return;
    setLoading(true);
    if (url && sameUrl(next, url)) {
      expectedNavUrlRef.current = next;
      setReloadKey((k) => k + 1);
      setInputUrl(url);
      return;
    }
    pushEntry(next);
  }

  function handleReset() {
    setHistory([]);
    setHistoryIdx(-1);
    setInputUrl("");
    onUrlChange("");
  }

  // Clip the native webview to the visible area of outerWrapper (important in
  // constrained mobile/tablet modes so it doesn't bleed into the toolbar).
  const syncBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el || !panelEmbedded.current) return;
    const r = el.getBoundingClientRect();
    const outer = outerWrapperRef.current;
    let x = r.left, y = r.top, w = r.width, h = r.height;
    if (outer) {
      const o = outer.getBoundingClientRect();
      x = Math.max(r.left, o.left);
      y = Math.max(r.top,  o.top);
      w = Math.max(0, Math.min(r.right,  o.right)  - x);
      h = Math.max(0, Math.min(r.bottom, o.bottom) - y);
    }
    invoke("resize_ide_panel", { panelId, x, y, width: w, height: h }).catch(() => {});
  }, [panelId]);

  // Embed / destroy the child webview on URL or reload change.
  useEffect(() => {
    if (hidden || !url) return;
    const el = containerRef.current;
    if (!el) return;

    panelEmbedded.current = false;
    setLoading(true);

    const r = el.getBoundingClientRect();
    const outer = outerWrapperRef.current;
    let x = r.left, y = r.top, w = r.width, h = r.height;
    if (outer) {
      const o = outer.getBoundingClientRect();
      x = Math.max(r.left, o.left);
      y = Math.max(r.top,  o.top);
      w = Math.max(0, Math.min(r.right,  o.right)  - x);
      h = Math.max(0, Math.min(r.bottom, o.bottom) - y);
    }

    invoke("embed_ide_panel", { panelId, url, x, y, width: w, height: h })
      .then(() => {
        panelEmbedded.current = true;
        setLoading(false);
      })
      .catch(console.error);

    return () => {
      panelEmbedded.current = false;
      invoke("destroy_ide_panel", { panelId }).catch(console.error);
    };
    // reloadKey intentionally triggers re-embed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hidden, url, panelId, reloadKey]);

  // Track resize / scroll to keep webview aligned.
  useEffect(() => {
    if (hidden || !url) return;
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(syncBounds);
    ro.observe(el);
    window.addEventListener("resize", syncBounds);
    window.addEventListener("scroll", syncBounds, true);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncBounds);
      window.removeEventListener("scroll", syncBounds, true);
    };
  }, [hidden, url, viewW, viewH, syncBounds]);

  // Re-sync after viewport preset change.
  useEffect(() => {
    if (!url || hidden) return;
    syncBounds();
  }, [viewW, viewH, url, hidden, syncBounds]);

  // Collapse/restore the native panel when a menu or modal overlays the window.
  // Native WebView2 panels always render above DOM content, so we resize them to
  // 0×0 to prevent them from intercepting clicks in the menu.
  useEffect(() => {
    if (!panelEmbedded.current) return;
    if (suppressPanel) {
      invoke("resize_ide_panel", { panelId, x: 0, y: 0, width: 0, height: 0 }).catch(() => {});
    } else {
      syncBounds();
    }
  }, [suppressPanel, syncBounds, panelId]);

  // Poll for in-webview navigation (SPA pushState). Only updates the URL bar —
  // never touches history/index so the webview isn't reloaded.
  useEffect(() => {
    if (hidden || !url) return;

    const poll = async () => {
      try {
        const current = await invoke<string | null>("get_ide_panel_url", { panelId });
        if (!current || current === "about:blank") return;

        // Suppress the first update after our own navigation until the target URL lands.
        if (expectedNavUrlRef.current !== null) {
          if (sameUrl(current, expectedNavUrlRef.current)) expectedNavUrlRef.current = null;
          return;
        }

        // Don't overwrite text the user is actively typing.
        if (!urlBarFocusedRef.current) {
          setInputUrl(current);
          currentDisplayUrlRef.current = current;
        }
      } catch { /* panel not ready */ }
    };

    const id = setInterval(poll, 500);
    return () => clearInterval(id);
  }, [url, hidden, panelId]); // restart only on explicit navigation, not every inputUrl change

  // ── Render ────────────────────────────────────────────────────────────────

  if (hidden) return <div className="preview-pane preview-pane--hidden" />;

  if (url === null) {
    return (
      <div className="preview-pane">
        <UrlPicker onNavigate={navigateFresh} />
      </div>
    );
  }

  const constrained = viewW !== null;

  return (
    <div className="preview-pane">
      {/* Toolbar */}
      <div className="preview-toolbar">
        <button className="preview-nav-btn" onClick={handleReset} title="Back to URL picker">
          <X size={14} />
        </button>

        <div className="preview-divider" />

        <button className="preview-nav-btn" onClick={() => moveTo(historyIdx - 1)} disabled={!canGoBack} title="Back">
          <ArrowLeft size={14} />
        </button>
        <button className="preview-nav-btn" onClick={() => moveTo(historyIdx + 1)} disabled={!canGoForward} title="Forward">
          <ArrowRight size={14} />
        </button>
        <button
          className="preview-nav-btn"
          onClick={() => { setLoading(true); setReloadKey((k) => k + 1); }}
          title="Reload"
        >
          <RefreshCw size={13} />
        </button>

        <div className="preview-url-bar">
          <Globe size={12} className="preview-url-icon" />
          <input
            className="preview-url-input"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onFocus={(e) => { urlBarFocusedRef.current = true; e.currentTarget.select(); }}
            onBlur={() => { urlBarFocusedRef.current = false; setInputUrl(currentDisplayUrlRef.current); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { handleUrlBarNavigate(inputUrl); (e.target as HTMLInputElement).blur(); }
              if (e.key === "Escape") { setInputUrl(url); (e.target as HTMLInputElement).blur(); }
            }}
            spellCheck={false}
            placeholder="Enter URL…"
          />
        </div>

        <div className="preview-divider" />

        {(["mobile", "tablet", "desktop"] as PresetKey[]).map((key) => {
          const icons: Record<PresetKey, React.ReactNode> = {
            mobile:  <Smartphone size={14} />,
            tablet:  <Tablet size={14} />,
            desktop: <Monitor size={14} />,
          };
          return (
            <button
              key={key}
              className={`preview-nav-btn${activePreset === key ? " preview-nav-btn--active" : ""}`}
              onClick={() => { setViewW(PRESETS[key].w); setViewH(PRESETS[key].h); }}
              title={PRESETS[key].label}
            >
              {icons[key]}
            </button>
          );
        })}

        <div className="preview-dims">
          <DimInput value={viewW} onChange={setViewW} />
          <span className="preview-dims-sep">×</span>
          <DimInput value={viewH} onChange={setViewH} />
        </div>

        <div className="preview-divider" />

        <button className="preview-nav-btn" onClick={() => openUrl(url)} title="Open in browser">
          <ExternalLink size={14} />
        </button>
      </div>

      {/* Content area */}
      <div
        ref={outerWrapperRef}
        className={`preview-outer${constrained ? " preview-outer--constrained" : ""}`}
        style={viewH !== null ? { alignItems: "flex-start", padding: "16px" } : undefined}
      >
        <div
          className={`preview-frame${constrained ? " preview-frame--constrained" : ""}`}
          style={{
            width: viewW !== null ? `${viewW}px` : "100%",
            height: viewH !== null ? `${viewH}px` : "100%",
          }}
        >
          {/* Transparent placeholder the native webview is anchored over */}
          <div ref={containerRef} className="preview-content" />

          {loading && (
            <div className="preview-loading-overlay">
              <Loader size={28} className="preview-spinner" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
