import { useCallback, useEffect, useState } from "react";
import { Globe, ArrowRight, RefreshCw, Loader2, ExternalLink } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { NodeShell } from "./NodeShell";
import { getNodeData, patchNodeData } from "../../../store/threads";

// Site node — a URL that the backend scrapes into readable text. Same context
// contract as TextNode: the extracted body flows through buildLineageContext,
// buildCanvasGraph, and read_canvas_node. Rescrape is manual (no polling).

interface SiteData {
  title?: string;
  url?: string;
  siteTitle?: string;
  body?: string;
  scrapedAt?: number;
  contentLength?: number;
  truncated?: boolean;
  error?: string;
}

interface ScrapeResult {
  title: string;
  text: string;
  contentLength: number;
  truncated: boolean;
}

function hostOf(u: string): string {
  try { return new URL(u).host; } catch { return u; }
}
function fmtWhen(t?: number): string {
  if (!t) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function SiteNode({ id, data }: { id: string; data?: { collapsed?: boolean } }) {
  const [site, setSite] = useState<SiteData>(() => getNodeData<SiteData>(id));
  const [urlDraft, setUrlDraft] = useState(site.url ?? "");
  const [busy, setBusy] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const scrape = useCallback(async (url: string) => {
    setBusy(true);
    try {
      const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      const res = await invoke<ScrapeResult>("scrape_url", { url: normalized });
      const next: SiteData = {
        title: site.title ?? res.title ?? hostOf(normalized),
        url: normalized,
        siteTitle: res.title,
        body: res.text,
        scrapedAt: Date.now(),
        contentLength: res.contentLength,
        truncated: res.truncated,
        error: undefined,
      };
      setSite(next);
      setUrlDraft(normalized);
      patchNodeData(id, next);
    } catch (e) {
      const next: SiteData = { ...site, url, error: String(e) };
      setSite(next);
      patchNodeData(id, next);
    } finally {
      setBusy(false);
    }
  }, [id, site]);

  // If the node was persisted with a URL but no body (crash mid-scrape), try again.
  useEffect(() => {
    if (site.url && site.body === undefined && !site.error && !busy) {
      void scrape(site.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasContent = !!site.url;
  const bodyPreview = (site.body ?? "").slice(0, showFull ? undefined : 800);

  return (
    <NodeShell id={id} data={data} defaultTitle="site" minWidth={280} minHeight={220}>
      <div className="nodrag nowheel" style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            flex: "0 0 auto", padding: "8px 10px",
            display: "flex", alignItems: "center", gap: 6,
            borderBottom: hasContent ? "1px solid var(--tempest-border-subtle, #2a2a2a)" : "none",
          }}
        >
          <Globe size={14} style={{ opacity: 0.7, flexShrink: 0, color: "var(--tempest-fg-muted, #888)" }} />
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && urlDraft.trim() && !busy) {
                e.preventDefault(); void scrape(urlDraft.trim());
              }
              e.stopPropagation();
            }}
            placeholder="https://…"
            style={{
              flex: 1, minWidth: 0, padding: "5px 8px", borderRadius: 6,
              font: '12px "Geist", system-ui, sans-serif',
              border: "1px solid var(--tempest-border-default, #2a2a2a)",
              background: "var(--tempest-bg-hover, #0f0f0f)",
              color: "var(--tempest-fg-default, #e6e6e6)",
            }}
          />
          <button
            onClick={() => urlDraft.trim() && !busy && scrape(urlDraft.trim())}
            disabled={busy || !urlDraft.trim()}
            title="Scrape this URL"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 26, height: 26, border: "none", borderRadius: 6,
              background: busy ? "var(--tempest-bg-hover, #232323)" : "var(--tempest-accent-yellow, #f5c518)",
              color: "#000", cursor: busy ? "wait" : "pointer",
            }}
          >
            {busy ? <Loader2 size={13} className="tnode-spin" /> : <ArrowRight size={13} />}
          </button>
        </div>

        {hasContent && (
          <>
            <div
              style={{
                flex: "0 0 auto", padding: "6px 10px",
                display: "flex", alignItems: "center", gap: 8,
                color: "var(--tempest-fg-muted, #888)", font: '11px "Geist", system-ui, sans-serif',
                borderBottom: "1px solid var(--tempest-border-subtle, #2a2a2a)",
              }}
            >
              <span style={{
                color: "var(--tempest-fg-default, #e6e6e6)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "50%",
              }} title={site.siteTitle}>
                {site.siteTitle ?? hostOf(site.url ?? "")}
              </span>
              {site.contentLength ? <span>· {site.contentLength.toLocaleString()} chars</span> : null}
              {site.truncated && <span style={{ color: "var(--tempest-accent-yellow, #f5c518)" }}>· truncated</span>}
              {site.scrapedAt && <span>· {fmtWhen(site.scrapedAt)}</span>}
              <div style={{ flex: 1 }} />
              <button
                onClick={() => site.url && openUrl(site.url).catch(() => {})}
                title="Open in browser"
                style={{
                  display: "flex", alignItems: "center", background: "none", border: "none",
                  cursor: "pointer", color: "inherit", padding: 3, borderRadius: 4,
                }}
              >
                <ExternalLink size={12} />
              </button>
              <button
                onClick={() => site.url && scrape(site.url)}
                disabled={busy}
                title="Rescrape"
                style={{
                  display: "flex", alignItems: "center", background: "none", border: "none",
                  cursor: busy ? "wait" : "pointer", color: "inherit", padding: 3, borderRadius: 4,
                }}
              >
                {busy ? <Loader2 size={12} className="tnode-spin" /> : <RefreshCw size={12} />}
              </button>
            </div>

            <div
              style={{
                flex: "1 1 auto", minHeight: 0, overflow: "auto",
                padding: "10px 12px", whiteSpace: "pre-wrap",
                font: '12px/1.55 "Geist", system-ui, sans-serif',
                color: "var(--tempest-fg-default, #e6e6e6)",
              }}
            >
              {site.error ? (
                <span style={{ color: "var(--tempest-accent-red, #e5484d)" }}>{site.error}</span>
              ) : (site.body ?? "").length === 0 ? (
                <span style={{ opacity: 0.5 }}>{busy ? "Scraping…" : "(no readable text)"}</span>
              ) : (
                <>
                  {bodyPreview}
                  {(site.body ?? "").length > 800 && !showFull && (
                    <button
                      onClick={() => setShowFull(true)}
                      style={{
                        display: "block", margin: "8px 0 0", background: "none", border: "none",
                        color: "var(--tempest-fg-muted, #888)", cursor: "pointer",
                        font: "inherit", textDecoration: "underline dotted",
                      }}
                    >
                      Show all ({(site.body ?? "").length.toLocaleString()} chars)
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {!hasContent && !busy && (
          <div style={{
            flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, color: "var(--tempest-fg-muted, #888)", font: '12px "Geist", system-ui, sans-serif',
            textAlign: "center",
          }}>
            Enter a URL and press Enter to scrape it into text the AI can read.
          </div>
        )}
      </div>
    </NodeShell>
  );
}
