import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';

const geist = { regular: 'Geist_400Regular', medium: 'Geist_500Medium', semibold: 'Geist_600SemiBold' };

// xterm.js in a WebView. Same PTY bytes the desktop pane renders — no
// ANSI stripping. Fetched by RN from cdnjs and inlined into the HTML; the
// WebView's own network is blocked in some configurations (WKWebView with an
// html:baseUrl origin, corp/school proxies), but RN itself can reach cdnjs
// since it's already talking to the tunnel. Cached at module scope so we
// only pay the fetch once per app launch.
const CDN_MIRRORS = [
  {
    css: 'https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/xterm.min.css',
    js:  'https://cdnjs.cloudflare.com/ajax/libs/xterm/5.3.0/xterm.min.js',
    fit: 'https://cdnjs.cloudflare.com/ajax/libs/xterm-addon-fit/0.8.0/xterm-addon-fit.min.js',
  },
  {
    css: 'https://cdn.jsdelivr.net/npm/xterm@5.3.0/css/xterm.min.css',
    js:  'https://cdn.jsdelivr.net/npm/xterm@5.3.0/lib/xterm.min.js',
    fit: 'https://cdn.jsdelivr.net/npm/xterm-addon-fit@0.8.0/lib/xterm-addon-fit.min.js',
  },
];

async function fetchMirror(m) {
  const [css, js, fit] = await Promise.all([
    fetch(m.css).then((r) => { if (!r.ok) throw new Error(`css ${r.status}`); return r.text(); }),
    fetch(m.js ).then((r) => { if (!r.ok) throw new Error(`js ${r.status}`);  return r.text(); }),
    fetch(m.fit).then((r) => { if (!r.ok) throw new Error(`fit ${r.status}`); return r.text(); }),
  ]);
  return [css, js, fit];
}

