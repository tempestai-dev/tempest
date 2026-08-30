import { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { startRpcClient } from '../lib/rpc';
import SessionScreen from './SessionScreen';

// Bump for any BREAKING wire change (removed method, changed field semantics,
// new framing). MIN_COMPATIBLE_DESKTOP_VERSION is the oldest desktop this
// mobile build can safely talk to — bump it to force users to update Tempest
// on the laptop. The desktop enforces the mirror pair; either side rejects
// on mismatch and this screen renders instead of loading the session list.
const MOBILE_PROTOCOL_VERSION = 1;
const MIN_COMPATIBLE_DESKTOP_VERSION = 1;

const geist = { regular: 'Geist_400Regular', medium: 'Geist_500Medium', semibold: 'Geist_600SemiBold' };

const STATE_LABEL = { connecting: 'Connecting', open: 'Live', closed: 'Reconnecting' };
const STATE_COLOR = { connecting: '#e0c46c', open: '#7be495', closed: '#e07b7b' };

const STATUS_COLOR = {
  working: '#7be495',
  waiting: '#e0c46c',
  done: '#8a8a90',
  idle: '#5a5a60',
};

const shortPath = (p) => {
  if (!p) return '';
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 3) return p;
  return '…/' + parts.slice(-3).join('/');
};

const timeAgo = (iso) => {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!then) return '';
  const s = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  return `${Math.round(d / 30)}mo`;
};

