import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, SectionList, TextInput,
  RefreshControl, ActivityIndicator, StyleSheet, Linking,
  Animated, Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { TerminalSquare, Bot, Monitor, Menu, Plus, LogOut, Bell, CheckCircle2 } from 'lucide-react-native';
import { startRpcClient } from '../lib/rpc';
import SessionScreen from './SessionScreen';

// Bundled agent SVGs — mirror of desktop's src/assets/agent-icons + the
// runtime-fetched set (amp/fx/grok/hermes/pi). Metro's svg-transformer turns
// each into a react-native-svg component that respects a `color` prop when
// the source uses fill="currentColor".
import AntigravityIcon from '../assets/agent-icons/antigravity.svg';
import ClaudeIcon from '../assets/agent-icons/claude-color.svg';
import ClineIcon from '../assets/agent-icons/cline.svg';
import CodexIcon from '../assets/agent-icons/codex.svg';
import CopilotIcon from '../assets/agent-icons/githubcopilot-color.svg';
import CursorIcon from '../assets/agent-icons/cursor.svg';
import GeminiIcon from '../assets/agent-icons/geminicli-color.svg';
import GooseIcon from '../assets/agent-icons/goose.svg';
import OpencodeIcon from '../assets/agent-icons/opencode.svg';
import AmpIcon from '../assets/agent-icons/amp.svg';
import FxIcon from '../assets/agent-icons/fx.svg';
import GrokIcon from '../assets/agent-icons/grok.svg';
import HermesIcon from '../assets/agent-icons/hermes.svg';
import PiIcon from '../assets/agent-icons/pi.svg';

// Maps the agent id/hint the desktop stamps onto session.agent to its bundled
// icon component. Keys match config/agents.json `icon` fields plus the id
// itself where they diverge — desktop projectSession sends `s.agent` verbatim.
const AGENT_ICONS = {
  agy: AntigravityIcon, antigravity: AntigravityIcon,
  claude: ClaudeIcon,
  cline: ClineIcon,
  codex: CodexIcon,
  copilot: CopilotIcon,
  cursor: CursorIcon,
  gemini: GeminiIcon,
  goose: GooseIcon,
  opencode: OpencodeIcon,
  amp: AmpIcon,
  fx: FxIcon,
  grok: GrokIcon,
  hermes: HermesIcon,
  pi: PiIcon,
};

