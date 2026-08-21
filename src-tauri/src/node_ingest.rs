//! Canvas node ingestion — the three Tauri commands the new content nodes call
//! to turn a picked file / URL / video into text (or, for images, structured
//! metadata) that the AI-context pipeline (`buildLineageContext`, `canvas_map`,
//! `read_canvas_node`) can inject verbatim.
//!
//! Kept behind explicit commands (not one big dispatcher) so each pipeline can
//! evolve independently and so failures are localized — a broken PDF doesn't
//! poison the site scrape command.

use std::path::Path;
use std::process::Command;

use serde::Serialize;
use serde_json::Value;

// ── Config caps ──────────────────────────────────────────────────────────────
// Ceiling on extracted text — Deepgram transcripts and scraped articles can be
// huge and we already truncate on the read_canvas_node side, but capping at the
// source keeps a giant node from ballooning the SQLite row too. Big enough that
// most articles/podcasts fit whole; anything above is flagged `truncated`.
const MAX_CHARS: usize = 200_000;

fn cap(mut s: String) -> (String, bool) {
    if s.chars().count() <= MAX_CHARS { return (s, false); }
    let cut: String = s.chars().take(MAX_CHARS).collect();
    s.clear();
    (format!("{cut}\n\n[truncated at {MAX_CHARS} chars]"), true)
}

// ── extract_file_text ────────────────────────────────────────────────────────
// Dispatches by file extension. PDF via pdf-extract, DOCX via docx-rs, XLSX via
// calamine, everything else via `std::fs::read_to_string` (text/md/code/csv).
// Rejects paths that don't exist up front so the caller gets a real message
// instead of the underlying crate's variant.

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractResult {
    pub text: String,
    pub size_bytes: u64,
    pub mtime: u64,          // unix millis
    pub mime: String,        // best-effort by extension
    pub truncated: bool,
}

fn ext_of(p: &Path) -> String {
    p.extension().and_then(|s| s.to_str()).unwrap_or("").to_ascii_lowercase()
}

fn mime_for(ext: &str) -> &'static str {
    match ext {
        "pdf" => "application/pdf",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "doc" => "application/msword",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "xls" => "application/vnd.ms-excel",
        "csv" => "text/csv",
        "md" => "text/markdown",
        "json" => "application/json",
        "html" | "htm" => "text/html",
        "" => "application/octet-stream",
        _ => "text/plain",
    }
}

fn extract_pdf(path: &Path) -> Result<String, String> {
    // pdf-extract panics on malformed PDFs occasionally; wrap in catch_unwind so
    // we surface a clean error instead of crashing the Tauri process. The pure-
    // Rust decoder is the sanest baseline for cross-platform; poppler would be
    // more accurate but ships C++.
    let path = path.to_path_buf();
    let result = std::panic::catch_unwind(move || pdf_extract::extract_text(&path));
    match result {
        Ok(Ok(text)) => Ok(text),
        Ok(Err(e)) => Err(format!("PDF extract failed: {e}")),
        Err(_) => Err("PDF extract panicked — file may be malformed or encrypted".into()),
    }
}

fn extract_docx(path: &Path) -> Result<String, String> {
    // docx-rs returns a doctree; the simplest reliable "flatten to text" is to
    // pull out every Run's TextElement.
    let bytes = std::fs::read(path).map_err(|e| format!("read docx: {e}"))?;
    let doc = docx_rs::read_docx(&bytes).map_err(|e| format!("parse docx: {e}"))?;
    let mut out = String::new();
    walk_docx_children(&doc.document.children, &mut out);
    Ok(out)
}

// docx-rs's enum shapes are noisy (many variants, some boxed, some not). Rather
// than pattern-match every variant, keep this walker tolerant: `if let` on the
// variants we care about, `_ => {}` on the rest. Any variant we ignore just
// doesn't contribute text — no compile-time coupling to a specific docx-rs rev.
// A couple of the inner `if let`s hit single-variant enums (TableChild/
// TableRowChild) which lints as irrefutable — allow it here rather than mixing
// `let`/`if let` for the same pattern shape.
#[allow(irrefutable_let_patterns)]
fn walk_docx_children(children: &[docx_rs::DocumentChild], out: &mut String) {
    use docx_rs::{DocumentChild, ParagraphChild, RunChild};
    for c in children {
        match c {
            DocumentChild::Paragraph(p) => {
                for pc in &p.children {
                    if let ParagraphChild::Run(run) = pc {
                        for rc in &run.children {
                            if let RunChild::Text(t) = rc {
                                out.push_str(&t.text);
                            }
                        }
                    }
                }
                out.push('\n');
            }
            DocumentChild::Table(t) => {
                for row in &t.rows {
                    if let docx_rs::TableChild::TableRow(tr) = row {
                        let mut cells: Vec<String> = Vec::new();
                        for cell in &tr.cells {
                            if let docx_rs::TableRowChild::TableCell(tc) = cell {
                                let mut buf = String::new();
                                walk_docx_children(&tc.children.iter().cloned().map(cell_child_to_doc).collect::<Vec<_>>(), &mut buf);
                                cells.push(buf.trim().to_string());
                            }
                        }
                        out.push_str(&cells.join("\t"));
                        out.push('\n');
                    }
                }
            }
            _ => {}
        }
    }
}