// Root pseudo-row label. Matches the desktop sidebar for git projects; for
// non-git projects that still have root sessions we fall back to "root".
const ROOT_KEY = '__root__';
const basename = (p) => (p || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || (p || '');

export default function Connected({ pairing, onUnpair, onBack }) {
  const [connState, setConnState] = useState('connecting');
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  // Collapsed sets are on by-id for projects and by "projectId::branchKey" for
  // branches. Everything else defaults to expanded — sidebar parity.
  const [collapsedProjects, setCollapsedProjects] = useState(() => new Set());
  const [collapsedBranches, setCollapsedBranches] = useState(() => new Set());
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  // Session id currently being reopened via session.hop — shows a spinner on
  // the tapped row so the user gets feedback while the desktop respawns PTY.
  const [reopeningId, setReopeningId] = useState(null);
  // Populated when the protocol.hello check fails after connect. Shape:
  // { side: 'desktop'|'mobile', have: number, need: number }. When set, the
  // whole screen renders the block overlay instead of the session list.
  const [versionBlock, setVersionBlock] = useState(null);
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

    // Gate the rest of the wire on a passing protocol handshake. On mismatch
    // the desktop rejects with a structured error we translate into a
    // block screen. A generic error is treated as a version pass — the
    // subsequent session.list will surface any real network problem.
    const checkVersion = client.request('protocol.hello', {
      mobile: MOBILE_PROTOCOL_VERSION,
      minCompatibleDesktop: MIN_COMPATIBLE_DESKTOP_VERSION,
    })
      .then((r) => {
        if (r?.desktop != null && r.desktop < MIN_COMPATIBLE_DESKTOP_VERSION) {
          return { side: 'desktop', have: r.desktop, need: MIN_COMPATIBLE_DESKTOP_VERSION };
        }
        if (r?.minCompatibleMobile != null && MOBILE_PROTOCOL_VERSION < r.minCompatibleMobile) {
          return { side: 'mobile', have: MOBILE_PROTOCOL_VERSION, need: r.minCompatibleMobile };
        }
        return null;
      })
      .catch((e) => {
        const m = String(e?.message || '').match(/(desktop|mobile)_too_old:(\d+)<(\d+)/);
        return m ? { side: m[1], have: Number(m[2]), need: Number(m[3]) } : null;
      });

    checkVersion.then((block) => {
      if (cancelled) return;
      setVersionBlock(block);
      if (block) return; // don't subscribe on a mismatch
      client.request('session.list', {})
        .then((r) => {
          if (cancelled) return;
          setSnapshot({
            sessions: r?.sessions || [],
            projects: r?.projects || [],
            branches: r?.branches || [],
            recents:  r?.recents  || [],
          });
        })
        .catch((e) => { if (!cancelled) setError(e.message); });
    });

    // Refetch the whole snapshot when an update references a project or branch
    // we don't know about yet — the desktop may have added a new project or
    // worktree since we paired, and without this the row would land under a
    // synthetic "Unknown" bucket.
    const refetch = () => {
      client.request('session.list', {})
        .then((r) => {
          if (cancelled) return;
          setSnapshot({
            sessions: r?.sessions || [],
            projects: r?.projects || [],
            branches: r?.branches || [],
            recents:  r?.recents  || [],
          });
        })
        .catch(() => {});
    };

    const offUpdated = client.on('session.updated', (s) => {
      console.log(`[Connected] session.updated id=${s.id.slice(0, 8)} status=${s.status} closed=${s.closed}`);
      setSnapshot((prev) => {
        if (!prev) { refetch(); return prev; }
        const knownProject = prev.projects.some((p) => p.id === s.projectId);
        const knownBranch  = !s.branchId || prev.branches.some((b) => b.id === s.branchId);
        if (!knownProject || !knownBranch) { refetch(); }
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
    const offProjects = client.on('projects.changed', ({ projects }) => {
      setSnapshot((prev) => prev ? { ...prev, projects } : prev);
    });

    return () => {
      cancelled = true;
      offUpdated?.();
      offRemoved?.();
      offProjects?.();
    };
  }, [connState]);

  const counts = useMemo(() => {
    if (!snapshot) return { active: 0, waiting: 0, total: 0 };
    let active = 0, waiting = 0;
    for (const s of snapshot.sessions) {
      if (s.closed) continue;
      if (s.status === 'waiting') waiting++;
      else if (s.status === 'working') active++;
    }
    return { active, waiting, total: snapshot.sessions.length };
  }, [snapshot]);

  // branchId → branch path, so a session's branchId maps to a worktree.
  const branchPathById = useMemo(() => {
    const m = new Map();
    if (!snapshot) return m;
    for (const b of snapshot.branches || []) m.set(b.id, b.path);
    return m;
  }, [snapshot]);

  // Group: project → [{ key, label, isRoot, sessions }]. Rows come from the
  // desktop's disk scan (project.worktrees) so every worktree shows even
  // without sessions, and match the desktop sidebar order. Sessions land in
  // the worktree whose path equals their branch's path; the rest fall under
  // a "main"/"root" pseudo-row keyed by ROOT_KEY.
  const byProject = useMemo(() => {
    if (!snapshot) return [];
    const projects = snapshot.projects || [];
    const out = [];

    for (const project of projects) {
      const worktrees = project.worktrees || [];
      const isGit = !!project.isGit;
      const groups = new Map();

      // Seed every disk-scanned worktree as an empty bucket (order preserved).
      for (const wt of worktrees) {
        groups.set(wt.path, { key: wt.path, label: wt.name, isRoot: false, sessions: [] });
      }

      // Place sessions.
      for (const s of (snapshot.sessions || [])) {
        if (s.projectId !== project.id) continue;
        const branchPath = s.branchId ? branchPathById.get(s.branchId) : undefined;
        let key;
        if (branchPath && groups.has(branchPath)) {
          key = branchPath;
        } else if (branchPath) {
          // Session's branch doesn't match any known worktree — synthesize a
          // row so it's still visible under its branch name, not folded into root.
          key = branchPath;
          if (!groups.has(key)) {
            groups.set(key, { key, label: basename(branchPath), isRoot: false, sessions: [] });
          }
        } else {
          key = ROOT_KEY;
          if (!groups.has(key)) {
            groups.set(key, { key, label: isGit ? 'main' : 'root', isRoot: true, sessions: [] });
          }
        }
        groups.get(key).sessions.push(s);
      }

      // Make sure the root row exists for git projects even without sessions —
      // matches the desktop "main" pseudo-row.
      if (isGit && !groups.has(ROOT_KEY)) {
        groups.set(ROOT_KEY, { key: ROOT_KEY, label: 'main', isRoot: true, sessions: [] });
      }

      const ordered = [];
      const root = groups.get(ROOT_KEY);
      if (root) ordered.push(root);
      for (const wt of worktrees) {
        const g = groups.get(wt.path);
        if (g) ordered.push(g);
      }
      // Any synthesised branch rows (branch path with no matching worktree)
      // land at the end, alphabetically — rare, but keeps them visible.
      for (const g of groups.values()) {
        if (g === root) continue;
        if (worktrees.some((w) => w.path === g.key)) continue;
        ordered.push(g);
      }
      for (const g of ordered) g.sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      if (ordered.length === 0) continue;
      out.push({ project, groups: ordered });
    }

    // Sessions whose projectId isn't in snapshot.projects (rare) — surface
    // them under a synthetic project so they don't vanish.
    const knownIds = new Set(projects.map((p) => p.id));
    const orphans = (snapshot.sessions || []).filter((s) => !knownIds.has(s.projectId));
    if (orphans.length > 0) {
      const g = { key: ROOT_KEY, label: 'main', isRoot: true, sessions: orphans.slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt)) };
      out.push({ project: { id: '__orphans__', name: 'Unknown', path: '', worktrees: [], isGit: false }, groups: [g] });
    }

    return out;
  }, [snapshot, branchPathById]);

  const openPaths = useMemo(() => {
    const s = new Set();
    for (const p of snapshot?.projects || []) s.add(p.path);
    return s;
  }, [snapshot]);

  const recents = useMemo(() => {
    return (snapshot?.recents || []).filter((r) => !openPaths.has(r.path));
  }, [snapshot, openPaths]);

  const toggleProject = (id) => setCollapsedProjects((prev) => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const toggleBranch = (key) => setCollapsedBranches((prev) => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n;
  });

  // Tapping a closed (ghost) session reopens it on the desktop via session.hop
  // — same id, same conversation resumed — then enters SessionScreen once the
  // reply lands. Live sessions skip straight to the SessionScreen.
  const handleTapSession = async (s) => {
    if (!s.closed) { setSelectedSessionId(s.id); return; }
    if (reopeningId) return;
    setReopeningId(s.id);
    try {
      await clientRef.current?.request('session.hop', { id: s.id });
      setSelectedSessionId(s.id);
    } catch (e) {
      setError(`Couldn't reopen ${s.name}: ${e?.message || e}`);
    } finally {
      setReopeningId(null);
    }
  };

  // A row was tapped — hand control to SessionScreen, sharing the live client.
  // If the session vanishes (removed / snapshot missing), fall back to the list.
  const selectedSession = selectedSessionId
    ? (snapshot?.sessions || []).find((s) => s.id === selectedSessionId) || null
    : null;
  if (selectedSession) {
    return (
      <SessionScreen
        client={clientRef.current}
        session={selectedSession}
        connState={connState}
        onBack={() => setSelectedSessionId(null)}
      />
    );
  }

  if (versionBlock) {
    return (
      <ProtocolBlockScreen
        block={versionBlock}
        pairingName={pairing?.name}
        onUnpair={onUnpair}
        onBack={onBack}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#09090b' }}>
      <StatusBar style="light" />

      <View style={styles.topbar}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={styles.back}>‹ Desktops</Text>
          </Pressable>
        ) : <View />}
        <View style={styles.connBadge}>
          <View style={[styles.connDot, { backgroundColor: STATE_COLOR[connState] }]} />
          <Text style={styles.connText}>{STATE_LABEL[connState]}</Text>
        </View>
      </View>

      <View style={styles.header}>
        <Text style={styles.hostName} numberOfLines={1}>{pairing?.name || 'Tempest desktop'}</Text>
        <View style={styles.metaRow}>
          <Text style={styles.fpText}>{pairing?.fingerprint}</Text>
          <Text style={styles.metaDot}>·</Text>
          <Text style={styles.metaCount}>{counts.total} sessions</Text>
          {counts.active > 0 && <>
            <Text style={styles.metaDot}>·</Text>
            <Text style={[styles.metaCount, { color: '#7be495' }]}>{counts.active} active</Text>
          </>}
          {counts.waiting > 0 && <>
            <Text style={styles.metaDot}>·</Text>
            <Text style={[styles.metaCount, { color: '#e0c46c' }]}>{counts.waiting} approval</Text>
          </>}
        </View>
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

        {byProject.map(({ project, groups }) => {
          const projectCollapsed = collapsedProjects.has(project.id);
          const projectSessionCount = groups.reduce((n, g) => n + g.sessions.length, 0);
          return (
            <View key={project.id} style={styles.projectCard}>
              <Pressable
                style={styles.projectHead}
                onPress={() => toggleProject(project.id)}
                hitSlop={4}
              >
                <Chevron open={!projectCollapsed} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.projectName} numberOfLines={1}>{project.name}</Text>
                  {project.path ? (
                    <Text style={styles.projectPath} numberOfLines={1}>{shortPath(project.path)}</Text>
                  ) : null}
                </View>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{projectSessionCount}</Text>
                </View>
              </Pressable>

              {!projectCollapsed && groups.map((g) => {
                const branchKey = `${project.id}::${g.key}`;
                const branchCollapsed = collapsedBranches.has(branchKey);
                return (
                  <View key={g.key} style={styles.branchBlock}>
                    <Pressable
                      style={styles.branchHead}
                      onPress={() => toggleBranch(branchKey)}
                      hitSlop={4}
                    >
                      <Chevron open={!branchCollapsed} size="small" />
                      <Text style={styles.branchGlyph}>⑂</Text>
                      <Text style={styles.branchLabel} numberOfLines={1}>{g.label}</Text>
                      <Text style={styles.branchCount}>{g.sessions.length}</Text>
                    </Pressable>
                    {!branchCollapsed && (
                      <View style={styles.sessionList}>
                        {g.sessions.map((s) => (
                          <SessionRow
                            key={s.id}
                            session={s}
                            reopening={reopeningId === s.id}
                            onPress={() => handleTapSession(s)}
                          />
                        ))}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          );
        })}

        {snapshot && snapshot.sessions.length === 0 && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No sessions yet.</Text>
            <Text style={styles.emptySub}>Start one on your desktop to see it here.</Text>
          </View>
        )}

        {recents.length > 0 && (
          <View style={styles.recentSection}>
            <Text style={styles.recentSectionLabel}>Recent</Text>
            {recents.slice(0, 8).map((r) => (
              <View key={r.path} style={styles.recentRow}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.recentName} numberOfLines={1}>{r.name}</Text>
                  <Text style={styles.recentPath} numberOfLines={1}>{shortPath(r.path)}</Text>
                </View>
                <Text style={styles.recentTime}>{timeAgo(r.lastOpened)}</Text>
              </View>
            ))}
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

function Chevron({ open, size = 'normal' }) {
  const s = size === 'small' ? 13 : 15;
  return (
    <View style={{ width: s + 6, alignItems: 'center', justifyContent: 'center' }}>
      <Text
        style={{
          color: '#a1a1aa',
          fontSize: s,
          fontFamily: geist.regular,
          transform: [{ rotate: open ? '90deg' : '0deg' }],
        }}
      >
        ›
      </Text>
    </View>
  );
}

function SessionRow({ session, reopening, onPress }) {
  const kind = session.closed ? 'closed' : (session.status || 'idle');
  const dotColor = session.closed ? '#3a3a40' : STATUS_COLOR[kind === 'closed' ? 'done' : kind];
  return (
    <Pressable
      style={({ pressed }) => [
        styles.sessionRow,
        session.closed && !reopening && { opacity: 0.55 },
        pressed && { backgroundColor: '#18181b' },
      ]}
      onPress={onPress}
      disabled={reopening}
      hitSlop={4}
    >
      <View style={[styles.sessionDot, { backgroundColor: dotColor }]} />
      <Text style={styles.sessionName} numberOfLines={1}>
        {session.name}
      </Text>
      {session.agent ? (
        <Text style={styles.sessionAgent} numberOfLines={1}>{session.agent}</Text>
      ) : null}
      {session.queueLength > 0 ? (
        <Text style={styles.sessionMeta}>{session.queueLength}q</Text>
      ) : null}
      {session.needsPermission ? (
        <View style={styles.approvalDot} />
      ) : null}
      {reopening ? (
        <ActivityIndicator size="small" color="#a1a1aa" style={{ marginLeft: 6 }} />
      ) : null}
    </Pressable>
  );
}

// Rendered when the protocol handshake fails. Side is 'desktop' (Tempest on
// the laptop is behind) or 'mobile' (this app is behind). GitHub Releases is
// the shipping channel for the desktop app; the mobile update path is
// TestFlight/App Store depending on the build the user has installed — we
// keep the copy generic ("Update Tempest Mobile") so it works in both.
function ProtocolBlockScreen({ block, pairingName, onUnpair, onBack }) {
  const desktopBehind = block.side === 'desktop';
  const title = desktopBehind ? 'Update Tempest' : 'Update Tempest Mobile';
  const body = desktopBehind
    ? `The desktop at ${pairingName || 'this pairing'} is running protocol v${block.have}; this app needs v${block.need}. Update Tempest on the laptop, then re-pair.`
    : `This app is running protocol v${block.have}; the desktop needs v${block.need}. Update Tempest Mobile from the App Store, then re-pair.`;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#09090b' }}>
      <StatusBar style="light" />
      <View style={styles.topbar}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={12}>
            <Text style={styles.back}>‹ Desktops</Text>
          </Pressable>
        ) : <View />}
        <View />
      </View>
      <View style={blockStyles.body}>
        <Text style={blockStyles.title}>{title}</Text>
        <Text style={blockStyles.copy}>{body}</Text>
        {desktopBehind ? (
          <Pressable
            style={blockStyles.linkBtn}
            onPress={() => Linking.openURL('https://github.com/tempestai-dev/tempest/releases')}
          >
            <Text style={blockStyles.linkBtnText}>Open GitHub Releases</Text>
          </Pressable>
        ) : null}
        {onUnpair ? (
          <Pressable style={blockStyles.forgetBtn} onPress={onUnpair}>
            <Text style={blockStyles.forgetBtnText}>Forget this desktop</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const blockStyles = StyleSheet.create({
  body: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 16,
  },
  title: { color: '#fafafa', fontSize: 24, fontFamily: geist.semibold, textAlign: 'center' },
  copy:  { color: '#a1a1aa', fontSize: 15, fontFamily: geist.regular, textAlign: 'center', lineHeight: 22 },
  linkBtn: {
    marginTop: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10,
    backgroundColor: '#ffffff',
  },
  linkBtnText: { color: '#0c0d10', fontSize: 15, fontFamily: geist.semibold },
  forgetBtn: {
    marginTop: 4, paddingVertical: 10, paddingHorizontal: 16,
  },
  forgetBtnText: { color: '#71717a', fontSize: 13, fontFamily: geist.medium },
});

// shadcn-dark palette
// bg #09090b · card #0f0f11 · border #27272a · fg #fafafa · muted-fg #a1a1aa · dim #71717a
const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  back: { color: '#e4e4e7', fontSize: 17, fontFamily: geist.regular },
  connBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 7, paddingHorizontal: 13,
    borderRadius: 999, backgroundColor: '#18181b',
    borderWidth: 1, borderColor: '#27272a',
  },
  connDot: { width: 7, height: 7, borderRadius: 3.5 },
  connText: { color: '#e4e4e7', fontSize: 13, fontFamily: geist.medium, letterSpacing: 0.3 },

  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 20 },
  hostName: { color: '#fafafa', fontSize: 26, fontFamily: geist.semibold, letterSpacing: -0.5 },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    marginTop: 10, gap: 8,
  },
  fpText: { color: '#71717a', fontSize: 13, fontFamily: geist.medium, letterSpacing: 0.4 },
  metaDot: { color: '#3f3f46', fontSize: 13 },
  metaCount: { color: '#a1a1aa', fontSize: 13, fontFamily: geist.regular, letterSpacing: 0.1 },

  list: { paddingBottom: 32, paddingHorizontal: 16, gap: 12 },

  projectCard: {
    backgroundColor: '#0f0f11',
    borderWidth: 1, borderColor: '#27272a',
    borderRadius: 14,
    paddingVertical: 6, paddingHorizontal: 6,
  },
  projectHead: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 14, paddingHorizontal: 10,
  },
  projectName: { color: '#fafafa', fontSize: 18, fontFamily: geist.semibold, letterSpacing: -0.3 },
  projectPath: { color: '#71717a', fontSize: 14, fontFamily: geist.regular, marginTop: 3, letterSpacing: 0.1 },
  countPill: {
    minWidth: 28, paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: 999, backgroundColor: '#18181b',
    borderWidth: 1, borderColor: '#27272a',
    alignItems: 'center', justifyContent: 'center',
  },
  countPillText: {
    color: '#a1a1aa', fontSize: 12, fontFamily: geist.medium, letterSpacing: 0.3,
  },

  branchBlock: {
    marginTop: 4, paddingLeft: 14, paddingTop: 6,
    borderTopWidth: 1, borderTopColor: '#1c1c1f',
  },
  branchHead: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, paddingHorizontal: 8,
  },
  branchGlyph: { color: '#8ab4f8', fontSize: 15, fontFamily: geist.regular },
  branchLabel: {
    color: '#e4e4e7', fontSize: 17, fontFamily: geist.medium, letterSpacing: 0,
    lineHeight: 22, flex: 1,
  },
  branchCount: { color: '#71717a', fontSize: 14, fontFamily: geist.medium, letterSpacing: 0.2 },

  sessionList: { paddingLeft: 30, paddingBottom: 8, gap: 4 },
  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, paddingHorizontal: 10,
    borderRadius: 8,
  },
  sessionDot: { width: 8, height: 8, borderRadius: 4 },
  sessionName: {
    color: '#fafafa', fontSize: 16, fontFamily: geist.regular, letterSpacing: 0,
    lineHeight: 22, flexShrink: 1,
  },
  sessionAgent: {
    color: '#8ab4f8', fontSize: 12, fontFamily: geist.medium, letterSpacing: 0.3,
    marginLeft: 'auto',
  },
  sessionMeta: {
    color: '#a1a1aa', fontSize: 12, fontFamily: geist.medium, letterSpacing: 0.2,
  },
  approvalDot: {
    width: 8, height: 8, borderRadius: 4, backgroundColor: '#e0c46c',
  },

  recentSection: {
    marginTop: 20, marginHorizontal: 16, paddingTop: 20,
    borderTopWidth: 1, borderTopColor: '#1c1c1f',
  },
  recentSectionLabel: {
    color: '#71717a', fontSize: 12, fontFamily: geist.medium,
    letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 12,
    paddingHorizontal: 4,
  },
  recentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 12, paddingHorizontal: 6,
  },
  recentName: { color: '#e4e4e7', fontSize: 15, fontFamily: geist.regular },
  recentPath: { color: '#71717a', fontSize: 12, fontFamily: geist.regular, marginTop: 3 },
  recentTime: { color: '#71717a', fontSize: 12, fontFamily: geist.regular },

  loading: { alignItems: 'center', paddingTop: 48, gap: 12 },
  loadingText: { color: '#a1a1aa', fontSize: 14, fontFamily: geist.regular },

  empty: { alignItems: 'center', paddingTop: 72, gap: 8 },
  emptyText: { color: '#e4e4e7', fontSize: 17, fontFamily: geist.medium },
  emptySub: { color: '#a1a1aa', fontSize: 14, fontFamily: geist.regular },

  errorBanner: {
    marginHorizontal: 16, marginBottom: 12, padding: 14, borderRadius: 10,
    backgroundColor: 'rgba(217,112,112,0.12)',
    borderWidth: 1, borderColor: 'rgba(217,112,112,0.3)',
  },
  errorText: { color: '#f0b0b0', fontSize: 14, fontFamily: geist.regular },

  footer: { paddingHorizontal: 20, paddingBottom: 20, paddingTop: 12 },
  unpairBtn: {
    borderWidth: 1, borderColor: '#27272a', borderRadius: 12,
    paddingVertical: 16, alignItems: 'center', backgroundColor: '#0f0f11',
  },
  unpairText: { color: '#e4e4e7', fontSize: 15, fontFamily: geist.medium, letterSpacing: 0.2 },
});
