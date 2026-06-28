import { useEffect, useRef, useState } from "react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { EditorView, basicSetup } from "codemirror";
import { keymap } from "@codemirror/view";
import { Compartment, EditorState, Prec } from "@codemirror/state";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { rust } from "@codemirror/lang-rust";
import { python } from "@codemirror/lang-python";
import { json } from "@codemirror/lang-json";
import { markdown } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";
import { FileCode } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import { useTheme } from "../themes/ThemeContext";
import "./CodeMirrorPane.css";

// GitHub markdown + highlight.js themes imported as raw CSS strings (Vite `?inline`)
// so the active variant can be injected explicitly based on the app theme rather
// than relying on the OS `prefers-color-scheme`.
import githubMarkdownDark from "github-markdown-css/github-markdown-dark.css?inline";
import githubMarkdownLight from "github-markdown-css/github-markdown-light.css?inline";
import hljsDark from "highlight.js/styles/github-dark.css?inline";
import hljsLight from "highlight.js/styles/github.css?inline";

interface Props {
  filePath: string;
  hidden: boolean;
}

function getExtension(filePath: string) {
  return filePath.replace(/\\/g, "/").split(".").pop()?.toLowerCase() ?? "";
}

function getLanguageExtension(filePath: string) {
  const ext = getExtension(filePath);
  switch (ext) {
    case "js": case "mjs": case "cjs": return javascript();
    case "jsx": return javascript({ jsx: true });
    case "ts": return javascript({ typescript: true });
    case "tsx": return javascript({ jsx: true, typescript: true });
    case "css": return css();
    case "html": case "htm": return html();
    case "rs": return rust();
    case "py": return python();
    case "json": return json();
    case "md": case "markdown": return markdown();
    default: return null;
  }
}

function resolveImageSrc(src: string, filePath: string): string {
  if (/^https?:\/\/|^data:/.test(src)) return src;
  const dir = filePath.replace(/\\/g, "/").replace(/\/[^/]+$/, "");
  return convertFileSrc(`${dir}/${src}`);
}

function buildEditorTheme() {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(`--tempest-${n}`).trim();

  return EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: v("bg-editor"),
      color: v("fg-default"),
    },
    ".cm-scroller": {
      fontFamily: "'Geist Mono', monospace",
      fontSize: "13px",
      lineHeight: "1.65",
      overflow: "auto",
    },
    ".cm-content": {
      padding: "8px 0",
      caretColor: v("fg-default"),
    },
    ".cm-cursor": {
      borderLeftColor: v("fg-default"),
    },
    ".cm-gutters": {
      backgroundColor: v("bg-editor"),
      color: v("fg-subtle"),
      border: "none",
      borderRight: `1px solid ${v("border-subtle")}`,
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 10px 0 6px",
      minWidth: "40px",
    },
    ".cm-selectionBackground": {
      backgroundColor: `${v("bg-selection-focused")} !important`,
    },
    ".cm-focused .cm-selectionBackground": {
      backgroundColor: v("bg-selection-focused"),
    },
    ".cm-activeLine": { backgroundColor: v("bg-hover") },
    ".cm-activeLineGutter": {
      backgroundColor: v("bg-hover"),
      color: v("fg-default"),
    },
    ".cm-matchingBracket": {
      backgroundColor: v("bg-selection-focused"),
      outline: `1px solid ${v("border-default")}`,
    },
    ".cm-foldGutter .cm-gutterElement": { color: v("fg-subtle") },
    ".cm-tooltip": {
      backgroundColor: v("bg-panel"),
      border: `1px solid ${v("border-default")}`,
      color: v("fg-default"),
    },
  });
}

function buildHighlightStyle() {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(`--tempest-${n}`).trim();

  return HighlightStyle.define([
    { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment], color: v("syntax-comment"), fontStyle: "italic" },
    { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.definitionKeyword, tags.moduleKeyword], color: v("syntax-keyword") },
    { tag: [tags.string, tags.special(tags.string)], color: v("syntax-string") },
    { tag: [tags.regexp], color: v("syntax-string") },
    { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: v("syntax-function") },
    { tag: [tags.variableName], color: v("syntax-variable") },
    { tag: [tags.propertyName], color: v("syntax-variable") },
    { tag: [tags.number, tags.float, tags.integer], color: v("syntax-constant") },
    { tag: [tags.bool, tags.null], color: v("syntax-constant") },
    { tag: [tags.typeName, tags.className], color: v("syntax-type") },
    { tag: [tags.typeOperator, tags.operator], color: v("syntax-operator") },
    { tag: [tags.attributeName], color: v("syntax-attribute") },
    { tag: [tags.self], color: v("syntax-keyword") },
    { tag: [tags.escape], color: v("syntax-constant") },
    { tag: [tags.tagName], color: v("syntax-keyword") },
    { tag: [tags.angleBracket], color: v("fg-muted") },
    { tag: [tags.meta], color: v("fg-subtle") },
  ]);
}

