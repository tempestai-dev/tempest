import { useRef, useState, useEffect, useSyncExternalStore } from "react";
import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { UiIcon } from "../icons/UiIcon";
const Bell = (p: any) => <UiIcon name="bell" {...p} />;
const BellOff = (p: any) => <UiIcon name="bell-off" {...p} />;
const Play = (p: any) => <UiIcon name="play" {...p} />;
const ShieldAlert = (p: any) => <UiIcon name="shield-alert" {...p} />;
const CheckCircle2 = (p: any) => <UiIcon name="check-circle-2" {...p} />;
const ChevronLeft = (p: any) => <UiIcon name="chevron-left" {...p} />;
const ChevronRight = (p: any) => <UiIcon name="chevron-right" {...p} />;
const Pause = (p: any) => <UiIcon name="pause" {...p} />;
const X = (p: any) => <UiIcon name="x" {...p} />;
import "./DynamicIsland.css";
import {
  subscribeIslandNotifs, getIslandNotifs, dismissIslandNotif, requestIslandFocus, type IslandNotif,
} from "../store/islandNotifs";
import { getAgent } from "../lib/agentRegistry";

type Phase      = "idle" | "active" | "hovered";
type TimerState = "off" | "working" | "resting";

const W_IDLE           = 56;
const W_ACTIVE         = 224;
const W_ACTIVE_MUTED   = 148;
const W_HOVER          = 320;
const H_ACTIVE         = 28;
const H_LIST           = 200;
const H_DETAIL         = 172;
const H_TIMER          = 96;
const H_ITEM           = 22;
const OVERSHOOT        = 16;
const CYCLE_MS         = 2400;
const PEEK_MS          = 3000;
const PEEK_INTERVAL_MS = 8000;

// `.bar .island-root svg { width: unset }` resolves to `auto`, which sizes every
// lucide icon at its ~150px intrinsic default. Inline width/height beats it.
const ico = (n: number): React.CSSProperties => ({ width: n, height: n, flexShrink: 0 });

function fmtTime(s: number) {
  return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
}

function TimerArc({ progress, color }: { progress: number; color: string }) {
  const r = 9; const circ = 2 * Math.PI * r;
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" style={ico(24)}>
      <circle cx={12} cy={12} r={r} strokeWidth={2.5}
        style={{ stroke: "var(--tempest-border-default)" }} />
      <circle cx={12} cy={12} r={r} strokeWidth={2.5} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ * (1 - Math.min(progress, 1))}
        transform="rotate(-90 12 12)"
        style={{ stroke: color }} />
    </svg>
  );
}