// Mono-fill agents (desktop config/agents.json `"mono": true`). These SVGs use
// fill="currentColor", so on dark bg we pass a light color; the equivalent of
// the desktop's `[data-theme="dark"] .agent-icon--mono { filter: invert(1); }`.
const MONO_AGENTS = new Set([
  'agy', 'antigravity', 'cline', 'codex', 'cursor', 'goose', 'opencode',
  'amp', 'fx', 'grok', 'hermes', 'pi',
]);

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
  working: '#e0c46c',
  waiting: '#e0c46c',
  done: '#7be495',
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
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  // One flat collapse set keyed by "projectId::branchKey". Sections default expanded.
  const [collapsedSections, setCollapsedSections] = useState(() => new Set());
  const [selectedSessionId, setSelectedSessionId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmUnpair, setConfirmUnpair] = useState(false);
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

  // Manual pull-to-refresh — forces a fresh snapshot after stale-cache reconnects.
  const onRefresh = useCallback(async () => {
    const c = clientRef.current;
    if (!c) return;
    setRefreshing(true);
    try {
      const r = await c.request('session.list', {});
      setSnapshot({
        sessions: r?.sessions || [],
        projects: r?.projects || [],
        branches: r?.branches || [],
        recents:  r?.recents  || [],
      });
    } catch (e) {
      setError(e?.message || 'Refresh failed');
    } finally {
      setRefreshing(false);
    }
  }, []);

  const counts = useMemo(() => {
    if (!snapshot) return { active: 0, waiting: 0, idle: 0, inactive: 0, total: 0 };
    let active = 0, waiting = 0, idle = 0, inactive = 0;
    for (const s of snapshot.sessions) {
      if (s.closed) { inactive++; continue; }
      if (s.status === 'waiting') waiting++;
      else if (s.status === 'working') active++;
      else idle++;
    }
    return { active, waiting, idle, inactive, total: snapshot.sessions.length };
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

      for (const wt of worktrees) {
        groups.set(wt.path, { key: wt.path, label: wt.name, isRoot: false, sessions: [] });
      }

      for (const s of (snapshot.sessions || [])) {
        if (s.projectId !== project.id) continue;
        const branchPath = s.branchId ? branchPathById.get(s.branchId) : undefined;
        let key;
        if (branchPath && groups.has(branchPath)) {
          key = branchPath;
        } else if (branchPath) {
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
      for (const g of groups.values()) {
        if (g === root) continue;
        if (worktrees.some((w) => w.path === g.key)) continue;
        ordered.push(g);
      }
      for (const g of ordered) g.sessions.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

      if (ordered.length === 0) continue;
      out.push({ project, groups: ordered });
    }

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

  // Flatten byProject into SectionList sections. Each branch splits into
  // "Agent Sessions" and "Terminals" via divider pseudo-items — mirrors the
  // desktop sidebar (s.agent truthy = agent; else terminal). Search prunes
  // sessions by name and hides fully-empty sections when a query is active.
  const sections = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = [];
    for (const { project, groups } of byProject) {
      for (const g of groups) {
        const key = `${project.id}::${g.key}`;
        const collapsed = collapsedSections.has(key);
        const matched = q
          ? g.sessions.filter((s) => (s.name || '').toLowerCase().includes(q))
          : g.sessions;
        if (q && matched.length === 0) continue;

        const agents = matched.filter((s) => !!s.agent);
        const terminals = matched.filter((s) => !s.agent);
        const data = [];
        if (agents.length > 0) {
          data.push({ __divider: true, id: `${key}::div::agents`, label: 'Agent Sessions' });
          for (const s of agents) data.push(s);
        }
        if (terminals.length > 0) {
          data.push({ __divider: true, id: `${key}::div::terminals`, label: 'Terminals' });
          for (const s of terminals) data.push(s);
        }

        out.push({
          key,
          title: project.name,
          subtitle: g.label,
          isRoot: g.isRoot,
          projectPath: project.path,
          count: g.sessions.length,
          matchedCount: matched.length,
          collapsed,
          data: collapsed ? [] : data,
        });
      }
    }
    return out;
  }, [byProject, collapsedSections, search]);

  const toggleSection = useCallback((key) => setCollapsedSections((prev) => {
    const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n;
  }), []);

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

  // Placeholders — wired later. Long-press should open an action sheet;
  // FAB should launch a "new session" flow.
  const handleLongPressSession = (_s) => {};
  const handleNewSession = () => {};

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

  const topbar = (
    <View style={styles.topbar}>
      <Pressable onPress={onBack} hitSlop={12} disabled={!onBack} style={styles.topbarLeft}>
        <Monitor size={22} color="#e4e4e7" strokeWidth={1.75} />
        <Text style={styles.topbarName} numberOfLines={1} ellipsizeMode="tail">
          {pairing?.name || 'Tempest desktop'}
        </Text>
      </Pressable>
      <View style={styles.connBadge}>
        <View style={[styles.connDot, { backgroundColor: STATE_COLOR[connState] }]} />
        <Text style={styles.connText}>{STATE_LABEL[connState]}</Text>
      </View>
    </View>
  );

  const listHeader = (
    <>
      {topbar}
      <View style={styles.statCards}>
        <StatCard label="Active"   value={counts.active}   dot="#7be495" />
        <StatCard label="Waiting"  value={counts.waiting}  dot="#e0c46c" />
        <StatCard label="Idle"     value={counts.idle}     dot="#5a5a60" />
        <StatCard label="Inactive" value={counts.inactive} dot="#3a3a40" hollow />
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search sessions…"
          placeholderTextColor="#71717a"
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {error && (
        <View style={styles.errorBanner}><Text style={styles.errorText}>{error}</Text></View>
      )}
    </>
  );

  const listFooter = (
    <>
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

      {/* Reserve room so the last session row stays clear of the FAB / floating unpair. */}
      <View style={{ height: 96 }} />
    </>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#09090b' }}>
      <StatusBar style="light" />

      {!snapshot && !error ? (
        <>
          {topbar}
          <View style={styles.loading}>
            <ActivityIndicator size="small" color="#8a8a90" />
            <Text style={styles.loadingText}>Loading sessions…</Text>
          </View>
        </>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          stickySectionHeadersEnabled={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.list}
          ListHeaderComponent={listHeader}
          ListFooterComponent={listFooter}
          ListEmptyComponent={
            snapshot && snapshot.sessions.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No sessions yet.</Text>
                <Text style={styles.emptySub}>Start one on your desktop to see it here.</Text>
              </View>
            ) : search.trim() ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No matches for “{search.trim()}”.</Text>
              </View>
            ) : null
          }
          renderSectionHeader={({ section }) => (
            <SectionHeader section={section} onToggle={() => toggleSection(section.key)} />
          )}
          renderItem={({ item }) => (
            item.__divider ? (
              <KindDivider label={item.label} />
            ) : (
              <SessionRow
                session={item}
                reopening={reopeningId === item.id}
                onPress={() => handleTapSession(item)}
                onLongPress={() => handleLongPressSession(item)}
              />
            )
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#8a8a90"
              colors={['#8a8a90']}
            />
          }
        />
      )}

      <Fab onPress={() => setMenuOpen(true)} />

      {menuOpen && (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuCard}>
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => { setMenuOpen(false); handleNewSession(); }}
            >
              <Plus size={16} color="#e4e4e7" strokeWidth={1.75} />
              <Text style={styles.menuItemText}>New session</Text>
            </Pressable>
            <View style={styles.menuDivider} />
            <Pressable
              style={({ pressed }) => [styles.menuItem, pressed && styles.menuItemPressed]}
              onPress={() => { setMenuOpen(false); setConfirmUnpair(true); }}
            >
              <LogOut size={16} color="#f0b0b0" strokeWidth={1.75} />
              <Text style={[styles.menuItemText, { color: '#f0b0b0' }]}>Unpair desktop</Text>
            </Pressable>
          </View>
        </>
      )}

      {confirmUnpair && (
        <>
          <Pressable style={styles.menuBackdrop} onPress={() => setConfirmUnpair(false)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>Unpair this desktop?</Text>
            <Text style={styles.confirmBody}>
              You'll need to re-pair {pairing?.name || 'this desktop'} by scanning its QR again.
            </Text>
            <View style={styles.confirmActions}>
              <Pressable
                style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnGhost, pressed && { opacity: 0.7 }]}
                onPress={() => setConfirmUnpair(false)}
              >
                <Text style={styles.confirmBtnGhostText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.confirmBtn, styles.confirmBtnDanger, pressed && { opacity: 0.85 }]}
                onPress={() => { setConfirmUnpair(false); onUnpair?.(); }}
              >
                <Text style={styles.confirmBtnDangerText}>Unpair</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}
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