// docx-rs's TableCell children are its own child enum, not DocumentChild. Bridge
// only the two variants we actually walk (Paragraph, Table) so the walker stays
// one function.
#[allow(irrefutable_let_patterns)]
fn cell_child_to_doc(c: docx_rs::TableCellContent) -> docx_rs::DocumentChild {
    match c {
        docx_rs::TableCellContent::Paragraph(p) => docx_rs::DocumentChild::Paragraph(p),
        docx_rs::TableCellContent::Table(t) => docx_rs::DocumentChild::Table(t),
        other => {
            // StructuredDataTag etc. — flatten to an empty paragraph.
            let _ = other;
            docx_rs::DocumentChild::Paragraph(Box::new(docx_rs::Paragraph::new()))
        }
    }
}

fn extract_xlsx(path: &Path) -> Result<String, String> {
    use calamine::{open_workbook_auto, Reader, Data};
    let mut wb = open_workbook_auto(path).map_err(|e| format!("open xlsx: {e}"))?;
    let names: Vec<String> = wb.sheet_names().to_vec();
    let mut out = String::new();
    for name in names {
        if let Ok(range) = wb.worksheet_range(&name) {
            out.push_str(&format!("# Sheet: {name}\n"));
            for row in range.rows() {
                let cells: Vec<String> = row.iter().map(|c| match c {
                    Data::Empty => String::new(),
                    Data::String(s) => s.clone(),
                    Data::Float(f) => f.to_string(),
                    Data::Int(i) => i.to_string(),
                    Data::Bool(b) => b.to_string(),
                    Data::DateTime(d) => d.to_string(),
                    Data::DateTimeIso(s) | Data::DurationIso(s) => s.clone(),
                    Data::Error(e) => format!("#ERR:{e:?}"),
                }).collect();
                out.push_str(&cells.join("\t"));
                out.push('\n');
            }
            out.push('\n');
        }
    }
    Ok(out)
}

#[tauri::command(async)]
pub fn extract_file_text(path: String) -> Result<ExtractResult, String> {
    let p = Path::new(&path);
    if !p.exists() { return Err(format!("File not found: {path}")); }
    let meta = std::fs::metadata(p).map_err(|e| format!("stat: {e}"))?;
    let mtime = meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let ext = ext_of(p);
    let raw = match ext.as_str() {
        "pdf" => extract_pdf(p)?,
        "docx" => extract_docx(p)?,
        "xlsx" | "xls" | "xlsm" | "xlsb" | "ods" => extract_xlsx(p)?,
        _ => std::fs::read_to_string(p).map_err(|e| format!("read text: {e}"))?,
    };
    let (text, truncated) = cap(raw);
    Ok(ExtractResult {
        text,
        size_bytes: meta.len(),
        mtime,
        mime: mime_for(&ext).into(),
        truncated,
    })
}

// ── scrape_url ───────────────────────────────────────────────────────────────
// GET the URL with ureq (already in the tree), pull the <title>, then feed the
// HTML through html2text so nav/script/style noise is stripped and the reader
// sees the article body only.

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScrapeResult {
    pub title: String,
    pub text: String,
    pub content_length: u64,
    pub truncated: bool,
}

fn extract_html_title(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    if let Some(open) = lower.find("<title") {
        if let Some(gt) = lower[open..].find('>') {
            let start = open + gt + 1;
            if let Some(close) = lower[start..].find("</title>") {
                let raw = &html[start..start + close];
                return raw.trim().replace('\n', " ");
            }
        }
    }
    String::new()
}