export function CodeMirrorPane({ filePath, hidden }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const highlightCompartment = useRef(new Compartment());
  const { theme } = useTheme();

  const [fileContent, setFileContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"raw" | "preview">("raw");
  const [isDirty, setIsDirty] = useState(false);

  const fileContentRef = useRef("");
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => {
    invoke("write_file", { path: filePath, content: fileContentRef.current })
      .then(() => setIsDirty(false))
      .catch((e) => console.error("Save failed:", e));
  };

  const ext = getExtension(filePath);
  const isMarkdown = ext === "md" || ext === "markdown";
  const isDark = theme.name === "Tempest Dark";

  // Reset dirty state and view when file changes.
  useEffect(() => {
    setMode("raw");
    setIsDirty(false);
  }, [filePath]);

  useEffect(() => {
    if (!containerRef.current) return;

    let destroyed = false;
    const langExt = getLanguageExtension(filePath);

    invoke<string>("read_file", { path: filePath })
      .then((content) => {
        if (destroyed) return;
        setFileContent(content);
        setError(null);
        if (!containerRef.current) return;

        const extensions = [
          basicSetup,
          themeCompartment.current.of(buildEditorTheme()),
          highlightCompartment.current.of(syntaxHighlighting(buildHighlightStyle())),
          EditorView.lineWrapping,
          Prec.highest(keymap.of([{ key: "Mod-s", run: () => { saveRef.current(); return true; } }])),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              const text = update.state.doc.toString();
              fileContentRef.current = text;
              setFileContent(text);
              setIsDirty(true);
            }
          }),
        ];
        if (langExt) extensions.push(langExt);

        const view = new EditorView({
          state: EditorState.create({ doc: content, extensions }),
          parent: containerRef.current,
        });
        viewRef.current = view;
      })
      .catch((e) => {
        if (destroyed) return;
        setError(String(e));
      });

    return () => {
      destroyed = true;
      viewRef.current?.destroy();
      viewRef.current = null;
    };
  }, [filePath]);

  // Hot-swap theme when it changes without rebuilding the editor
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: [
        themeCompartment.current.reconfigure(buildEditorTheme()),
        highlightCompartment.current.reconfigure(syntaxHighlighting(buildHighlightStyle())),
      ],
    });
  }, [theme]);

  const fileName = filePath.replace(/\\/g, "/").split("/").pop() ?? filePath;
  const showPreview = isMarkdown && mode === "preview";

  return (
    <div className="cmp-pane" style={{ display: hidden ? "none" : "flex" }}>
      <div className="cmp-header">
        <FileCode size={13} className="cmp-header-icon" />
        <span className="cmp-header-name" title={filePath}>{fileName}</span>
        {isDirty && <span className="cmp-dirty-dot" title="Unsaved changes (Ctrl+S to save)">•</span>}
        {isMarkdown && (
          <div className="cmp-toggle" role="group" aria-label="Markdown view mode">
            <button
              type="button"
              className={`cmp-toggle-btn${mode === "raw" ? " active" : ""}`}
              aria-pressed={mode === "raw"}
              onClick={() => setMode("raw")}
            >
              Raw
            </button>
            <button
              type="button"
              className={`cmp-toggle-btn${mode === "preview" ? " active" : ""}`}
              aria-pressed={mode === "preview"}
              onClick={() => setMode("preview")}
            >
              Preview
            </button>
          </div>
        )}
      </div>

      {error ? (
        <div className="cmp-error">Could not read file: {error}</div>
      ) : (
        <>
          <div
            ref={containerRef}
            className="cmp-container"
            style={{ display: showPreview ? "none" : "block" }}
          />
          {showPreview && (
            <div className="cmp-preview-scroll">
              {/* Only one theme variant is mounted at a time, so the global
                  `.markdown-body` / `.hljs` rules never conflict. */}
              <style>{isDark ? githubMarkdownDark : githubMarkdownLight}</style>
              <style>{isDark ? hljsDark : hljsLight}</style>
              <article
                className="markdown-body cmp-markdown-body"
                data-color-mode={isDark ? "dark" : "light"}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeRaw, rehypeHighlight]}
                  components={{
                    img({ src, alt, ...props }) {
                      const resolved = src ? resolveImageSrc(src, filePath) : src;
                      return <img src={resolved} alt={alt} {...props} />;
                    },
                  }}
                >
                  {fileContent}
                </ReactMarkdown>
              </article>
            </div>
          )}
        </>
      )}
    </div>
  );
}