export function DynamicIsland() {
  const root           = useRef<HTMLDivElement>(null);
  const pill           = useRef<HTMLDivElement>(null);
  const compactLayer   = useRef<HTMLDivElement>(null);
  const expandedLayer  = useRef<HTMLDivElement>(null);
  const ticker         = useRef<HTMLSpanElement>(null);
  const bellNormalRef  = useRef<HTMLDivElement>(null);
  const bellMutedRef   = useRef<HTMLSpanElement>(null);
  const normalRightRef = useRef<HTMLDivElement>(null);
  const silentRef      = useRef<HTMLSpanElement>(null);

  const phaseRef        = useRef<Phase>("idle");
  const mutedRef        = useRef(false);
  const isListViewRef   = useRef(true);
  const timerStateRef   = useRef<TimerState>("off");
  const timerPausedRef  = useRef(false);
  const notifCompactRef = useRef<HTMLDivElement>(null);
  const timerCompactRef = useRef<HTMLDivElement>(null);
  const muteTimelineRef = useRef<gsap.core.Timeline | null>(null);

  // Live notification feed
  const notifs    = useSyncExternalStore(subscribeIslandNotifs, getIslandNotifs);
  const notifsRef = useRef(notifs);
  useEffect(() => { notifsRef.current = notifs; }, [notifs]);

  // User-configurable break timer durations (persisted)
  const [workMins, setWorkMins] = useState(() => {
    const v = localStorage.getItem("tempest-timer-work-mins");
    return v ? Math.max(1, parseInt(v, 10)) : 1;
  });
  const [restMins, setRestMins] = useState(() => {
    const v = localStorage.getItem("tempest-timer-rest-mins");
    return v ? Math.max(1, parseInt(v, 10)) : 1;
  });
  const workSecs = workMins * 60;
  const restSecs = restMins * 60;
  useEffect(() => { localStorage.setItem("tempest-timer-work-mins", String(workMins)); }, [workMins]);
  useEffect(() => { localStorage.setItem("tempest-timer-rest-mins", String(restMins)); }, [restMins]);

  const [phase,        setPhase]        = useState<Phase>("idle");
  const [notif,        setNotif]        = useState<IslandNotif | null>(null);
  const [tickerText,   setTickerText]   = useState("New");
  const [isListView,   setIsListView]   = useState(true);
  const [hoveredRow,   setHoveredRow]   = useState<string | null>(null);
  const [timerState,   setTimerState]   = useState<TimerState>("off");
  const [timerElapsed, setTimerElapsed] = useState(0);
  const [restElapsed,  setRestElapsed]  = useState(0);
  const [timerPaused,  setTimerPaused]  = useState(false);
  const [timerNotif,   setTimerNotif]   = useState<IslandNotif | null>(null);
  const [muted,        setMuted]        = useState(false);
  const [timerShowList,setTimerShowList]= useState(false);

  function syncPhase(p: Phase)      { phaseRef.current = p; setPhase(p); }
  function syncListView(v: boolean) { isListViewRef.current = v; setIsListView(v); }

  const { contextSafe } = useGSAP(() => {
    gsap.set(pill.current,           { width: W_IDLE, height: H_ACTIVE, xPercent: -50 });
    gsap.set(compactLayer.current,   { autoAlpha: 0 });
    gsap.set(expandedLayer.current,  { autoAlpha: 0 });
    gsap.set(ticker.current,         { y: 0, autoAlpha: 1 });
    gsap.set(bellMutedRef.current,   { opacity: 0, clipPath: "inset(0 100% 0 0 round 999px)" });
    gsap.set(silentRef.current,      { opacity: 0, y: 8 });
    gsap.set(notifCompactRef.current, { opacity: 1 });
    gsap.set(timerCompactRef.current, { opacity: 0 });
  }, { scope: root });

  const toActive = contextSafe(() => {
    if (phaseRef.current !== "idle") return;
    setTickerText("New"); setNotif(notifsRef.current[0] ?? null); syncListView(true);
    gsap.set(ticker.current, { y: 0, autoAlpha: 1 });
    syncPhase("active");
    gsap.timeline()
      .to(pill.current, { width: W_ACTIVE + OVERSHOOT, height: H_ACTIVE, duration: 0.38, ease: "power3.out" })
      .to(pill.current, { width: W_ACTIVE, duration: 0.9, ease: "elastic.out(1, 0.4)" })
      .to(compactLayer.current, { autoAlpha: 1, duration: 0.22, ease: "power2.out" }, "-=0.7");
  });

  const toIdle = contextSafe(() => {
    syncPhase("idle");
    gsap.timeline()
      .to([compactLayer.current, expandedLayer.current], { autoAlpha: 0, duration: 0.15 })
      .to(pill.current, { width: W_IDLE, height: H_ACTIVE, borderRadius: 32, duration: 0.35, ease: "power3.inOut" });
  });

  const doHover = contextSafe(() => {
    if (phaseRef.current !== "active") return;
    if (mutedRef.current && timerStateRef.current === "off") return;
    if (muteTimelineRef.current) {
      muteTimelineRef.current.kill();
      muteTimelineRef.current = null;
      mutedRef.current = false;
      setMuted(false);
      gsap.set(notifCompactRef.current,  { opacity: 0 });
      gsap.set(timerCompactRef.current,  { opacity: 1 });
      gsap.set(pill.current,             { width: W_ACTIVE });
      gsap.set(bellNormalRef.current,    { x: 0, opacity: 1 });
      gsap.set(bellMutedRef.current,     { opacity: 0, clipPath: "inset(0 100% 0 0 round 999px)" });
      gsap.set(normalRightRef.current,   { y: 0, opacity: 1 });
      gsap.set(silentRef.current,        { y: 8, opacity: 0 });
    }
    gsap.killTweensOf(pill.current);
    syncPhase("hovered");
    const targetH = timerStateRef.current !== "off"
      ? H_TIMER
      : isListViewRef.current ? H_LIST : H_DETAIL;
    gsap.timeline()
      .to(compactLayer.current, { autoAlpha: 0, duration: 0.12 })
      .to(pill.current, { width: W_HOVER, height: targetH, borderRadius: 18, duration: 0.42, ease: "power3.out" }, "-=0.05")
      .to(expandedLayer.current, { autoAlpha: 1, duration: 0.22, ease: "power2.out" }, "-=0.18");
  });

  const doUnhover = contextSafe(() => {
    if (phaseRef.current !== "hovered") return;
    syncListView(true);
    setTimerShowList(false);
    gsap.killTweensOf(pill.current);
    syncPhase("active");
    gsap.timeline()
      .to(expandedLayer.current, { autoAlpha: 0, duration: 0.12 })
      .to(pill.current, { width: W_ACTIVE, height: H_ACTIVE, borderRadius: 32, duration: 0.38, ease: "power3.inOut" }, "-=0.05")
      .to(compactLayer.current, { autoAlpha: 1, duration: 0.2 }, "-=0.15");
  });

  const toDetail = contextSafe((n: IslandNotif) => {
    if (phaseRef.current !== "hovered") return;
    setNotif(n); syncListView(false);
    gsap.to(pill.current, { height: H_DETAIL, duration: 0.25, ease: "power2.out" });
  });

  const toListView = contextSafe(() => {
    if (phaseRef.current !== "hovered") return;
    syncListView(true);
    gsap.to(pill.current, { height: H_LIST, duration: 0.25, ease: "power2.out" });
  });

  const tickerTo = contextSafe((text: string, n?: IslandNotif) => {
    gsap.timeline()
      .to(ticker.current, { y: -8, autoAlpha: 0, duration: 0.2, ease: "power2.in" })
      .call(() => { setTickerText(text); if (n) setNotif(n); })
      .set(ticker.current, { y: 8 })
      .to(ticker.current, { y: 0, autoAlpha: 1, duration: 0.25, ease: "power2.out" });
  });

  const toMuted = contextSafe(() => {
    if (mutedRef.current) return;
    mutedRef.current = true;
    setMuted(true);
    gsap.killTweensOf([bellNormalRef.current, bellMutedRef.current, normalRightRef.current, silentRef.current]);
    if (timerStateRef.current !== "off") {
      if (muteTimelineRef.current) muteTimelineRef.current.kill();
      gsap.set(bellNormalRef.current,  { x: 0, opacity: 1 });
      gsap.set(bellMutedRef.current,   { opacity: 0, clipPath: "inset(0 100% 0 0 round 999px)" });
      gsap.set(normalRightRef.current, { y: 0, opacity: 1 });
      gsap.set(silentRef.current,      { y: 8, opacity: 0 });
      muteTimelineRef.current = gsap.timeline()
        .to(timerCompactRef.current,   { opacity: 0, duration: 0.12 })
        .to(notifCompactRef.current,   { opacity: 1, duration: 0.12 }, "<")
        .to(bellNormalRef.current,     { x: -3, duration: 0.07, ease: "power2.out" })
        .to(bellNormalRef.current,     { x:  3, duration: 0.07 })
        .to(bellNormalRef.current,     { x: -2, duration: 0.07 })
        .to(bellNormalRef.current,     { x:  0, duration: 0.07 })
        .to(bellNormalRef.current,     { opacity: 0, duration: 0.18 }, "+=0")
        .to(pill.current,              { width: W_ACTIVE_MUTED, duration: 0.35, ease: "power3.inOut" }, "<")
        .to(bellMutedRef.current,      { opacity: 1, clipPath: "inset(0 0% 0 0 round 999px)", duration: 0.28, ease: "power2.out" }, "<")
        .to(normalRightRef.current,    { y: -8, opacity: 0, duration: 0.2, ease: "power2.in" }, "<")
        .set(silentRef.current,        { y: 8, opacity: 0 })
        .to(silentRef.current,         { y: 0, opacity: 1, duration: 0.25, ease: "power2.out" }, "-=0.05")
        .to(notifCompactRef.current,   { opacity: 0, duration: 0.2, delay: 2.5 })
        .to(timerCompactRef.current,   { opacity: 1, duration: 0.2 }, "<")
        .to(pill.current,              { width: W_ACTIVE, duration: 0.25, ease: "power3.inOut" }, "<")
        .set(bellNormalRef.current,    { x: 0, opacity: 1 })
        .set(bellMutedRef.current,     { opacity: 0, clipPath: "inset(0 100% 0 0 round 999px)" })
        .set(normalRightRef.current,   { y: 0, opacity: 1 })
        .set(silentRef.current,        { y: 8, opacity: 0 })
        .call(() => { mutedRef.current = false; setMuted(false); muteTimelineRef.current = null; });
      return;
    }
    if (phaseRef.current === "hovered") {
      gsap.set(expandedLayer.current, { autoAlpha: 0 });
      gsap.set(compactLayer.current,  { autoAlpha: 1 });
      gsap.set(pill.current,          { borderRadius: 32, height: H_ACTIVE });
    }
    syncPhase("active");
    gsap.timeline()
      .to(bellNormalRef.current,  { x: -3, duration: 0.07, ease: "power2.out" })
      .to(bellNormalRef.current,  { x:  3, duration: 0.07 })
      .to(bellNormalRef.current,  { x: -2, duration: 0.07 })
      .to(bellNormalRef.current,  { x:  0, duration: 0.07 })
      .to(bellNormalRef.current,  { opacity: 0, duration: 0.18 }, "+=0")
      .to(pill.current,           { width: W_ACTIVE_MUTED, duration: 0.35, ease: "power3.inOut" }, "<")
      .to(bellMutedRef.current,   { opacity: 1, clipPath: "inset(0 0% 0 0 round 999px)", duration: 0.28, ease: "power2.out" }, "<")
      .to(normalRightRef.current, { y: -8, opacity: 0, duration: 0.2, ease: "power2.in" }, "<")
      .set(silentRef.current,     { y: 8, opacity: 0 })
      .to(silentRef.current,      { y: 0, opacity: 1, duration: 0.25, ease: "power2.out" }, "-=0.05");
  });

  const toUnmuted = contextSafe(() => {
    if (!mutedRef.current) return;
    mutedRef.current = false;
    setMuted(false);
    if (timerStateRef.current !== "off") {
      if (muteTimelineRef.current) { muteTimelineRef.current.kill(); muteTimelineRef.current = null; }
      gsap.set(notifCompactRef.current,  { opacity: 0 });
      gsap.set(timerCompactRef.current,  { opacity: 1 });
      gsap.set(pill.current,             { width: W_ACTIVE });
      gsap.set(bellNormalRef.current,    { x: 0, opacity: 1 });
      gsap.set(bellMutedRef.current,     { opacity: 0, clipPath: "inset(0 100% 0 0 round 999px)" });
      gsap.set(normalRightRef.current,   { y: 0, opacity: 1 });
      gsap.set(silentRef.current,        { y: 8, opacity: 0 });
      return;
    }
    gsap.killTweensOf([bellNormalRef.current, bellMutedRef.current, normalRightRef.current, silentRef.current]);
    gsap.timeline()
      .to(silentRef.current,       { y: -8, opacity: 0, duration: 0.2, ease: "power2.in" })
      .set(normalRightRef.current, { y: 8, opacity: 0 })
      .to(normalRightRef.current,  { y: 0, opacity: 1, duration: 0.25, ease: "power2.out" }, "-=0.05")
      .to(bellMutedRef.current,    { opacity: 0, clipPath: "inset(0 100% 0 0 round 999px)", duration: 0.25, ease: "power2.in" }, "<")
      .to(pill.current,            { width: W_ACTIVE, duration: 0.35, ease: "power3.inOut" }, "<")
      .to(bellNormalRef.current,   { x: 0, opacity: 1, duration: 0.2 }, "-=0.1");
  });

  const startTimer = contextSafe(() => {
    if (timerStateRef.current !== "off") return;
    const wasPhase = phaseRef.current;
    timerStateRef.current = "working";
    setTimerState("working");
    gsap.set(notifCompactRef.current, { opacity: 0 });
    gsap.set(timerCompactRef.current, { opacity: 1 });
    setTimerElapsed(0); setRestElapsed(0);
    setTimerPaused(false); timerPausedRef.current = false;
    setTimerNotif(null); setTimerShowList(false); syncListView(true);
    mutedRef.current = false;
    syncPhase("active");

    if (wasPhase === "idle") {
      gsap.timeline()
        .to(pill.current, { width: W_ACTIVE + OVERSHOOT, height: H_ACTIVE, duration: 0.38, ease: "power3.out" })
        .to(pill.current, { width: W_ACTIVE, duration: 0.9, ease: "elastic.out(1, 0.4)" })
        .to(compactLayer.current, { autoAlpha: 1, duration: 0.22, ease: "power2.out" }, "-=0.7");
    } else if (wasPhase === "hovered") {
      gsap.timeline()
        .to(expandedLayer.current, { autoAlpha: 0, duration: 0.12 })
        .to(pill.current, { width: W_ACTIVE, height: H_ACTIVE, borderRadius: 32, duration: 0.38, ease: "power3.inOut" }, "-=0.05")
        .to(compactLayer.current, { autoAlpha: 1, duration: 0.2 }, "-=0.15");
    }
  });

  const stopTimer = contextSafe(() => {
    if (muteTimelineRef.current) { muteTimelineRef.current.kill(); muteTimelineRef.current = null; }
    gsap.set(notifCompactRef.current, { opacity: 1 });
    gsap.set(timerCompactRef.current, { opacity: 0 });
    timerStateRef.current = "off";
    setTimerState("off");
    setTimerElapsed(0); setRestElapsed(0);
    setTimerPaused(false); timerPausedRef.current = false;
    setTimerNotif(null); setTimerShowList(false);
    syncPhase("idle");
    gsap.timeline()
      .to([compactLayer.current, expandedLayer.current], { autoAlpha: 0, duration: 0.15 })
      .to(pill.current, { width: W_IDLE, height: H_ACTIVE, borderRadius: 32, duration: 0.35, ease: "power3.inOut" });
  });

  const openTimerList = contextSafe(() => {
    setTimerShowList(true);
    syncListView(true);
    setTimerNotif(null);
    gsap.to(pill.current, { height: H_LIST, duration: 0.25, ease: "power2.out" });
  });

  const closeTimerList = contextSafe(() => {
    setTimerShowList(false);
    syncListView(true);
    gsap.to(pill.current, { height: H_TIMER, duration: 0.25, ease: "power2.out" });
  });

  const isIdle = phase === "idle";

  // Auto-activate when first notif arrives while idle
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (notifs.length > 0 && phaseRef.current === "idle") toActive();
  }, [notifs.length]);

  // Collapse back to the small idle pill once the queue is empty — otherwise the
  // active pill lingers showing "0". Skip while a timer runs (it owns the pill)
  // or while hovered (don't yank the open panel; doUnhover drops to "active",
  // which re-fires this and collapses then).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (notifs.length === 0 && timerState === "off" && phase === "active") toIdle();
  }, [notifs.length, phase, timerState]);

  // Cycle the compact ticker through each notification, one at a time, so the
  // label always names a real item next to the total-count badge (a static
  // summary would read "2 Task complete" for a mixed queue).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isIdle || timerState !== "off") return;
    let idx = 0;
    let lastId = "";
    const id = setInterval(() => {
      const cur = notifsRef.current;
      if (cur.length === 0 || phaseRef.current !== "active" || mutedRef.current) return;
      const n = cur[idx++ % cur.length];
      if (n.id === lastId) return; // single item — don't re-animate the same text
      lastId = n.id;
      tickerTo(n.title, n);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [isIdle, timerState]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.key === "y") {
        e.preventDefault();
        if (timerStateRef.current !== "off") stopTimer(); else startTimer();
      }
      if (e.ctrlKey && e.key === "p") {
        e.preventDefault();
        if (timerStateRef.current !== "off") {
          if (phaseRef.current === "active") doHover();
          else if (phaseRef.current === "hovered") openTimerList();
        } else if (phaseRef.current === "idle") {
          toActive();
        } else {
          toIdle();
        }
      }
      if (e.ctrlKey && e.key === "m") {
        e.preventDefault();
        const p = phaseRef.current;
        if (p === "active" || p === "hovered") {
          if (mutedRef.current) toUnmuted(); else toMuted();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase !== "hovered") return;
    const handler = (e: MouseEvent) => {
      if (!pill.current || !e.composedPath().includes(pill.current)) {
        doUnhover();
      }
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [phase]);

  useEffect(() => {
    if (timerState !== "working" || timerPaused) return;
    const id = setInterval(() => setTimerElapsed(s => Math.min(s + 1, workSecs)), 1000);
    return () => clearInterval(id);
  }, [timerState, timerPaused, workSecs]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (timerElapsed < workSecs || timerState !== "working") return;
    timerStateRef.current = "resting";
    setTimerState("resting");
    setRestElapsed(0);
  }, [timerElapsed, timerState, workMins]);

  useEffect(() => {
    if (timerState !== "resting" || timerPaused) return;
    const id = setInterval(() => setRestElapsed(s => Math.min(s + 1, restSecs)), 1000);
    return () => clearInterval(id);
  }, [timerState, timerPaused, restSecs]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (restElapsed < restSecs || timerState !== "resting") return;
    timerStateRef.current = "working";
    setTimerState("working");
    setTimerElapsed(0);
  }, [restElapsed, timerState, restMins]);

  useEffect(() => {
    if (timerState === "off") return;
    let idx = 0;
    const id = setInterval(() => {
      if (timerPausedRef.current || mutedRef.current) return;
      const cur = notifsRef.current;
      if (cur.length === 0 || idx >= cur.length) { clearInterval(id); return; }
      const n = cur[idx++];
      setTimerNotif(n);
      setTimeout(() => setTimerNotif(null), PEEK_MS);
    }, PEEK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [timerState]);

  const isResting     = timerState === "resting";
  const timerColor    = isResting ? "var(--tempest-island-timer-rest-color)" : "var(--tempest-island-timer-color)";
  const arcProgress   = isResting ? restElapsed / restSecs : timerElapsed / workSecs;
  const timeRemaining = isResting ? restSecs - restElapsed : workSecs - timerElapsed;
  const activeNotifs  = notifs.filter(n => n.type === "permission");
  const doneNotifs    = notifs.filter(n => n.type === "done");
  const detailIdx     = notif ? notifs.findIndex(n => n.id === notif.id) : -1;
  const agentCfg      = getAgent(notif?.agent ?? "");

  const NotifRow = ({ n }: { n: IslandNotif }) => (
    <div
      onClick={() => toDetail(n)}
      onMouseEnter={() => setHoveredRow(n.id)}
      onMouseLeave={() => setHoveredRow(null)}
      style={{
        display: "flex", alignItems: "center", gap: 8, height: H_ITEM, flexShrink: 0,
        cursor: "pointer", borderRadius: 6, padding: "0 4px",
        background: hoveredRow === n.id ? "var(--tempest-bg-hover)" : "transparent",
        transition: "background 0.15s",
      }}
    >
      {n.type === "permission"
        ? <ShieldAlert  size={12} style={{ ...ico(12), color: "var(--tempest-island-perm-color)" }} />
        : <CheckCircle2 size={12} style={{ ...ico(12), color: "var(--tempest-semantic-success)" }} />}
      <span style={listTitleStyle}>{n.title}</span>
      <span style={listAgentStyle}>{n.agent}</span>
      <button
        onClick={(e) => { e.stopPropagation(); dismissIslandNotif(n.id); }}
        title="Mark as done"
        style={{
          ...dismissBtnStyle,
          opacity: hoveredRow === n.id ? 1 : 0,
          pointerEvents: hoveredRow === n.id ? "auto" : "none",
        }}
      >
        <X size={10} style={ico(10)} />
      </button>
    </div>
  );

  return (
    <div ref={root} className="island-root" style={{ pointerEvents: "none" }}>
      {/* ── Pill ── */}
      <div
        ref={pill}
        onClick={(e) => {
          e.stopPropagation();
          if (phaseRef.current === "active") doHover();
        }}
        style={{
          position: "absolute", top: 0, left: "50%",
          overflow: "hidden", borderRadius: 32,
          border: "1px solid var(--tempest-island-border-open)",
          background: timerState === "resting"
            ? "var(--tempest-island-timer-rest-bg)"
            : "var(--tempest-island-bg-open)",
          transition: "background-color 0.3s ease",
          pointerEvents: "auto",
          cursor: phase === "active" ? "pointer" : "default",
        }}
      >
        {/* ── Compact layer ── */}
        <div ref={compactLayer} style={{ position: "absolute", top: 0, left: 0, right: 0, height: H_ACTIVE }}>
          {/* Notif compact */}
          <div ref={notifCompactRef} style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px",
            pointerEvents: timerState === "off" ? "auto" : "none",
          }}>
            <div style={{ position: "relative", width: 34, height: H_ACTIVE, flexShrink: 0 }}>
              <div ref={bellNormalRef} style={{
                position: "absolute", inset: 0,
                display: "flex", alignItems: "center",
              }}>
                <Bell size={12} strokeWidth={2} fill="currentColor" style={{ ...ico(12), color: "var(--tempest-fg-default)" }} />
              </div>
              <span ref={bellMutedRef} style={{
                position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                padding: "2px 10px", borderRadius: 999,
                background: "var(--tempest-island-mute-bg)", whiteSpace: "nowrap",
              }}>
                <BellOff size={12} strokeWidth={2} fill="currentColor" style={{ ...ico(12), color: "#fff" }} />
              </span>
            </div>
            <div ref={normalRightRef} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={badgeStyle}>{notifs.length}</span>
              <span ref={ticker} style={tickerTextStyle}>{tickerText}</span>
            </div>
            <span ref={silentRef} style={{ ...tickerTextStyle, color: "var(--tempest-island-mute-bg)", fontWeight: 600,
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)" }}>
              Silent
            </span>
          </div>

          {/* Timer compact */}
          <div ref={timerCompactRef} style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px",
            pointerEvents: timerState !== "off" ? "auto" : "none",
          }}>
            {timerNotif && phase === "active" ? (
              <>
                {timerNotif.type === "permission"
                  ? <ShieldAlert  size={12} style={{ ...ico(12), color: "var(--tempest-island-perm-color)" }} />
                  : <CheckCircle2 size={12} style={{ ...ico(12), color: "var(--tempest-semantic-success)" }} />}
                <span style={{
                  fontSize: 11, color: "var(--tempest-fg-default)", flex: 1, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap", marginLeft: 6,
                  fontFamily: "Geist, system-ui, sans-serif", fontWeight: 500,
                }}>
                  {timerNotif.title}
                </span>
              </>
            ) : (
              <>
                <TimerArc progress={arcProgress} color={muted ? "var(--tempest-fg-subtle)" : timerColor} />
                <span style={{
                  fontSize: 14,
                  color: muted ? "var(--tempest-fg-subtle)" : timerColor,
                  fontFamily: "Geist, system-ui, sans-serif",
                  fontWeight: 500, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em",
                }}>
                  {fmtTime(timeRemaining)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* ── Expanded layer ── */}
        <div ref={expandedLayer} style={{
          position: "absolute", inset: 0,
          padding: "10px 14px",
          display: "flex", flexDirection: "column",
          boxSizing: "border-box",
        }}>

          {/* ── Timer expanded ── */}
          {timerState !== "off" && !timerShowList ? (
            timerNotif ? (
              <div
                onClick={() => openTimerList()}
                style={{
                  height: "100%", display: "flex", alignItems: "center", gap: 10, padding: "0 2px",
                  cursor: "pointer", borderRadius: 8, background: "var(--tempest-bg-selection)",
                }}
              >
                {timerNotif.type === "permission"
                  ? <ShieldAlert  size={22} style={{ ...ico(22), color: "var(--tempest-island-perm-color)" }} />
                  : <CheckCircle2 size={22} style={{ ...ico(22), color: "var(--tempest-semantic-success)" }} />}
                <div style={{ flex: 1, overflow: "hidden" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tempest-fg-default)",
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {timerNotif.title}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--tempest-fg-muted)", marginTop: 2,
                    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {timerNotif.detail}
                  </div>
                </div>
                <ChevronRight size={12} style={{ ...ico(12), color: "var(--tempest-fg-subtle)" }} />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => {
                        if (isResting) {
                          timerStateRef.current = "working";
                          setTimerState("working");
                          setTimerElapsed(0);
                        } else {
                          timerPausedRef.current = !timerPausedRef.current;
                          setTimerPaused(p => !p);
                        }
                      }}
                      style={{
                        width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        background: isResting
                          ? "color-mix(in srgb, var(--tempest-island-timer-rest-color) 20%, transparent)"
                          : timerPaused ? "var(--tempest-bg-active)" : "var(--tempest-island-timer-color)",
                      }}
                    >
                      {isResting
                        ? <Play  size={16} style={{ ...ico(16), fill: "var(--tempest-island-timer-rest-color)", color: "var(--tempest-island-timer-rest-color)" }} />
                        : timerPaused
                          ? <Play  size={16} style={{ ...ico(16), fill: "var(--tempest-island-timer-color)", color: "var(--tempest-island-timer-color)" }} />
                          : <Pause size={16} style={{ ...ico(16), fill: "#000", color: "#000" }} />}
                    </button>
                    <button
                      onClick={() => stopTimer()}
                      style={{
                        width: 40, height: 40, borderRadius: "50%", border: "none", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                        background: "var(--tempest-fg-subtle)",
                        opacity: 0.45,
                      }}
                    >
                      <X size={16} style={{ ...ico(16), color: "var(--tempest-fg-default)" }} strokeWidth={2.5} />
                    </button>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                    <span style={{
                      fontSize: 9,
                      color: isResting
                        ? "color-mix(in srgb, var(--tempest-island-timer-rest-color) 60%, transparent)"
                        : "var(--tempest-fg-subtle)",
                      fontFamily: "Geist, system-ui, sans-serif",
                      fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", lineHeight: 1,
                    }}>
                      {isResting ? "Rest" : "Break in"}
                    </span>
                    <span style={{
                      fontSize: 28, color: timerColor, lineHeight: 1.05, letterSpacing: "-0.03em",
                      fontFamily: "Geist, system-ui, sans-serif", fontWeight: 600,
                      fontVariantNumeric: "tabular-nums",
                    }}>
                      {fmtTime(timeRemaining)}
                    </span>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <TimerArc progress={arcProgress} color={timerColor} />
                  <button
                    onClick={() => openTimerList()}
                    style={{
                      display: "flex", alignItems: "center", gap: 4,
                      padding: "3px 8px", borderRadius: 999,
                      background: "var(--tempest-bg-hover)",
                      border: "1px solid var(--tempest-border-default)",
                      cursor: "pointer",
                    }}
                  >
                    <Bell size={9} style={{ ...ico(9), color: "var(--tempest-fg-muted)" }} />
                    <span style={{
                      fontSize: 10, color: "var(--tempest-fg-muted)",
                      fontFamily: "Geist, system-ui, sans-serif",
                    }}>
                      Notifications
                    </span>
                    <span style={smallBadgeStyle}>{notifs.length}</span>
                  </button>
                </div>
              </div>
            )

          ) : isListView ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              {timerState !== "off" && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 6, flexShrink: 0 }}>
                  <button onClick={() => closeTimerList()} style={backBtnStyle}>
                    <ChevronLeft size={12} style={ico(12)} />
                  </button>
                  <span style={groupLabelStyle}>Notification Center</span>
                </div>
              )}
              <div className="island-scroll" style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column" }}>
                {activeNotifs.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 12 }}>
                    <span style={groupLabelStyle}>Active</span>
                    {activeNotifs.map(n => <NotifRow key={n.id} n={n} />)}
                  </div>
                )}
                {doneNotifs.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <span style={groupLabelStyle}>Done</span>
                    {doneNotifs.map(n => <NotifRow key={n.id} n={n} />)}
                  </div>
                )}
                {notifs.length === 0 && (
                  <span style={{ ...groupLabelStyle, paddingLeft: 4, paddingTop: 4 }}>No notifications</span>
                )}
              </div>
              {/* Break timer config — only shown when timer is off */}
              {timerState === "off" && (
                <div style={{
                  borderTop: "1px solid var(--tempest-border-default)",
                  paddingTop: 8, marginTop: 6, flexShrink: 0,
                  display: "flex", alignItems: "center", gap: 4,
                }}>
                  <span style={timerLabelStyle}>⏱</span>
                  <span style={timerLabelStyle}>Work:</span>
                  <input
                    type="number" min={1} max={999} value={workMins}
                    onChange={e => setWorkMins(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={timerInputStyle}
                  />
                  <span style={timerLabelStyle}>min</span>
                  <span style={{ ...timerLabelStyle, marginLeft: 4 }}>Rest:</span>
                  <input
                    type="number" min={1} max={999} value={restMins}
                    onChange={e => setRestMins(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    style={timerInputStyle}
                  />
                  <span style={timerLabelStyle}>min</span>
                  <button
                    onClick={() => startTimer()}
                    style={{
                      marginLeft: "auto", padding: "3px 9px", borderRadius: 999, border: "none",
                      background: "var(--tempest-island-timer-color)",
                      color: "#000", fontSize: 10, fontWeight: 600, cursor: "pointer",
                      fontFamily: "Geist, system-ui, sans-serif", whiteSpace: "nowrap",
                    }}
                  >
                    Start break timer
                  </button>
                </div>
              )}
            </div>

          ) : notif && (
            <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button onClick={() => toListView()} style={backBtnStyle}>
                  <ChevronLeft size={12} style={ico(12)} />
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <button onClick={() => notifs.length > 0 && toDetail(notifs[(detailIdx - 1 + notifs.length) % notifs.length])} style={navArrowStyle}>
                    <ChevronLeft size={10} style={ico(10)} />
                  </button>
                  <span style={navCountStyle}>{detailIdx + 1} / {notifs.length}</span>
                  <button onClick={() => notifs.length > 0 && toDetail(notifs[(detailIdx + 1) % notifs.length])} style={navArrowStyle}>
                    <ChevronRight size={10} style={ico(10)} />
                  </button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, flex: 1, alignItems: "flex-start" }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
                  {notif.type === "permission"
                    ? <ShieldAlert  size={26} style={{ ...ico(26), color: "var(--tempest-island-perm-color)" }} />
                    : <CheckCircle2 size={26} style={{ ...ico(26), color: "var(--tempest-semantic-success)" }} />}
                  <div>
                    <div style={detailTitleStyle}>{notif.title}</div>
                    <div style={detailBodyStyle}>{notif.detail}</div>
                  </div>
                </div>
                <div style={{
                  width: 62, height: 62, borderRadius: 14, flexShrink: 0,
                  background: notif.type === "permission"
                    ? "color-mix(in srgb, var(--tempest-island-perm-color) 8%, transparent)"
                    : "color-mix(in srgb, var(--tempest-semantic-success) 8%, transparent)",
                  border: "1px solid var(--tempest-border-default)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {agentCfg?.iconSrc && (
                    <img src={agentCfg.iconSrc} alt={agentCfg.name}
                      className={agentCfg.mono ? "agent-icon--mono" : undefined}
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      style={{ width: 32, height: 32, objectFit: "contain" }} />
                  )}
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {notif.type === "permission" && (
                  <button style={denyBtnStyle}>Ignore</button>
                )}
                <button
                  style={denyBtnStyle}
                  onClick={() => { dismissIslandNotif(notif.id); toListView(); }}
                >
                  Mark as read
                </button>
                <button
                  style={allowBtnStyle}
                  onClick={() => { requestIslandFocus(notif.sessionId); dismissIslandNotif(notif.id); toListView(); }}
                >
                  View Agent
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const badgeStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", justifyContent: "center",
  minWidth: 16, height: 16, padding: "1px 4px 0",
  borderRadius: 999, background: "var(--tempest-island-perm-color)",
  color: "#000", fontSize: 10, fontWeight: 600, lineHeight: 1,
  flexShrink: 0, fontVariantNumeric: "tabular-nums",
};

const smallBadgeStyle: React.CSSProperties = {
  background: "var(--tempest-island-perm-color)", color: "#000", borderRadius: 999,
  padding: "1px 4px", fontSize: 9, fontWeight: 700, lineHeight: 1,
};

const tickerTextStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 500, color: "var(--tempest-fg-default)",
  fontFamily: "Geist, system-ui, sans-serif",
  whiteSpace: "nowrap", letterSpacing: "-0.01em", lineHeight: 1,
};

const groupLabelStyle: React.CSSProperties = {
  fontSize: 9, fontWeight: 600, color: "var(--tempest-fg-subtle)",
  fontFamily: "Geist, system-ui, sans-serif",
  letterSpacing: "0.07em", textTransform: "uppercase",
  paddingLeft: 4, lineHeight: 1,
};

const listTitleStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, color: "var(--tempest-fg-default)",
  fontFamily: "Geist, system-ui, sans-serif",
  flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
};