#[tauri::command(async)]
pub fn scrape_url(url: String) -> Result<ScrapeResult, String> {
    let resp = ureq::get(&url)
        .set("User-Agent", "Mozilla/5.0 (compatible; Tempest/0.1)")
        .set("Accept", "text/html,application/xhtml+xml")
        .timeout(std::time::Duration::from_secs(20))
        .call()
        .map_err(|e| format!("fetch failed: {e}"))?;

    let ctype = resp.header("content-type").unwrap_or("").to_ascii_lowercase();
    // A conservative 10 MB body cap — a runaway server won't OOM us. html2text
    // is O(n) so this also bounds render time.
    let mut body = String::new();
    resp.into_reader()
        .take(10 * 1024 * 1024)
        .read_to_string(&mut body)
        .map_err(|e| format!("read body: {e}"))?;

    let title = extract_html_title(&body);

    // Non-HTML content types: return the body verbatim (plain-text pages,
    // markdown, etc.). Only run html2text on actual HTML.
    let text = if ctype.contains("html") || body.trim_start().starts_with('<') {
        html2text::from_read(body.as_bytes(), 100)
            .unwrap_or_else(|_| body.clone())
    } else {
        body.clone()
    };

    let content_length = text.chars().count() as u64;
    let (text, truncated) = cap(text);
    Ok(ScrapeResult {
        title: if title.is_empty() { url.clone() } else { title },
        text,
        content_length,
        truncated,
    })
}

// ── fetch_media_info ─────────────────────────────────────────────────────────
// No audio transcription. yt-dlp -J gives us the URL's full metadata (title,
// uploader, description, duration) plus any published caption/subtitle tracks.
// When a caption track exists (manual or auto-generated), we fetch the VTT and
// strip it to plain text — that's our "transcript." When it doesn't, the node
// just carries the metadata and the AI works from URL + title + description.
// Zero cloud, zero models, one external dep (yt-dlp on PATH).

use std::io::Read;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaInfo {
    pub title: String,
    pub uploader: Option<String>,
    pub description: Option<String>,
    pub duration_sec: Option<f64>,
    /// None → captions not published for this URL. Present → VTT stripped to text.
    pub transcript: Option<String>,
    pub language: Option<String>,
    /// "manual" (uploader-provided) or "auto" (yt-dlp auto-captions). None when no transcript.
    pub caption_source: Option<String>,
}

/// Pick the best caption URL from yt-dlp's metadata JSON. Preference order:
/// manual `subtitles` in English, manual subtitles in any language, then
/// `automatic_captions` (also English first). VTT is preferred over other
/// formats since it's the easiest to strip cleanly.
fn pick_caption(json: &Value) -> Option<(String, String, String)> {
    fn pick_format(entries: &[Value]) -> Option<String> {
        entries.iter().find(|e| e.get("ext").and_then(Value::as_str) == Some("vtt"))
            .or_else(|| entries.first())
            .and_then(|e| e.get("url").and_then(Value::as_str))
            .map(str::to_string)
    }
    fn scan(obj: &Value, source: &str) -> Option<(String, String, String)> {
        let map = obj.as_object()?;
        // Prefer English variants first.
        for lang_pref in ["en", "en-US", "en-GB", "en-orig"] {
            if let Some(arr) = map.get(lang_pref).and_then(Value::as_array) {
                if let Some(url) = pick_format(arr) {
                    return Some((url, lang_pref.to_string(), source.to_string()));
                }
            }
        }
        // Anything else — first entry wins.
        for (lang, arr) in map.iter() {
            if let Some(arr) = arr.as_array() {
                if let Some(url) = pick_format(arr) {
                    return Some((url, lang.clone(), source.to_string()));
                }
            }
        }
        None
    }
    scan(&json["subtitles"], "manual")
        .or_else(|| scan(&json["automatic_captions"], "auto"))
}

/// Strip WebVTT/SRT to plain text: drop the `WEBVTT` header, timestamp lines,
/// cue positioning attrs, and inline `<c>` styling — keep only the spoken
/// content, dedup consecutive duplicate lines (YouTube auto-captions overlap
/// heavily). Purely stdlib — the format is regular enough that a crate is
/// heavier than one small function.
fn vtt_to_text(vtt: &str) -> String {
    let mut out: Vec<String> = Vec::new();
    for raw in vtt.lines() {
        let line = raw.trim();
        if line.is_empty() { continue; }
        if line.starts_with("WEBVTT") || line.starts_with("NOTE ") { continue; }
        if line.starts_with("Kind:") || line.starts_with("Language:") { continue; }
        // Timestamp cue lines: `00:00:01.000 --> 00:00:04.000 ...`
        if line.contains("-->") { continue; }
        // Numeric cue indexes (SRT-style).
        if line.chars().all(|c| c.is_ascii_digit()) { continue; }
        // Strip inline VTT tags like <00:00:01.000><c>word</c>.
        let mut stripped = String::with_capacity(line.len());
        let mut in_tag = false;
        for ch in line.chars() {
            match ch {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => stripped.push(ch),
                _ => {}
            }
        }
        let stripped = stripped.trim().to_string();
        if stripped.is_empty() { continue; }
        // YouTube auto-captions repeat the same phrase across overlapping cues;
        // drop consecutive dupes so the transcript reads like prose.
        if out.last().map(String::as_str) != Some(&stripped) {
            out.push(stripped);
        }
    }
    out.join("\n")
}