function SectionHeader({ section, onToggle }) {
  return (
    <Pressable style={styles.sectionHeader} onPress={onToggle} hitSlop={4}>
      <Chevron open={!section.collapsed} size="small" />
      <Text style={styles.sectionTitle} numberOfLines={1}>{section.title}</Text>
      {!section.isRoot && (
        <>
          <Text style={styles.sectionSep}>·</Text>
          <Text style={styles.sectionBranch} numberOfLines={1}>{section.subtitle}</Text>
        </>
      )}
      <Text style={styles.sectionCount}>{section.count}</Text>
    </Pressable>
  );
}

// Spinning ring for status=working. Uses RN Animated — no new deps.
function WorkingRing({ color }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(spin, {
        toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View
      style={{
        width: 10, height: 10, borderRadius: 5,
        borderWidth: 2, borderColor: color, borderTopColor: 'transparent',
        transform: [{ rotate }],
      }}
    />
  );
}

// Mirror desktop's SessionBadges: attention (waiting/needsPermission) → bell,
// working → spinner, done → green check, idle → nothing. Closed ghosts keep
// the hollow ring so a stopped session is still legible in the list.
function StatusGlyph({ session }) {
  if (session.closed) {
    return <View style={[styles.dot, { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#3a3a40' }]} />;
  }
  if (session.needsPermission || session.status === 'waiting') {
    return <Bell size={13} color={STATUS_COLOR.waiting} strokeWidth={2} />;
  }
  if (session.status === 'working') {
    return <WorkingRing color={STATUS_COLOR.working} />;
  }
  if (session.status === 'done') {
    return <CheckCircle2 size={14} color={STATUS_COLOR.done} strokeWidth={2} />;
  }
  return null;
}

function SessionIcon({ session, size = 16 }) {
  if (!session.agent) {
    return <TerminalSquare size={size} color="#a1a1aa" strokeWidth={1.75} />;
  }
  const key = session.agent.toLowerCase();
  const Svg = AGENT_ICONS[key];
  if (Svg) {
    // Mono icons render via fill="currentColor" — pass the theme's fg so they
    // don't come out solid black on the dark app background.
    const props = MONO_AGENTS.has(key)
      ? { width: size, height: size, color: '#fafafa' }
      : { width: size, height: size };
    return <Svg {...props} />;
  }
  return <Bot size={size} color="#a1a1aa" strokeWidth={1.75} />;
}

function KindDivider({ label }) {
  return (
    <View style={styles.kindDivider}>
      <Text style={styles.kindDividerText}>{label}</Text>
    </View>
  );
}

function SessionRow({ session, reopening, onPress, onLongPress }) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.sessionRow,
        pressed && { backgroundColor: '#18181b' },
      ]}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      disabled={reopening}
      hitSlop={4}
    >
      <View style={styles.sessionIcon}>
        <SessionIcon session={session} />
      </View>
      <Text style={styles.sessionName} numberOfLines={1}>
        {session.name}
      </Text>
      {session.queueLength > 0 ? (
        <Text style={styles.sessionMeta}>{session.queueLength} queued</Text>
      ) : null}
      <View style={styles.statusSlot}>
        <StatusGlyph session={session} />
      </View>
      {session.createdAt ? (
        <Text style={styles.sessionMeta}>{timeAgo(session.createdAt)}</Text>
      ) : null}
      {reopening ? <ActivityIndicator size="small" color="#a1a1aa" /> : null}
    </Pressable>
  );
}

