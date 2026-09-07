import { XTERM_ENGINE_CSS, XTERM_ENGINE_JS } from './terminal-webview-engine.generated';

// Single-document xterm host. Host <-> WebView protocol is JSON via
// postMessage — no injectJavaScript, no string escaping, no hand-rolled b64.
//
// Host -> WebView commands:
//   { type: 'write', data: string }   append PTY bytes
//   { type: 'clear' }                 reset buffer
//   { type: 'fit' }                   re-run fit + report cols/rows
//
// WebView -> Host notifications:
//   { kind: 'web-ready' }             init done, safe to send writes
//   { kind: 'resize', data: {cols, rows, reason} }
//   { kind: 'error',  data: string }
export const XTERM_HTML = `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>${XTERM_ENGINE_CSS}</style>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #050506; overflow: hidden; }
  #term { width: 100vw; height: 100vh; padding: 6px; box-sizing: border-box; }
  .xterm-viewport { background: #050506 !important; }
</style>
</head><body>
<div id="term"></div>
<script>${XTERM_ENGINE_JS}</script>
<script>
(function () {
  var preBoot = [];
  var booted = false;
  var term = null;
  var fit = null;
  var lastCols = 0, lastRows = 0;

  function post(kind, data) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ kind: kind, data: data })); } catch (e) {}
  }

  function fitAndReport(reason) {
    if (!term || !fit) return;
    try { fit.fit(); } catch (e) { return; }
    var cols = term.cols | 0, rows = term.rows | 0;
    if (cols < 10 || rows < 4) return;
    if (cols === lastCols && rows === lastRows) return;
    lastCols = cols; lastRows = rows;
    post('resize', { cols: cols, rows: rows, reason: reason });
  }

  function handleHostMessage(raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }
    if (msg.type === 'write') {
      if (!booted) { preBoot.push(msg.data); return; }
      term.write(msg.data);
    } else if (msg.type === 'clear') {
      if (term) term.clear();
      preBoot.length = 0;
    } else if (msg.type === 'fit') {
      fitAndReport('external');
    }
  }
  // iOS delivers via document, Android via window. Register both.
  document.addEventListener('message', function (e) { handleHostMessage(e.data); });
  window.addEventListener('message', function (e) { handleHostMessage(e.data); });

  if (!window.Terminal) { post('error', 'xterm globals missing after inline load'); return; }

  // Menlo alone falls to Android's default monospace, which lacks box-drawing,
  // Powerline, and Nerd Font glyphs → they render as tofu boxes. The stack
  // below covers iOS (ui-monospace/Menlo), macOS/Windows dev builds, common
  // Linux monospace fonts, and Nerd Font symbols where present.
  var TERMINAL_FONT = 'ui-monospace, "Menlo", "Monaco", "Cascadia Mono", "Consolas", "DejaVu Sans Mono", "Liberation Mono", "Symbols Nerd Font Mono", monospace';
  term = new window.Terminal({
    // The PTY emits proper CRLF; adding another CR corrupts cursor logic.
    convertEol: false,
    cursorBlink: false,
    fontFamily: TERMINAL_FONT,
    fontSize: 13,
    theme: { background: '#050506', foreground: '#d4d4d8' },
    scrollback: 5000,
    disableStdin: true,
    allowProposedApi: true,
  });
  if (window.FitAddon && window.FitAddon.FitAddon) {
    fit = new window.FitAddon.FitAddon();
    term.loadAddon(fit);
  }
  term.open(document.getElementById('term'));
  try {
    if (window.Unicode11Addon && window.Unicode11Addon.Unicode11Addon) {
      term.loadAddon(new window.Unicode11Addon.Unicode11Addon());
      term.unicode.activeVersion = '11';
    }
  } catch (e) { post('error', 'unicode11 failed: ' + (e && e.message || e)); }
  try {
    if (window.WebglAddon && window.WebglAddon.WebglAddon) {
      var wa = new window.WebglAddon.WebglAddon();
      wa.onContextLoss && wa.onContextLoss(function () { try { wa.dispose(); } catch (e) {} });
      term.loadAddon(wa);
    }
  } catch (e) { post('error', 'webgl failed: ' + (e && e.message || e)); }

  booted = true;
  for (var i = 0; i < preBoot.length; i++) term.write(preBoot[i]);
  preBoot.length = 0;
  // Cell dims aren't reliable until the renderer has painted one frame.
  requestAnimationFrame(function () { fitAndReport('boot'); });
  post('web-ready', null);
  window.addEventListener('resize', function () { fitAndReport('viewport'); });
}());
</script>
</body></html>`;
