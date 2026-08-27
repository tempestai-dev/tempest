import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { startRpcClient } from '../lib/rpc';

const geist = { regular: 'Geist_400Regular', medium: 'Geist_500Medium', semibold: 'Geist_600SemiBold' };

const STATE_LABEL = { connecting: 'Connecting…', open: 'Live', closed: 'Reconnecting…' };
const STATE_COLOR = { connecting: '#e0c46c', open: '#7be495', closed: '#e07b7b' };

export default function Connected({ pairing, onUnpair, onBack }) {
  const [connState, setConnState] = useState('connecting');
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  const clientRef = useRef(null);

  useEffect(() => {
    if (!pairing?.sessionKey || !pairing?.sessionId || !pairing?.relayUrl) {
      setError('This pairing predates the companion protocol. Please re-pair.');
      return;
    }
    const client = startRpcClient({
      relayUrl: pairing.relayUrl,
      sessionId: pairing.sessionId,
      sessionKeyB64: pairing.sessionKey,
      onState: setConnState,
    });
    clientRef.current = client;
    return () => client.close();
  }, [pairing?.sessionId, pairing?.sessionKey, pairing?.relayUrl]);

  useEffect(() => {
    if (connState !== 'open') return;
    let cancelled = false;
    const client = clientRef.current;
    if (!client) return;

    client.request('session.list', {})
      .then((r) => { if (!cancelled) setSnapshot(r); })
      .catch((e) => { if (!cancelled) setError(e.message); });

    const offUpdated = client.on('session.updated', (s) => {
      setSnapshot((prev) => {
        if (!prev) return prev;
        const i = prev.sessions.findIndex((x) => x.id === s.id);
        const sessions = i >= 0
          ? Object.assign([...prev.sessions], { [i]: s })
          : [...prev.sessions, s];
        return { ...prev, sessions };
      });
    });
    const offRemoved = client.on('session.removed', ({ id }) => {
      setSnapshot((prev) => prev ? { ...prev, sessions: prev.sessions.filter((x) => x.id !== id) } : prev);
    });

    return () => {
      cancelled = true;
      offUpdated?.();
      offRemoved?.();
    };
  }, [connState]);

  const counts = useMemo(() => {
    if (!snapshot) return { active: 0, waiting: 0, closed: 0, total: 0 };
    let active = 0, waiting = 0, closed = 0;
    for (const s of snapshot.sessions) {
      if (s.closed) closed++;
      else if (s.status === 'waiting') waiting++;
      else if (s.status === 'working') active++;
    }
    return { active, waiting, closed, total: snapshot.sessions.length };
  }, [snapshot]);

  const byProject = useMemo(() => {
    if (!snapshot) return [];
    const projMap = new Map(snapshot.projects.map((p) => [p.id, p]));
    const buckets = new Map();
    for (const s of snapshot.sessions) {
      let bucket = buckets.get(s.projectId);
      if (!bucket) {
        bucket = { project: projMap.get(s.projectId) || { id: s.projectId, name: 'Unknown', path: '' }, sessions: [] };
        buckets.set(s.projectId, bucket);
      }
      bucket.sessions.push(s);
    }
    for (const b of buckets.values()) {
      b.sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }
    return [...buckets.values()].sort((a, b) => a.project.name.localeCompare(b.project.name));
  }, [snapshot]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0a0a0a' }}>
      <StatusBar style="light" />

      <View style={styles.topbar}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={styles.back}>← Desktops</Text>
          </Pressable>
        ) : <View />}
        <View style={styles.connBadge}>
          <View style={[styles.connDot, { backgroundColor: STATE_COLOR[connState] }]} />
          <Text style={styles.connText}>{STATE_LABEL[connState]}</Text>
        </View>
      </View>

      <View style={styles.header}>
        <Text style={styles.hostName}>{pairing?.name || 'Tempest desktop'}</Text>
        <Text style={styles.fp}>{pairing?.fingerprint}</Text>
      </View>

      <View style={styles.countsRow}>
        <Count value={counts.active} label="Active" color="#7be495" />
        <Count value={counts.waiting} label="Needs approval" color="#e0c46c" />
        <Count value={counts.total} label="Total" color="#8a8a90" />
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.list}>
        {error && (
          <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View>
        )}

        {!snapshot && !error && (
          <View style={styles.loading}>
            <ActivityIndicator size="small" color="#8a8a90" />
            <Text style={styles.loadingText}>Loading sessions…</Text>
          </View>
        )}

        {byProject.map(({ project, sessions }) => (
          <View key={project.id} style={styles.projectBlock}>
            <Text style={styles.projectName}>{project.name}</Text>
            {sessions.map((s) => <SessionRow key={s.id} session={s} />)}
          </View>
        ))}

        {snapshot && snapshot.sessions.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No sessions yet.</Text>
            <Text style={styles.emptySub}>Start one on your desktop to see it here.</Text>
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable style={styles.unpairBtn} onPress={onUnpair}>
          <Text style={styles.unpairText}>Unpair this desktop</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Count({ value, label, color }) {
  return (
    <View style={styles.count}>
      <Text style={[styles.countValue, { color }]}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function SessionRow({ session }) {
  const statusColor = session.closed ? '#4a4a50'
    : session.status === 'waiting' ? '#e0c46c'
    : session.status === 'working' ? '#7be495'
    : session.status === 'done' ? '#8a8a90'
    : '#4a4a50';
  return (
    <View style={[styles.row, session.closed && styles.rowClosed]}>
      <View style={[styles.rowDot, { backgroundColor: statusColor }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>
          {session.name}
          {session.agent ? <Text style={styles.rowAgent}> · {session.agent}</Text> : null}
        </Text>
        <Text style={styles.rowSub}>
          {session.closed ? 'Closed' : session.status}
          {session.queueLength > 0 ? ` · ${session.queueLength} queued` : ''}
          {session.needsPermission ? ' · approval pending' : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4,
  },
  back: { color: '#b8b8c0', fontSize: 15, fontFamily: geist.regular },
  connBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: 999, backgroundColor: '#161618',
  },
  connDot: { width: 6, height: 6, borderRadius: 3 },
  connText: { color: '#b8b8c0', fontSize: 11, fontFamily: geist.medium, letterSpacing: 0.4 },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  hostName: { color: '#f5f5f7', fontSize: 22, fontFamily: geist.semibold, letterSpacing: -0.4 },
  fp: { color: '#6b6b70', fontSize: 12, fontFamily: geist.regular, letterSpacing: 0.4, marginTop: 2 },

  countsRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  count: {
    flex: 1, backgroundColor: '#111114', borderRadius: 10,
    paddingVertical: 12, paddingHorizontal: 12,
  },
  countValue: { fontSize: 22, fontFamily: geist.semibold, letterSpacing: -0.4 },
  countLabel: { color: '#6b6b70', fontSize: 11, fontFamily: geist.regular, marginTop: 2, letterSpacing: 0.4 },

  list: { paddingHorizontal: 20, paddingBottom: 32 },
  projectBlock: { marginTop: 20 },
  projectName: {
    color: '#8a8a90', fontSize: 11, fontFamily: geist.medium,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12,
    borderRadius: 8, backgroundColor: '#111114', marginBottom: 6,
  },
  rowClosed: { opacity: 0.55 },
  rowDot: { width: 8, height: 8, borderRadius: 4 },
  rowName: { color: '#f5f5f7', fontSize: 14, fontFamily: geist.medium },
  rowAgent: { color: '#8a8a90', fontSize: 13, fontFamily: geist.regular },
  rowSub: { color: '#6b6b70', fontSize: 11, fontFamily: geist.regular, marginTop: 2, letterSpacing: 0.2 },

  loading: { alignItems: 'center', paddingTop: 40, gap: 10 },
  loadingText: { color: '#6b6b70', fontSize: 12, fontFamily: geist.regular },

  empty: { alignItems: 'center', paddingTop: 60, gap: 6 },
  emptyText: { color: '#b8b8c0', fontSize: 15, fontFamily: geist.medium },
  emptySub: { color: '#6b6b70', fontSize: 12, fontFamily: geist.regular },

  errorBanner: {
    marginTop: 16, padding: 12, borderRadius: 8,
    backgroundColor: 'rgba(217,112,112,0.14)',
    borderWidth: 1, borderColor: 'rgba(217,112,112,0.35)',
  },
  errorText: { color: '#f0b0b0', fontSize: 13, fontFamily: geist.regular },

  footer: { paddingHorizontal: 20, paddingBottom: 16 },
  unpairBtn: {
    borderWidth: 1, borderColor: '#2a2a30', borderRadius: 8,
    paddingVertical: 16, alignItems: 'center',
  },
  unpairText: { color: '#f5f5f7', fontSize: 14, fontFamily: geist.medium, letterSpacing: 0.2 },
});