#[tauri::command(async)]
pub fn fetch_media_info(url: String) -> Result<MediaInfo, String> {
    // -J prints full metadata JSON (single object, no download). --write-*subs
    // populate the `subtitles`/`automatic_captions` fields in that JSON without
    // writing files to disk. --sub-lang picks English + fallback all-languages
    // so scan() has options.
    let out = Command::new("yt-dlp")
        .args([
            "-J", "--skip-download", "--no-warnings",
            "--write-subs", "--write-auto-subs",
            "--sub-lang", "en.*,en,all",
            &url,
        ])
        .output()
        .map_err(|e| format!("yt-dlp not found on PATH: {e}. Install: pip install -U yt-dlp"))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("yt-dlp failed: {}", stderr.trim()));
    }

    let json: Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| format!("parse yt-dlp JSON: {e}"))?;

    let title = json["title"].as_str().unwrap_or(&url).to_string();
    let uploader = json["uploader"].as_str()
        .or_else(|| json["channel"].as_str())
        .map(str::to_string);
    let description = json["description"].as_str().map(str::to_string);
    let duration_sec = json["duration"].as_f64();

    let (transcript, language, caption_source) = match pick_caption(&json) {
        Some((vtt_url, lang, source)) => {
            // Fetch the VTT (or whatever format was returned). We take
            // whatever comes back — vtt_to_text tolerates SRT-shaped input too.
            match ureq::get(&vtt_url)
                .set("User-Agent", "Mozilla/5.0 (compatible; Tempest/0.1)")
                .timeout(std::time::Duration::from_secs(30))
                .call() {
                Ok(resp) => {
                    let mut body = String::new();
                    let _ = resp.into_reader().take(5 * 1024 * 1024).read_to_string(&mut body);
                    let text = vtt_to_text(&body);
                    let (text, _t) = cap(text);
                    if text.trim().is_empty() {
                        (None, Some(lang), None)
                    } else {
                        (Some(text), Some(lang), Some(source))
                    }
                }
                // Caption URL fetch failed → still return metadata; just no transcript.
                Err(_) => (None, Some(lang), None),
            }
        }
        None => (None, None, None),
    };

    Ok(MediaInfo {
        title, uploader, description, duration_sec,
        transcript, language, caption_source,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_html_title_basic() {
        assert_eq!(extract_html_title("<html><head><title>Hello</title></head></html>"), "Hello");
        assert_eq!(extract_html_title("<title lang=\"en\">Attr</title>"), "Attr");
        assert_eq!(extract_html_title("no title here"), "");
    }

    #[test]
    fn vtt_to_text_strips_headers_timestamps_and_dupes() {
        let vtt = "WEBVTT\nKind: captions\nLanguage: en\n\n\
                   1\n\
                   00:00:00.000 --> 00:00:02.000\n\
                   Hello <c>world</c>\n\
                   \n\
                   2\n\
                   00:00:02.000 --> 00:00:04.000\n\
                   Hello world\n\
                   \n\
                   3\n\
                   00:00:04.000 --> 00:00:06.000\n\
                   Different line\n";
        let out = vtt_to_text(vtt);
        assert_eq!(out, "Hello world\nDifferent line");
    }

    #[test]
    fn pick_caption_prefers_manual_english() {
        let j: Value = serde_json::from_str(r#"{
            "subtitles": { "en": [{"ext":"vtt","url":"manual-en"}], "fr": [{"ext":"vtt","url":"manual-fr"}] },
            "automatic_captions": { "en": [{"ext":"vtt","url":"auto-en"}] }
        }"#).unwrap();
        let (url, lang, source) = pick_caption(&j).unwrap();
        assert_eq!(url, "manual-en");
        assert_eq!(lang, "en");
        assert_eq!(source, "manual");
    }

    #[test]
    fn pick_caption_falls_through_to_auto() {
        let j: Value = serde_json::from_str(r#"{
            "subtitles": {},
            "automatic_captions": { "en": [{"ext":"vtt","url":"auto-en"}] }
        }"#).unwrap();
        let (_, _, source) = pick_caption(&j).unwrap();
        assert_eq!(source, "auto");
    }

    #[test]
    fn pick_caption_returns_none_when_absent() {
        let j: Value = serde_json::from_str(r#"{"subtitles":{}, "automatic_captions":{}}"#).unwrap();
        assert!(pick_caption(&j).is_none());
    }

    #[test]
    fn cap_marks_long_text() {
        let big = "x".repeat(MAX_CHARS + 5);
        let (out, trunc) = cap(big);
        assert!(trunc);
        assert!(out.contains("[truncated"));
    }
}