function StatCard({ label, value, dot, hollow }) {
  return (
    <View style={styles.statCard}>
      <View style={styles.statCardTop}>
        <View
          style={[
            styles.statDot,
            hollow
              ? { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: dot }
              : { backgroundColor: dot },
          ]}
        />
        <Text style={styles.statValue}>{value}</Text>
      </View>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Fab({ onPress }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}
      onPress={onPress}
      hitSlop={8}
    >
      <Menu size={24} color="#09090b" strokeWidth={2.25} />
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
            <Monitor size={22} color="#e4e4e7" strokeWidth={1.75} />
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

// shadcn-dark palette (skeleton — visual pass is Tempest's job, not orca's)
// bg #09090b · card #0f0f11 · border #27272a · fg #fafafa · muted-fg #a1a1aa · dim #71717a
const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  back: { color: '#e4e4e7', fontSize: 17, fontFamily: geist.regular },
  topbarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  topbarName: {
    color: '#e4e4e7', fontSize: 17, fontFamily: geist.medium,
    maxWidth: 180, flexShrink: 1,
  },
  connBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingVertical: 7, paddingHorizontal: 13,
    borderRadius: 999, backgroundColor: '#18181b',
    borderWidth: 1, borderColor: '#27272a',
  },
  connDot: { width: 7, height: 7, borderRadius: 3.5 },
  connText: { color: '#e4e4e7', fontSize: 13, fontFamily: geist.medium, letterSpacing: 0.3 },

  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  hostName: { color: '#fafafa', fontSize: 26, fontFamily: geist.semibold, letterSpacing: -0.5 },
  metaRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    marginTop: 8, gap: 8,
  },
  fpText: { color: '#71717a', fontSize: 13, fontFamily: geist.medium, letterSpacing: 0.4 },
  metaDot: { color: '#3f3f46', fontSize: 13 },
  metaCount: { color: '#a1a1aa', fontSize: 13, fontFamily: geist.regular, letterSpacing: 0.1 },

  statCards: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12,
  },
  statCard: {
    flex: 1,
    paddingVertical: 10, paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#0f0f11',
    borderWidth: 1, borderColor: '#27272a',
    gap: 6,
  },
  statCardTop: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  statDot: { width: 8, height: 8, borderRadius: 4 },
  statValue: { color: '#fafafa', fontSize: 18, fontFamily: geist.semibold, letterSpacing: -0.3 },
  statLabel: {
    color: '#71717a', fontSize: 11, fontFamily: geist.medium,
    letterSpacing: 0.3,
  },

  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  searchInput: {
    height: 40, borderRadius: 10, paddingHorizontal: 14,
    backgroundColor: '#18181b',
    borderWidth: 1, borderColor: '#27272a',
    color: '#fafafa', fontSize: 14, fontFamily: geist.regular,
  },

  list: { paddingBottom: 32 },

  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 20, paddingVertical: 10,
    marginTop: 8,
  },
  sectionTitle: { color: '#e4e4e7', fontSize: 17, fontFamily: geist.regular, letterSpacing: 0 },
  sectionSep: { color: '#3f3f46', fontSize: 13 },
  sectionBranch: {
    color: '#a1a1aa', fontSize: 12, fontFamily: geist.medium, letterSpacing: 0.2,
    flexShrink: 1,
  },
  sectionCount: {
    marginLeft: 'auto',
    color: '#71717a', fontSize: 12, fontFamily: geist.medium, letterSpacing: 0.3,
  },

  sessionRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 18, paddingLeft: 40, paddingRight: 20,
    gap: 10,
  },
  sessionIcon: { width: 18, alignItems: 'center', justifyContent: 'center' },
  sessionName: {
    color: '#fafafa', fontSize: 13, fontFamily: geist.medium, letterSpacing: 0,
    lineHeight: 18, flex: 1, flexShrink: 1,
  },
  sessionMeta: {
    color: '#a1a1aa', fontSize: 12, fontFamily: geist.regular, letterSpacing: 0.1,
  },
  approvalDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#e0c46c' },
  statusSlot: { width: 16, alignItems: 'center', justifyContent: 'center' },

  kindDivider: {
    paddingLeft: 40, paddingRight: 20,
    paddingTop: 12, paddingBottom: 4,
  },
  kindDividerText: {
    color: '#71717a', fontSize: 11, fontFamily: geist.medium,
    letterSpacing: 1.2, textTransform: 'uppercase',
  },

  recentSection: {
    marginTop: 24, marginHorizontal: 20, paddingTop: 16,
    borderTopWidth: 1, borderTopColor: '#1c1c1f',
  },
  recentSectionLabel: {
    color: '#71717a', fontSize: 11, fontFamily: geist.medium,
    letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 8,
  },
  recentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 10,
  },
  recentName: { color: '#e4e4e7', fontSize: 14, fontFamily: geist.regular },
  recentPath: { color: '#71717a', fontSize: 12, fontFamily: geist.regular, marginTop: 2 },
  recentTime: { color: '#71717a', fontSize: 12, fontFamily: geist.regular },

  loading: { alignItems: 'center', paddingTop: 48, gap: 12 },
  loadingText: { color: '#a1a1aa', fontSize: 14, fontFamily: geist.regular },

  empty: { alignItems: 'center', paddingTop: 72, gap: 8, paddingHorizontal: 32 },
  emptyText: { color: '#e4e4e7', fontSize: 16, fontFamily: geist.medium, textAlign: 'center' },
  emptySub: { color: '#a1a1aa', fontSize: 13, fontFamily: geist.regular, textAlign: 'center' },

  errorBanner: {
    marginHorizontal: 16, marginBottom: 8, padding: 14, borderRadius: 10,
    backgroundColor: 'rgba(217,112,112,0.12)',
    borderWidth: 1, borderColor: 'rgba(217,112,112,0.3)',
  },
  errorText: { color: '#f0b0b0', fontSize: 14, fontFamily: geist.regular },

  menuBackdrop: {
    position: 'absolute', top: 0, right: 0, bottom: 0, left: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  menuCard: {
    position: 'absolute', right: 20, bottom: 96,
    minWidth: 200,
    backgroundColor: '#0f0f11',
    borderWidth: 1, borderColor: '#27272a',
    borderRadius: 12,
    paddingVertical: 6,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  menuItemPressed: { backgroundColor: '#18181b' },
  menuItemText: { color: '#e4e4e7', fontSize: 14, fontFamily: geist.medium },
  menuDivider: { height: 1, backgroundColor: '#27272a', marginHorizontal: 6, marginVertical: 4 },

  confirmCard: {
    position: 'absolute', left: 24, right: 24, top: '35%',
    backgroundColor: '#0f0f11',
    borderWidth: 1, borderColor: '#27272a',
    borderRadius: 14,
    padding: 20,
    gap: 12,
    shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  confirmTitle: { color: '#fafafa', fontSize: 17, fontFamily: geist.semibold, letterSpacing: -0.2 },
  confirmBody:  { color: '#a1a1aa', fontSize: 14, fontFamily: geist.regular, lineHeight: 20 },
  confirmActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  confirmBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8 },
  confirmBtnGhost: { backgroundColor: '#18181b', borderWidth: 1, borderColor: '#27272a' },
  confirmBtnGhostText: { color: '#e4e4e7', fontSize: 14, fontFamily: geist.medium },
  confirmBtnDanger: { backgroundColor: '#7a2a2a' },
  confirmBtnDangerText: { color: '#fafafa', fontSize: 14, fontFamily: geist.semibold },

  fab: {
    position: 'absolute', right: 20, bottom: 28,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#fafafa',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabPlus: { color: '#09090b', fontSize: 28, fontFamily: geist.medium, marginTop: -2 },
});