let xtermBundlePromise = null;
function loadXtermBundle() {
  if (xtermBundlePromise) return xtermBundlePromise;
  xtermBundlePromise = (async () => {
    let lastErr;
    for (const m of CDN_MIRRORS) {
      try { return await fetchMirror(m); }
      catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('all mirrors failed');
  })().catch((e) => { xtermBundlePromise = null; throw e; });
  return xtermBundlePromise;
}

// Build the WebView HTML with xterm's JS + CSS inlined. Escaping </script>
// inside JS strings is the only landmine — split the token so no closing
// </script> lives inside the outer <script> block.
function buildTermHtml(cssText, xtermJs, fitJs) {
  const safe = (s) => s.replace(/<\/(script)/gi, '<\\/$1');
  return `<!doctype html>
<html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<style>${cssText}</style>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #050506; overflow: hidden; }
  #term { height: 100vh; width: 100vw; padding: 6px; box-sizing: border-box; }
  .xterm-viewport { background: #050506 !important; }
</style>
</head><body>
<div id="term"></div>
<script>${safe(xtermJs)}</script>
<script>${safe(fitJs)}</script>
<script>
  (function () {
    var queue = [];
    var ready = false;
    var term = null;
    var fit  = null;
    function post(kind, data) {
      try { window.ReactNativeWebView.postMessage(JSON.stringify({ kind: kind, data: data })); } catch (e) {}
    }
    window.__write = function (b64) {
      // Chunk sent from RN as base64 to survive JS-string escaping.
      var s;
      try { s = atob(b64); } catch (e) { s = ''; }
      if (!ready) { queue.push(s); return; }
      term.write(s);
    };
    window.__clear = function () { if (term) term.clear(); queue.length = 0; };
    window.__fit   = function () { try { fit && fit.fit(); } catch (e) {} };
    if (!window.Terminal) { post('error', 'xterm globals missing after inline load'); return; }
    function boot() {
      term = new window.Terminal({
        convertEol: true,
        cursorBlink: false,
        fontFamily: 'Menlo, monospace',
        fontSize: 12,
        theme: { background: '#050506', foreground: '#d4d4d8' },
        scrollback: 5000,
        disableStdin: true,
      });
      if (window.FitAddon) {
        fit = new window.FitAddon.FitAddon();
        term.loadAddon(fit);
      }
      term.open(document.getElementById('term'));
      try { fit && fit.fit(); } catch (e) {}
      ready = true;
      for (var i = 0; i < queue.length; i++) term.write(queue[i]);
      queue.length = 0;
      post('ready', null);
      window.addEventListener('resize', function () { try { fit && fit.fit(); } catch (e) {} });
    }
    boot();
  }());
</script>
</body></html>`;
}

// Minimal base64 encoder — Buffer isn't in RN, btoa doesn't handle non-latin.
// Chunks are ANSI bytes (single-byte, latin-1 safe) so this is enough.
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function b64encode(str) {
  let out = '', i = 0;
  while (i < str.length) {
    const c1 = str.charCodeAt(i++) & 0xff;
    const c2 = i < str.length ? str.charCodeAt(i++) & 0xff : NaN;
    const c3 = i < str.length ? str.charCodeAt(i++) & 0xff : NaN;
    out += B64[c1 >> 2];
    out += B64[((c1 & 3) << 4) | ((isNaN(c2) ? 0 : c2) >> 4)];
    out += isNaN(c2) ? '=' : B64[((c2 & 15) << 2) | ((isNaN(c3) ? 0 : c3) >> 6)];
    out += isNaN(c3) ? '=' : B64[c3 & 63];
  }
  return out;
}

export default function SessionScreen({ client, session, connState, onBack }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [termReady, setTermReady] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [termHtml, setTermHtml] = useState(null);
  // Diagnostic counters — surface which link in the wire is stalled.
  // outputs: number of agent.output events received from desktop.
  // replay: total chunks in the initial subscribe replay payload.
  // lastRx: ms since last chunk (either replay or live). Zero if never.
  const [diag, setDiag] = useState({ outputs: 0, replay: 0, lastRxAt: 0, sentAt: 0 });
  const webRef = useRef(null);
  // Chunks that arrive before the WebView is ready sit here. Ref-based so
  // ready/output effects don't churn on state.
  const pending = useRef([]);
  const termReadyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadXtermBundle()
      .then(([css, js, fit]) => { if (!cancelled) setTermHtml(buildTermHtml(css, js, fit)); })
      .catch((e) => { if (!cancelled) setError(`xterm fetch failed: ${e.message}`); });
    return () => { cancelled = true; };
  }, []);

  const inject = (chunk) => {
    const b64 = b64encode(chunk);
    // injectJavaScript needs a trailing `true;` to satisfy Android's return-value contract.
    webRef.current?.injectJavaScript(`window.__write && window.__write("${b64}"); true;`);
  };

  const flushPending = () => {
    if (!webRef.current) return;
    const chunks = pending.current;
    pending.current = [];
    for (const c of chunks) inject(c);
  };

  useEffect(() => {
    if (!client || !session?.id) return;
    const off = client.on('agent.output', ({ sessionId, chunk }) => {
      if (sessionId !== session.id) return;
      setDiag((d) => ({ ...d, outputs: d.outputs + 1, lastRxAt: Date.now() }));
      if (!termReadyRef.current) { pending.current.push(chunk); return; }
      inject(chunk);
    });
    return () => { off?.(); };
  }, [client, session?.id]);

  // One subscribe per (session, connection). Not gated on termReady — chunks
  // and replay both land in `pending` until the WebView boots and flushes.
  // Re-firing on termReady would burn a subscribe/unsubscribe pair every mount
  // and race the desktop bridge on the same sessionId.
  useEffect(() => {
    if (!client || !session?.id || connState !== 'open') return;
    let cancelled = false;
    setSubscribed(false);
    client.request('agent.subscribe', { sessionId: session.id })
      .then((r) => {
        if (cancelled) return;
        const replay = r?.replay || [];
        setDiag((d) => ({ ...d, replay: replay.length, lastRxAt: replay.length ? Date.now() : d.lastRxAt }));
        if (termReadyRef.current) {
          for (const c of replay) inject(c);
        } else {
          pending.current.unshift(...replay);
        }
        setSubscribed(true);
      })
      .catch((e) => { if (!cancelled) setError(`subscribe failed: ${e.message}`); });
    return () => {
      cancelled = true;
      client.request('agent.unsubscribe', { sessionId: session.id }).catch(() => {});
    };
  }, [client, session?.id, connState]);

  const onWebMessage = (ev) => {
    try {
      const msg = JSON.parse(ev.nativeEvent.data);
      if (msg.kind === 'ready') {
        termReadyRef.current = true;
        setTermReady(true);
        flushPending();
        // Note: intentionally NOT calling pty.resize — that would shrink the
        // shared desktop PTY to phone dims. xterm word-wraps locally instead;
        // desktop pane stays at its own size.
      } else if (msg.kind === 'error') {
        setError(`terminal: ${msg.data}`);
      }
    } catch {}
  };

  const send = async () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await client.request('agent.send', { sessionId: session.id, text });
      setDiag((d) => ({ ...d, sentAt: Date.now() }));
      setDraft('');
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const interrupt = async () => {
    try { await client.request('agent.interrupt', { sessionId: session.id }); }
    catch (e) { setError(e.message); }
  };

  const stop = () => {
    Alert.alert('Stop session?', 'This terminates the agent. Queue is preserved.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Stop', style: 'destructive', onPress: async () => {
        try {
          await client.request('agent.stop', { sessionId: session.id });
          onBack?.();
        } catch (e) { setError(e.message); }
      } },
    ]);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#09090b' }}>
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.topbar}>
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={styles.back}>‹ Sessions</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>{session?.name}</Text>
            {session?.agent ? (
              <Text style={styles.subtitle} numberOfLines={1}>{session.agent}</Text>
            ) : null}
          </View>
          <View style={styles.diag}>
            <Text style={styles.diagText}>
              {connState[0].toUpperCase()} · {subscribed ? 'S' : '-'} · rx{diag.outputs}
              {diag.replay ? ` +${diag.replay}` : ''}
            </Text>
          </View>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => setError(null)}><Text style={styles.errorDismiss}>×</Text></Pressable>
          </View>
        ) : null}

        <View style={styles.stream}>
          {termHtml ? (
            <WebView
              ref={webRef}
              originWhitelist={['*']}
              source={{ html: termHtml, baseUrl: 'https://tempest.local/' }}
              onMessage={onWebMessage}
              javaScriptEnabled
              domStorageEnabled
              scrollEnabled={false}
              mixedContentMode="always"
              allowsBackForwardNavigationGestures={false}
              style={{ backgroundColor: '#050506', flex: 1 }}
              containerStyle={{ backgroundColor: '#050506' }}
              androidLayerType="hardware"
            />
          ) : null}
          {(!termHtml || !termReady || !subscribed) ? (
            <View style={styles.overlay} pointerEvents="none">
              <ActivityIndicator size="small" color="#71717a" />
              <Text style={styles.overlayText}>
                {!termHtml ? 'Fetching terminal…' : !termReady ? 'Loading terminal…' : 'Subscribing…'}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.actionBar}>
          <Pressable style={styles.actionBtn} onPress={interrupt}>
            <Text style={styles.actionText}>Interrupt</Text>
          </Pressable>
          <Pressable style={[styles.actionBtn, styles.stopBtn]} onPress={stop}>
            <Text style={[styles.actionText, styles.stopText]}>Stop</Text>
          </Pressable>
        </View>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder="Send a prompt…"
            placeholderTextColor="#71717a"
            multiline
            editable={!busy}
            onSubmitEditing={send}
            blurOnSubmit={false}
          />
          <Pressable
            style={[styles.sendBtn, (!draft.trim() || busy) && { opacity: 0.4 }]}
            onPress={send}
            disabled={!draft.trim() || busy}
          >
            {busy ? <ActivityIndicator size="small" color="#0c0d10" />
                  : <Text style={styles.sendText}>Send</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8,
    borderBottomWidth: 1, borderBottomColor: '#18181b',
  },
  back: { color: '#e4e4e7', fontSize: 17, fontFamily: geist.regular, width: 90 },
  diag: {
    width: 90, alignItems: 'flex-end', paddingHorizontal: 4,
  },
  diagText: {
    color: '#71717a', fontSize: 10, fontFamily: 'GeistPixel',
    letterSpacing: 0.5,
  },
  title: { color: '#fafafa', fontSize: 15, fontFamily: geist.semibold, letterSpacing: -0.2 },
  subtitle: { color: '#8ab4f8', fontSize: 11, fontFamily: geist.medium, letterSpacing: 0.3, marginTop: 2 },

  stream: { flex: 1, backgroundColor: '#050506', position: 'relative' },
  overlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', gap: 10,
    backgroundColor: 'rgba(5,5,6,0.85)',
  },
  overlayText: { color: '#a1a1aa', fontSize: 13, fontFamily: geist.regular },

  actionBar: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingTop: 10,
    backgroundColor: '#09090b',
  },
  actionBtn: {
    flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a',
  },
  actionText: { color: '#e4e4e7', fontSize: 14, fontFamily: geist.medium, letterSpacing: 0.2 },
  stopBtn: { backgroundColor: '#2b1010', borderColor: '#5a1a1a' },
  stopText: { color: '#f0b0b0' },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 10,
    paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12,
    backgroundColor: '#09090b',
  },
  input: {
    flex: 1, minHeight: 44, maxHeight: 120,
    backgroundColor: '#0f0f11', borderColor: '#27272a', borderWidth: 1,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    color: '#fafafa', fontSize: 15, fontFamily: geist.regular,
  },
  sendBtn: {
    minWidth: 68, height: 44, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center',
  },
  sendText: { color: '#0c0d10', fontSize: 15, fontFamily: geist.semibold, letterSpacing: 0.2 },

  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 8,
    backgroundColor: 'rgba(217,112,112,0.12)', borderWidth: 1, borderColor: 'rgba(217,112,112,0.3)',
  },
  errorText: { flex: 1, color: '#f0b0b0', fontSize: 13, fontFamily: geist.regular },
  errorDismiss: { color: '#f0b0b0', fontSize: 20, paddingHorizontal: 6 },
});
