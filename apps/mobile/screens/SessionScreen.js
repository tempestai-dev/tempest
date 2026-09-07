import { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, TextInput, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import { WebView } from 'react-native-webview';
import { XTERM_HTML } from '../lib/terminal-webview-html';

const geist = { regular: 'Geist_400Regular', medium: 'Geist_500Medium', semibold: 'Geist_600SemiBold' };

// Busy agents deliver ~200 stream frames/s; batching writes per animation
// tick collapses the per-frame RN <-> WebView IPC cost that runs the phone hot.
const WRITE_FLUSH_MS = 16;

export default function SessionScreen({ client, session, connState, onBack }) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [termReady, setTermReady] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [diag, setDiag] = useState({ outputs: 0, replay: 0, lastRxAt: 0, sentAt: 0 });
  const [landscape, setLandscape] = useState(false);
  const [webviewKey, setWebviewKey] = useState(0);
  const webRef = useRef(null);
  const termReadyRef = useRef(false);
  const pending = useRef([]);
  const flushTimerRef = useRef(null);
  // Last dims we pushed to the PTY, so orientation/keyboard churn doesn't
  // spam SIGWINCH at the agent.
  const lastPushedDims = useRef({ cols: 0, rows: 0 });

  // Restore portrait on leave — otherwise the whole app stays sideways.
  useEffect(() => () => {
    ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT).catch(() => {});
  }, []);

  const toggleOrientation = async () => {
    const next = !landscape;
    try {
      await ScreenOrientation.lockAsync(
        next
          ? ScreenOrientation.OrientationLock.LANDSCAPE
          : ScreenOrientation.OrientationLock.PORTRAIT,
      );
      setLandscape(next);
    } catch (e) {
      setError(`orientation: ${e?.message || e}`);
    }
  };

  const postToWeb = (msg) => {
    webRef.current?.postMessage(JSON.stringify(msg));
  };

  const flushWrites = () => {
    flushTimerRef.current = null;
    if (!pending.current.length || !termReadyRef.current) return;
    const merged = pending.current.join('');
    pending.current = [];
    postToWeb({ type: 'write', data: merged });
  };

  const queueWrite = (chunk) => {
    pending.current.push(chunk);
    if (!termReadyRef.current) return;
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(flushWrites, WRITE_FLUSH_MS);
  };

  useEffect(() => {
    if (!client || !session?.id) return;
    const off = client.on('agent.output', ({ sessionId, chunk }) => {
      if (sessionId !== session.id) return;
      setDiag((d) => ({ ...d, outputs: d.outputs + 1, lastRxAt: Date.now() }));
      queueWrite(chunk);
    });
    return () => { off?.(); };
  }, [client, session?.id]);

  // One subscribe per (session, connection). Replay chunks land in the same
  // pending queue that live output uses, so ordering is preserved.
  useEffect(() => {
    if (!client || !session?.id || connState !== 'open') return;
    let cancelled = false;
    setSubscribed(false);
    // A fresh peer (reconnect or new session) hasn't been told our dims yet.
    lastPushedDims.current = { cols: 0, rows: 0 };
    // Kick a viewport fit through the WebView so the new subscription starts
    // with the PTY sized to what we actually render.
    postToWeb({ type: 'fit' });
    client.request('agent.subscribe', { sessionId: session.id })
      .then((r) => {
        if (cancelled) return;
        const replay = r?.replay || [];
        setDiag((d) => ({ ...d, replay: replay.length, lastRxAt: replay.length ? Date.now() : d.lastRxAt }));
        // Replay is snapshot data — must land before any live chunks that
        // came in during the round-trip.
        pending.current = [...replay, ...pending.current];
        if (termReadyRef.current) flushWrites();
        setSubscribed(true);
      })
      .catch((e) => { if (!cancelled) setError(`subscribe failed: ${e.message}`); });
    return () => {
      cancelled = true;
      client.request('agent.unsubscribe', { sessionId: session.id }).catch(() => {});
    };
  }, [client, session?.id, connState]);

  const pushViewport = (cols, rows) => {
    if (!client || !session?.id || connState !== 'open') return;
    if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 2 || rows < 2) return;
    if (lastPushedDims.current.cols === cols && lastPushedDims.current.rows === rows) return;
    lastPushedDims.current = { cols, rows };
    client.request('agent.resize', { sessionId: session.id, cols, rows }).catch((e) => {
      // Older desktops without the RPC will error — cache to stop retrying.
      if (String(e?.message || '').includes('agent.resize')) lastPushedDims.current = { cols: -1, rows: -1 };
    });
  };

  const onWebMessage = (ev) => {
    try {
      const msg = JSON.parse(ev.nativeEvent.data);
      if (msg.kind === 'web-ready') {
        termReadyRef.current = true;
        setTermReady(true);
        flushWrites();
      } else if (msg.kind === 'resize') {
        pushViewport(msg.data?.cols, msg.data?.rows);
      } else if (msg.kind === 'error') {
        setError(`terminal: ${msg.data}`);
      }
    } catch {}
  };

  // WKWebView content-process loss / Android render-process gone: swap in a
  // fresh WebView. Chunks queued in `pending` will replay when it reboots.
  const remountWebView = () => {
    termReadyRef.current = false;
    setTermReady(false);
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    setWebviewKey((k) => k + 1);
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
          <Pressable onPress={toggleOrientation} hitSlop={12} style={styles.rotBtn}>
            <Text style={styles.rotBtnText}>{landscape ? '▯' : '▭'}</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => setError(null)}><Text style={styles.errorDismiss}>×</Text></Pressable>
          </View>
        ) : null}

        <View style={styles.stream}>
          <WebView
            key={webviewKey}
            ref={webRef}
            originWhitelist={['*']}
            source={{ html: XTERM_HTML }}
            onMessage={onWebMessage}
            javaScriptEnabled
            domStorageEnabled
            scrollEnabled={false}
            nestedScrollEnabled
            // Android WebView defaults textZoom to the system font scale,
            // inflating xterm's DOM glyphs past its canvas-measured cell grid.
            textZoom={100}
            scalesPageToFit={false}
            allowsBackForwardNavigationGestures={false}
            style={{ backgroundColor: '#050506', flex: 1 }}
            containerStyle={{ backgroundColor: '#050506' }}
            androidLayerType="hardware"
            onError={(e) => setError(`webview: ${e?.nativeEvent?.description || 'load failed'}`)}
            onRenderProcessGone={remountWebView}
            onContentProcessDidTerminate={remountWebView}
          />
          {(!termReady || !subscribed) ? (
            <View style={styles.overlay} pointerEvents="none">
              <ActivityIndicator size="small" color="#71717a" />
              <Text style={styles.overlayText}>
                {!termReady ? 'Loading terminal…' : 'Subscribing…'}
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
  rotBtn: {
    width: 90, alignItems: 'flex-end', paddingHorizontal: 8, paddingVertical: 4,
  },
  rotBtnText: {
    color: '#e4e4e7', fontSize: 22, lineHeight: 22,
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
