import { syntaxTree } from "@codemirror/language";
import { type Range } from "@codemirror/state";
import {
  Decoration, type DecorationSet, EditorView, ViewPlugin,
  type ViewUpdate, WidgetType,
} from "@codemirror/view";

// Obsidian-style live markdown preview for CodeMirror 6. Walks the markdown
// syntax tree over the visible ranges and decorates in place: heading text
// grows, bold/italic/code/links render, list bullets become dots. Syntax
// markers (`#`, `*`, `` ` ``, `>`, link brackets/urls) are hidden — but revealed
// again on whatever line the cursor sits on, so you edit raw and read rendered
// at the same time. Pair with `markdown()` so the tree is available.

class BulletWidget extends WidgetType {
  eq() { return true; }
  toDOM() {
    const s = document.createElement("span");
    s.className = "cm-md-bullet";
    s.textContent = "•";
    return s;
  }
}

class ImageWidget extends WidgetType {
  constructor(readonly url: string, readonly alt: string) { super(); }
  eq(o: ImageWidget) { return o.url === this.url && o.alt === this.alt; }
  toDOM() {
    const img = document.createElement("img");
    img.src = this.url;
    img.alt = this.alt;
    img.className = "cm-md-img";
    return img;
  }
  // Prevent CM from treating clicks as caret placements inside the widget.
  ignoreEvent() { return false; }
}

const hide       = Decoration.replace({});
const bullet     = Decoration.replace({ widget: new BulletWidget() });
const strongMk   = Decoration.mark({ class: "cm-md-strong" });
const emMk       = Decoration.mark({ class: "cm-md-em" });
const codeMk     = Decoration.mark({ class: "cm-md-code" });
const linkMk      = Decoration.mark({ class: "cm-md-link" });
const monoLine   = Decoration.line({ class: "cm-md-mono" });
const quoteLine  = Decoration.line({ class: "cm-md-quote" });
const headingLine = [1, 2, 3, 4, 5, 6].map((n) =>
  Decoration.line({ class: `cm-md-h${n}` }));

function build(view: EditorView): DecorationSet {
  const { state } = view;
  const doc = state.doc;
  const deco: Range<Decoration>[] = [];

  // A marker stays raw only while the cursor is inside its enclosing element
  // (the whole `**bold**`, the heading line, the blockquote) — not merely its
  // line. So `Hello **Hi**` conceals the stars once you move past them.
  const sel = state.selection;
  const touches = (from: number, to: number) => sel.ranges.some((r) => r.from <= to && r.to >= from);
  // Eat one trailing space after a marker so hidden `## ` leaves no gap.
  const eat = (to: number) => (doc.sliceString(to, to + 1) === " " ? to + 1 : to);
  const conceal = (node: { from: number; to: number; node: { parent: { from: number; to: number } | null } }, to: number) => {
    const p = node.node.parent ?? node;
    if (!touches(p.from, p.to)) deco.push(hide.range(node.from, to));
  };

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter: (node) => {
        const name = node.name;
        const m = /^ATXHeading([1-6])$/.exec(name);
        if (m) { deco.push(headingLine[+m[1] - 1].range(doc.lineAt(node.from).from)); return; }

        switch (name) {
          case "HeaderMark":
          case "QuoteMark":       conceal(node, eat(node.to)); break;
          case "EmphasisMark":
          case "CodeMark":
          case "LinkMark":
          case "URL":             conceal(node, node.to); break;
          case "StrongEmphasis":  deco.push(strongMk.range(node.from, node.to)); break;
          case "Emphasis":        deco.push(emMk.range(node.from, node.to)); break;
          case "InlineCode":      deco.push(codeMk.range(node.from, node.to)); break;
          case "Link":            deco.push(linkMk.range(node.from, node.to)); break;
          case "Image": {
            // Parse `![alt](url)` from the source range; skip if malformed.
            const src = doc.sliceString(node.from, node.to);
            const m = /^!\[([^\]]*)\]\(([^)]+)\)$/.exec(src);
            if (!m) break;
            const [, alt, url] = m;
            // While the cursor sits on the image, show the raw markdown so
            // the URL is editable; otherwise replace it with the rendered img.
            if (!touches(node.from, node.to)) {
              deco.push(
                Decoration.replace({ widget: new ImageWidget(url, alt), block: false })
                  .range(node.from, node.to),
              );
            }
            break;
          }
          case "ListMark":
            if (/^[-*+]$/.test(doc.sliceString(node.from, node.to)))
              deco.push(bullet.range(node.from, node.to));
            break;
          case "Blockquote":
            for (let l = doc.lineAt(node.from).number; l <= doc.lineAt(node.to).number; l++)
              deco.push(quoteLine.range(doc.line(l).from));
            break;
          case "FencedCode":
            for (let l = doc.lineAt(node.from).number; l <= doc.lineAt(node.to).number; l++)
              deco.push(monoLine.range(doc.line(l).from));
            break;
        }
      },
    });
  }
  return Decoration.set(deco, true);
}

export const markdownLivePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = build(view); }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = build(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);

// CSS vars resolve live against the app theme, so no rebuild on theme change.
export const livePreviewTheme = EditorView.theme({
  ".cm-md-h1": { fontSize: "1.6em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-md-h2": { fontSize: "1.35em", fontWeight: "700" },
  ".cm-md-h3": { fontSize: "1.15em", fontWeight: "600" },
  ".cm-md-h4": { fontSize: "1.05em", fontWeight: "600" },
  ".cm-md-h5": { fontWeight: "600" },
  ".cm-md-h6": { fontWeight: "600", color: "var(--tempest-fg-muted)" },
  ".cm-md-strong": { fontWeight: "700" },
  ".cm-md-em": { fontStyle: "italic" },
  ".cm-md-code": {
    fontFamily: "var(--font-mono, 'Geist Mono', monospace)", fontSize: "0.9em",
    background: "var(--tempest-bg-active)", borderRadius: "4px", padding: "1px 4px",
  },
  ".cm-md-mono": { fontFamily: "var(--font-mono, 'Geist Mono', monospace)", fontSize: "0.9em" },
  ".cm-md-quote": {
    borderLeft: "3px solid var(--tempest-border-default)", paddingLeft: "10px",
    color: "var(--tempest-fg-muted)",
  },
  ".cm-md-link": { color: "var(--tempest-accent-blue)", textDecoration: "underline" },
  ".cm-md-bullet": { color: "var(--tempest-fg-muted)", paddingRight: "4px" },
  ".cm-md-img": {
    display: "block", maxWidth: "100%", maxHeight: "320px",
    borderRadius: "6px", margin: "6px 0",
    border: "1px solid var(--tempest-border-subtle)",
  },
});
