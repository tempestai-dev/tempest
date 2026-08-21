import { useCallback, useEffect, useState } from "react";
import { FilePlus2, FileText, RefreshCw, Loader2 } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { NodeShell } from "./NodeShell";
import { getNodeData, patchNodeData } from "../../../store/threads";

// File node — pick a local file (PDF, DOCX, XLSX, txt, md, code) and pull its
// text out via the Rust `extract_file_text` command. The extracted text lives in
// node.data.body and feeds the AI context pipeline the same way TextNode's body
// does (buildLineageContext + read_canvas_node). We store the source path so the
// user can Reload if the file changes on disk.
//
// ponytail: text-only extraction — tables, images inside PDFs, and DOCX inline
// images are dropped. Add per-format richer extraction if it turns out mattering.

interface FileData {
  title?: string;
  path?: string;
  body?: string;
  sizeBytes?: number;
  mtime?: number;
  mime?: string;
  extractedAt?: number;
  truncated?: boolean;
  error?: string;
}

interface ExtractResult {
  text: string;
  sizeBytes: number;
  mtime: number;
  mime: string;
  truncated: boolean;
}

const ACCEPTED = [
  { name: "Documents", extensions: ["pdf", "docx", "doc", "xlsx", "xls", "csv", "txt", "md", "rtf"] },
  { name: "Code", extensions: ["rs", "ts", "tsx", "js", "jsx", "py", "go", "java", "c", "cpp", "h", "hpp", "cs", "rb", "php", "sh", "sql", "yml", "yaml", "toml", "json", "xml", "html", "css"] },
  { name: "All files", extensions: ["*"] },
];

function baseName(p: string): string {
  return p.split(/[\\/]/).filter(Boolean).pop() ?? p;
}
function fmtBytes(n?: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function FileNode({ id, data }: { id: string; data?: { collapsed?: boolean } }) {
  const [file, setFile] = useState<FileData>(() => getNodeData<FileData>(id));
  const [busy, setBusy] = useState(false);
  const [showFull, setShowFull] = useState(false);

  const extract = useCallback(async (path: string, title?: string) => {
    setBusy(true);
    try {
      const res = await invoke<ExtractResult>("extract_file_text", { path });
      const next: FileData = {
        title: title ?? file.title ?? baseName(path),
        path,
        body: res.text,
        sizeBytes: res.sizeBytes,
        mtime: res.mtime,
        mime: res.mime,
        truncated: res.truncated,
        extractedAt: Date.now(),
        error: undefined,
      };
      setFile(next);
      patchNodeData(id, next);
    } catch (e) {
      const next: FileData = { ...file, path, title: title ?? file.title ?? baseName(path), error: String(e) };
      setFile(next);
      patchNodeData(id, next);
    } finally {
      setBusy(false);
    }
  }, [id, file]);

  const pick = useCallback(async () => {
    const selected = await open({ multiple: false, directory: false, filters: ACCEPTED });
    if (typeof selected === "string") await extract(selected);
  }, [extract]);

  // First mount: if node was persisted with a path but no body (e.g. reload
  // after Tempest was killed mid-extract), try again.
  useEffect(() => {
    if (file.path && file.body === undefined && !file.error && !busy) {
      void extract(file.path, file.title);
    }
    // deliberately only on mount — user-driven reloads go through the button
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasContent = !!file.path;
  const bodyPreview = (file.body ?? "").slice(0, showFull ? undefined : 600);

  return (
    <NodeShell id={id} data={data} defaultTitle="file" minWidth={260} minHeight={200}>
      <div className="nodrag nowheel" style={{ flex: "1 1 auto", minHeight: 0, display: "flex", flexDirection: "column" }}>
        {hasContent ? (
          <>
            <div
              style={{
                flex: "0 0 auto", padding: "8px 10px",
                display: "flex", alignItems: "center", gap: 8,
                borderBottom: "1px solid var(--tempest-border-subtle, #2a2a2a)",
                color: "var(--tempest-fg-muted, #888)", font: '11px "Geist", system-ui, sans-serif',
              }}
            >
              <FileText size={14} style={{ opacity: 0.7, flexShrink: 0 }} />
              <span style={{
                color: "var(--tempest-fg-default, #e6e6e6)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }} title={file.path}>
                {baseName(file.path ?? "")}
              </span>
              <span>· {fmtBytes(file.sizeBytes)}</span>
              {file.truncated && <span style={{ color: "var(--tempest-accent-yellow, #f5c518)" }}>· truncated</span>}
              <div style={{ flex: 1 }} />
              <button
                onClick={() => file.path && extract(file.path, file.title)}
                disabled={busy}
                title="Re-extract from disk"
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  background: "none", border: "none", cursor: busy ? "wait" : "pointer",
                  color: "inherit", font: "inherit", padding: "2px 6px", borderRadius: 5,
                }}
              >
                {busy ? <Loader2 size={12} className="tnode-spin" /> : <RefreshCw size={12} />}
                Reload
              </button>
              <button
                onClick={pick}
                title="Pick a different file"
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "inherit", font: "inherit", padding: "2px 6px", borderRadius: 5,
                }}
              >
                Replace
              </button>
            </div>

            <div
              style={{
                flex: "1 1 auto", minHeight: 0, overflow: "auto",
                padding: "10px 12px", whiteSpace: "pre-wrap",
                font: '12px/1.55 "Geist Mono", ui-monospace, monospace',
                color: "var(--tempest-fg-default, #e6e6e6)",
              }}
            >
              {file.error ? (
                <span style={{ color: "var(--tempest-accent-red, #e5484d)" }}>{file.error}</span>
              ) : (file.body ?? "").length === 0 ? (
                <span style={{ opacity: 0.5 }}>{busy ? "Extracting…" : "(no text extracted)"}</span>
              ) : (
                <>
                  {bodyPreview}
                  {(file.body ?? "").length > 600 && !showFull && (
                    <button
                      onClick={() => setShowFull(true)}
                      style={{
                        display: "block", margin: "8px 0 0", background: "none", border: "none",
                        color: "var(--tempest-fg-muted, #888)", cursor: "pointer",
                        font: "inherit", textDecoration: "underline dotted",
                      }}
                    >
                      Show all ({(file.body ?? "").length.toLocaleString()} chars)
                    </button>
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <button
            onClick={pick}
            disabled={busy}
            style={{
              flex: "1 1 auto", margin: 10, padding: 12,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8,
              border: "1px dashed var(--tempest-border-subtle, #2a2a2a)",
              borderRadius: 8, background: "transparent", cursor: "pointer",
              color: "var(--tempest-fg-muted, #888)", font: '12px "Geist", system-ui, sans-serif',
            }}
          >
            <FilePlus2 size={22} />
            <span>{busy ? "Loading…" : "Pick a file (PDF, DOCX, XLSX, txt, md, code)"}</span>
          </button>
        )}
      </div>
    </NodeShell>
  );
}
