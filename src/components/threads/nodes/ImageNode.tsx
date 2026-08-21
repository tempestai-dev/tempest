import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { NodeShell } from "./NodeShell";
import { getNodeData, patchNodeData } from "../../../store/threads";

// Image node — drop / paste / pick an image; stored as a base64 data URL in
// node.data.dataUrl so the payload travels with the DB row (no separate blob
// store) and stays available to a chat's vision handoff without a second fetch.
// The mime + width/height are captured on load so the vision attachment path
// (ChatNode.send) can produce a proper AI SDK image part without decoding.
// ponytail: base64 in the DB row is fine for the ~1-8 MB range typical of
// dropped screenshots; upgrade to a filesystem blob if canvases start carrying
// dozens of large PNGs (measure first).

// A reasonable ceiling for a single dropped image. Larger files (RAW, huge
// PNGs) are rejected up front rather than swelling the DB row.
const MAX_BYTES = 12 * 1024 * 1024;

interface ImageData {
  title?: string;
  dataUrl?: string;
  mime?: string;
  width?: number;
  height?: number;
  sizeBytes?: number;
  alt?: string;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(file);
  });
}

function probeSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = dataUrl;
  });
}

export function ImageNode({ id, data }: { id: string; data?: { collapsed?: boolean } }) {
  const [img, setImg] = useState<ImageData>(() => getNodeData<ImageData>(id));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [editingAlt, setEditingAlt] = useState(false);
  const [altDraft, setAltDraft] = useState(img.alt ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const ingest = useCallback(async (file: File) => {
    setErr(null);
    if (!file.type.startsWith("image/")) { setErr("Not an image file"); return; }
    if (file.size > MAX_BYTES) { setErr(`Too large (${Math.round(file.size / 1024 / 1024)} MB > ${MAX_BYTES / 1024 / 1024} MB)`); return; }
    setBusy(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const { width, height } = await probeSize(dataUrl);
      const next: ImageData = {
        ...img,
        title: img.title ?? file.name,
        dataUrl, mime: file.type, width, height, sizeBytes: file.size,
      };
      setImg(next);
      patchNodeData(id, next);
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusy(false);
    }
  }, [id, img]);

  const pickFile = useCallback(() => fileInputRef.current?.click(), []);

  // Paste handler — only when this node is focused, so a paste on the canvas
  // doesn't hit every empty image node at once.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onPaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      for (const item of e.clipboardData.items) {
        if (item.kind === "file" && item.type.startsWith("image/")) {
          const f = item.getAsFile();
          if (f) { e.preventDefault(); void ingest(f); return; }
        }
      }
    };
    el.addEventListener("paste", onPaste);
    return () => el.removeEventListener("paste", onPaste);
  }, [ingest]);

  function saveAlt() {
    const next = { ...img, alt: altDraft.trim() || undefined };
    setImg(next);
    patchNodeData(id, next);
    setEditingAlt(false);
  }

  function clearImage() {
    const next: ImageData = { title: img.title };
    setImg(next);
    patchNodeData(id, next);
  }

  return (
    <NodeShell id={id} data={data} defaultTitle="image" minWidth={220} minHeight={200}>
      <div
        ref={rootRef}
        tabIndex={0}
        className="nodrag nowheel"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void ingest(f);
        }}
        style={{
          flex: "1 1 auto", minHeight: 0, position: "relative",
          display: "flex", flexDirection: "column",
          outline: dragOver ? "2px dashed var(--tempest-accent-yellow, #f5c518)" : "none",
          outlineOffset: -6,
        }}
      >
        {img.dataUrl ? (
          <>
            <div
              style={{
                flex: "1 1 auto", minHeight: 0, display: "flex",
                alignItems: "center", justifyContent: "center",
                background: "var(--tempest-bg-canvas-wrap, #0f0f0f)",
                overflow: "hidden",
              }}
            >
              <img
                src={img.dataUrl}
                alt={img.alt ?? img.title ?? "image"}
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", display: "block" }}
                draggable={false}
              />
            </div>
            <div
              style={{
                flex: "0 0 auto", padding: "6px 10px", display: "flex",
                alignItems: "center", gap: 8,
                color: "var(--tempest-fg-muted, #888)",
                font: '11px "Geist", system-ui, sans-serif',
                borderTop: "1px solid var(--tempest-border-subtle, #2a2a2a)",
              }}
            >
              <span>{img.width && img.height ? `${img.width}×${img.height}` : ""}</span>
              {img.sizeBytes ? <span>· {(img.sizeBytes / 1024).toFixed(0)} KB</span> : null}
              <div style={{ flex: 1 }} />
              {editingAlt ? (
                <input
                  autoFocus
                  value={altDraft}
                  onChange={(e) => setAltDraft(e.target.value)}
                  onBlur={saveAlt}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveAlt();
                    else if (e.key === "Escape") { setAltDraft(img.alt ?? ""); setEditingAlt(false); }
                    e.stopPropagation();
                  }}
                  placeholder="Alt text / caption for AI"
                  style={{
                    width: 200, padding: "3px 6px", borderRadius: 5, font: "inherit",
                    border: "1px solid var(--tempest-border-default, #2a2a2a)",
                    background: "var(--tempest-bg-hover, #0f0f0f)",
                    color: "var(--tempest-fg-default, #e6e6e6)",
                  }}
                />
              ) : (
                <button
                  onClick={() => { setAltDraft(img.alt ?? ""); setEditingAlt(true); }}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    color: "inherit", font: "inherit", padding: 0,
                    textDecoration: img.alt ? "none" : "underline dotted",
                    maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                  title="Alt text — what the AI sees when this image is wired into a chat that can't display images."
                >
                  {img.alt ?? "add caption"}
                </button>
              )}
              <button
                onClick={pickFile}
                title="Replace image"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "inherit", font: "inherit", padding: "2px 6px",
                  borderRadius: 5,
                }}
              >
                Replace
              </button>
              <button
                onClick={clearImage}
                title="Remove image"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "inherit", font: "inherit", padding: "2px 6px",
                  borderRadius: 5,
                }}
              >
                Clear
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={pickFile}
            disabled={busy}
            style={{
              flex: "1 1 auto", margin: 10, padding: 12,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
              border: "1px dashed var(--tempest-border-subtle, #2a2a2a)",
              borderRadius: 8, background: "transparent", cursor: "pointer",
              color: "var(--tempest-fg-muted, #888)", font: '12px "Geist", system-ui, sans-serif',
            }}
          >
            <ImagePlus size={22} />
            <span>{busy ? "Loading…" : "Drop, paste, or click to add an image"}</span>
            {err && <span style={{ color: "var(--tempest-accent-red, #e5484d)" }}>{err}</span>}
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void ingest(f);
            e.target.value = "";
          }}
        />
      </div>
    </NodeShell>
  );
}