const listAgentStyle: React.CSSProperties = {
  fontSize: 10, color: "var(--tempest-fg-subtle)",
  fontFamily: "Geist, system-ui, sans-serif",
  flexShrink: 0, whiteSpace: "nowrap",
};

const detailTitleStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "var(--tempest-fg-default)",
  fontFamily: "Geist, system-ui, sans-serif", marginBottom: 3,
};

const detailBodyStyle: React.CSSProperties = {
  fontSize: 11, color: "var(--tempest-fg-muted)",
  fontFamily: "Geist, system-ui, sans-serif", lineHeight: 1.45,
};

const denyBtnStyle: React.CSSProperties = {
  flex: 1, padding: "6px 0", borderRadius: 999, border: "none",
  background: "var(--tempest-bg-hover)", color: "var(--tempest-fg-default)",
  fontSize: 11, fontWeight: 500, cursor: "pointer",
  fontFamily: "Geist, system-ui, sans-serif",
  display: "flex", alignItems: "center", justifyContent: "center",
};

const allowBtnStyle: React.CSSProperties = {
  flex: 1, padding: "6px 0", borderRadius: 999, border: "none",
  background: "var(--tempest-island-allow-bg)", color: "var(--tempest-accent-blue)",
  fontSize: 11, fontWeight: 600, cursor: "pointer",
  fontFamily: "Geist, system-ui, sans-serif",
  display: "flex", alignItems: "center", justifyContent: "center",
};

const backBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "none", border: "none", padding: "2px 4px",
  cursor: "pointer", color: "var(--tempest-fg-subtle)", borderRadius: 4,
};

const navArrowStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center",
  background: "var(--tempest-bg-hover)", border: "none", padding: "2px 5px",
  cursor: "pointer", color: "var(--tempest-fg-muted)", borderRadius: 4,
};

const navCountStyle: React.CSSProperties = {
  fontSize: 10, color: "var(--tempest-fg-subtle)",
  fontFamily: "Geist, system-ui, sans-serif",
  fontVariantNumeric: "tabular-nums", minWidth: 28, textAlign: "center",
};

const timerInputStyle: React.CSSProperties = {
  width: 30, padding: "2px 3px", borderRadius: 4, flexShrink: 0,
  border: "1px solid var(--tempest-border-default)",
  background: "var(--tempest-bg-hover)", color: "var(--tempest-fg-default)",
  fontSize: 11, fontFamily: "Geist, system-ui, sans-serif",
  textAlign: "center", outline: "none",
};

const timerLabelStyle: React.CSSProperties = {
  fontSize: 10, color: "var(--tempest-fg-subtle)", flexShrink: 0,
  fontFamily: "Geist, system-ui, sans-serif", whiteSpace: "nowrap",
};

const dismissBtnStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  background: "none", border: "none", padding: 0, marginLeft: 2,
  width: 14, height: 14, borderRadius: 4, cursor: "pointer",
  color: "var(--tempest-fg-subtle)", transition: "opacity 0.15s",
};
