import { useCallback, useEffect, useMemo, useState } from "react";
import { Play, ArrowRight, Loader2, ExternalLink, RefreshCw, Captions, CaptionsOff } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { NodeShell } from "./NodeShell";
import { getNodeData, patchNodeData } from "../../../store/threads";

// Media node — a social-video URL (TikTok, YouTube, Instagram Reels, X, etc.).
// We shell out to `yt-dlp -J` for metadata + any published caption track.
// When captions exist (manual or auto), we fetch the VTT and strip it to
// plain text — that's the "transcript." When they don't, the node still
// contributes URL + title + description + uploader to AI context. Zero cloud,
// zero models, zero paid keys. Requires `yt-dlp` on PATH.

interface MediaData {
  title?: string;
  url?: string;
  transcript?: string;
  uploader?: string;
  description?: string;
  captionSource?: "manual" | "auto";
  language?: string;
  durationSec?: number;
  fetchedAt?: number;
  error?: string;
}

interface FetchResult {
  title: string;
  uploader?: string;
  description?: string;
  durationSec?: number;
  transcript?: string;
  language?: string;
  captionSource?: "manual" | "auto";
}

function hostOf(u: string): string {
  try { return new URL(u).host.replace(/^www\./, ""); } catch { return u; }
}
function fmtDur(s?: number): string {
  if (!s) return "";
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${m}:${String(sec).padStart(2, "0")}`;
}
function fmtWhen(t?: number): string {
  if (!t) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function MediaNode({ id, data }: { id: string; data?: { collapsed?: boolean } }) {
  const [media, setMedia] = useState<MediaData>(() => getNodeData<MediaData>(id));
  const [urlDraft, setUrlDraft] = useState(media.url ?? "");
  const [busy, setBusy] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const fetchInfo = useCallback(async (url: string) => {
    setBusy(true);
    try {
      const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      const res = await invoke<FetchResult>("fetch_media_info", { url: normalized });
      const next: MediaData = {
        title: media.title ?? res.title ?? hostOf(normalized),
        url: normalized,
        transcript: res.transcript,
        uploader: res.uploader,
        description: res.description,
        durationSec: res.durationSec,
        language: res.language,
        captionSource: res.captionSource,
        fetchedAt: Date.now(),
        error: undefined,
      };
      setMedia(next);
      setUrlDraft(normalized);
      patchNodeData(id, next);
    } catch (e) {
      const next: MediaData = { ...media, url, error: String(e) };
      setMedia(next);
      patchNodeData(id, next);
    } finally {
      setBusy(false);
    }
  }, [id, media]);

  // Retry if node persisted with a URL but no fetched metadata (crash mid-fetch).
  useEffect(() => {
    if (media.url && !media.fetchedAt && !media.error && !busy) {
      void fetchInfo(media.url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasFetched = !!media.fetchedAt || !!media.error;
  const hasTranscript = !!media.transcript;
  const preview = useMemo(() => (media.transcript ?? "").slice(0, showFull ? undefined : 900), [media.transcript, showFull]);

  return (
    <NodeShell id={id} data={data} defaultTitle="media" minWidth={280} minHeight={220}>
      <div className="nodrag nowheel" style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            flex: "0 0 auto", padding: "8px 10px",
            display: "flex", alignItems: "center", gap: 6,
            borderBottom: hasFetched ? "1px solid var(--tempest-border-subtle, #2a2a2a)" : "none",
          }}
        >
          <Play size={14} style={{ opacity: 0.7, flexShrink: 0, color: "var(--tempest-fg-muted, #888)" }} />
          <input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && urlDraft.trim() && !busy) {
                e.preventDefault(); void fetchInfo(urlDraft.trim());
              }
              e.stopPropagation();
            }}
            placeholder="Paste a video URL (YouTube, TikTok, X, Reels…)"
            style={{
              flex: 1, minWidth: 0, padding: "5px 8px", borderRadius: 6,
              font: '12px "Geist", system-ui, sans-serif',
              border: "1px solid var(--tempest-border-default, #2a2a2a)",
              background: "var(--tempest-bg-hover, #0f0f0f)",
              color: "var(--tempest-fg-default, #e6e6e6)",
            }}
          />
          <button
            onClick={() => urlDraft.trim() && !busy && fetchInfo(urlDraft.trim())}
            disabled={busy || !urlDraft.trim()}
            title="Fetch metadata + captions (if published)"
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

        {hasFetched && (
          <>
            <div
              style={{
                flex: "0 0 auto", padding: "6px 10px",
                display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
                color: "var(--tempest-fg-muted, #888)", font: '11px "Geist", system-ui, sans-serif',
                borderBottom: "1px solid var(--tempest-border-subtle, #2a2a2a)",
              }}
            >
              <span style={{ color: "var(--tempest-fg-default, #e6e6e6)" }}>{hostOf(media.url ?? "")}</span>
              {media.uploader ? <span>· {media.uploader}</span> : null}
              {media.durationSec ? <span>· {fmtDur(media.durationSec)}</span> : null}
              {hasTranscript ? (
                <span
                  title={media.captionSource === "auto" ? "Auto-generated captions" : "Uploader-provided captions"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
                >
                  <Captions size={11} /> {media.language ?? "captions"}{media.captionSource === "auto" ? " (auto)" : ""}
                </span>
              ) : (
                <span title="No captions published for this URL — the AI gets title + description instead"
                  style={{ display: "inline-flex", alignItems: "center", gap: 3 }}
                >
                  <CaptionsOff size={11} /> no captions
                </span>
              )}
              {media.fetchedAt && <span>· {fmtWhen(media.fetchedAt)}</span>}
              <div style={{ flex: 1 }} />
              <button
                onClick={() => media.url && openUrl(media.url).catch(() => {})}
                title="Open in browser"
                style={{
                  display: "flex", alignItems: "center", background: "none", border: "none",
                  cursor: "pointer", color: "inherit", padding: 3, borderRadius: 4,
                }}
              >
                <ExternalLink size={12} />
              </button>
              <button
                onClick={() => media.url && fetchInfo(media.url)}
                disabled={busy}
                title="Re-fetch"
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
              {media.error ? (
                <span style={{ color: "var(--tempest-accent-red, #e5484d)" }}>{media.error}</span>
              ) : hasTranscript ? (
                <>
                  {preview}
                  {(media.transcript ?? "").length > 900 && !showFull && (
                    <button
                      onClick={() => setShowFull(true)}
                      style={{
                        display: "block", margin: "8px 0 0", background: "none", border: "none",
                        color: "var(--tempest-fg-muted, #888)", cursor: "pointer",
                        font: "inherit", textDecoration: "underline dotted",
                      }}
                    >
                      Show all ({(media.transcript ?? "").length.toLocaleString()} chars)
                    </button>
                  )}
                </>
              ) : media.description ? (
                <>
                  <div style={{ marginBottom: 6, color: "var(--tempest-fg-muted, #888)" }}>
                    No transcript available. The AI will read the description below alongside the URL.
                  </div>
                  {media.description.slice(0, showFull ? undefined : 900)}
                  {media.description.length > 900 && !showFull && (
                    <button
                      onClick={() => setShowFull(true)}
                      style={{
                        display: "block", margin: "8px 0 0", background: "none", border: "none",
                        color: "var(--tempest-fg-muted, #888)", cursor: "pointer",
                        font: "inherit", textDecoration: "underline dotted",
                      }}
                    >
                      Show all
                    </button>
                  )}
                </>
              ) : (
                <span style={{ opacity: 0.5 }}>No transcript or description. The AI gets URL + title.</span>
              )}
            </div>
          </>
        )}

        {!hasFetched && !busy && (
          <div style={{
            flex: "1 1 auto", display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20, color: "var(--tempest-fg-muted, #888)", font: '12px "Geist", system-ui, sans-serif',
            textAlign: "center",
          }}>
            Paste a video URL and press Enter. If captions are published, they become the transcript; otherwise the AI reads title + description.
          </div>
        )}
      </div>
    </NodeShell>
  );
}
