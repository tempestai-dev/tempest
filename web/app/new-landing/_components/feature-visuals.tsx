import type { ComponentType, ReactNode } from "react";
import { ClaudeCode, Codex, Cline, GeminiCLI } from "@lobehub/icons";
import {
  FileText,
  StickyNote,
  Search,
  RefreshCw,
  Check,
  Clock,
  RotateCcw,
  Database as DatabaseIcon,
  Apple,
  MonitorCheck,
  Terminal as TerminalIcon,
  Zap as ZapIcon,
} from "lucide-react";

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-3 sm:p-4">
      {children}
    </div>
  );
}

type TabIcon = ComponentType<{ size?: number }>;

export function OneWindowVisual() {
  const tabs: Array<{ name: string; Icon: TabIcon; active?: boolean }> = [
    { name: "claude", Icon: ClaudeCode, active: true },
    { name: "codex", Icon: Codex },
    { name: "cline", Icon: Cline },
    { name: "gemini", Icon: GeminiCLI },
  ];
  return (
    <Frame>
      <div className="w-full max-w-[340px] border border-dashed border-white/20 bg-white/[0.02]">
        <div className="flex border-b border-dashed border-white/15">
          {tabs.map(({ name, Icon, active }) => (
            <div
              key={name}
              className={
                "flex flex-1 items-center gap-1.5 px-2.5 py-2 text-[11px] font-mono " +
                (active ? "bg-white/[0.05] text-white" : "text-white/40")
              }
            >
              <Icon size={12} />
              {name}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-2 p-4 font-mono text-[11px] leading-none text-white/50">
          <div><span className="text-cyan-300/80">$</span> tempest run</div>
          <div className="text-white/30">→ 4 agents · 4 worktrees</div>
          <div className="mt-1 h-px w-full bg-white/10" />
          <div className="text-white/60">claude ▸ implementing auth…</div>
          <div className="text-white/25">codex  ▸ writing tests…</div>
          <div className="text-white/25">cline  ▸ refactoring db…</div>
          <div className="text-white/25">gemini ▸ drafting docs…</div>
        </div>
      </div>
    </Frame>
  );
}

export function WorktreesVisual() {
  const branches = [
    { y: 30, label: "main", color: "#ffffff" },
    { y: 70, label: "feat/api", color: "#22d3ee" },
    { y: 110, label: "feat/ui", color: "#a5f3fc" },
    { y: 150, label: "fix/auth", color: "#0ea5e9" },
  ];
  return (
    <Frame>
      <svg viewBox="0 0 260 180" className="w-full max-w-[320px]">
        <line
          x1="30"
          y1="20"
          x2="30"
          y2="160"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1"
          strokeDasharray="3 3"
        />
        {branches.map((b) => (
          <g key={b.label}>
            <path
              d={`M 30 ${b.y} Q 60 ${b.y} 70 ${b.y}`}
              fill="none"
              stroke={b.color}
              strokeOpacity="0.5"
              strokeWidth="1"
            />
            <circle cx="30" cy={b.y} r="3" fill={b.color} />
            <circle
              cx="200"
              cy={b.y}
              r="2.5"
              fill={b.color}
              fillOpacity="0.9"
            />
            <line
              x1="70"
              y1={b.y}
              x2="197"
              y2={b.y}
              stroke={b.color}
              strokeOpacity="0.3"
              strokeWidth="1"
            />
            <text
              x="80"
              y={b.y - 4}
              fill="rgba(255,255,255,0.7)"
              fontSize="9"
              fontFamily="monospace"
            >
              {b.label}
            </text>
          </g>
        ))}
      </svg>
    </Frame>
  );
}

export function ThreadsVisual() {
  const W = 260;
  const H = 180;
  const nodes: Array<{
    y: number;
    label: string;
    body: string;
    Icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
  }> = [
    { y: 58, label: "FILE", body: "auth.ts", Icon: FileText },
    { y: 122, label: "NOTE", body: "use hs256 for jwt", Icon: StickyNote },
  ];
  const agents: Array<{
    y: number;
    name: string;
    color: string;
    Icon: ComponentType<{ size?: number }>;
  }> = [
    { y: 30, name: "claude", color: "#22d3ee", Icon: ClaudeCode },
    { y: 78, name: "codex", color: "#a5f3fc", Icon: Codex },
    { y: 126, name: "cline", color: "#0ea5e9", Icon: Cline },
    { y: 168, name: "gemini", color: "#67e8f9", Icon: GeminiCLI },
  ];
  const nodeRightX = 96;
  const agentLeftX = 176;

  const dots: Array<[number, number]> = [];
  for (let x = 10; x < W; x += 12) {
    for (let y = 10; y < H; y += 12) dots.push([x, y]);
  }

  return (
    <Frame>
      <div className="relative w-full max-w-[340px]" style={{ aspectRatio: `${W} / ${H}` }}>
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full">
          <g fill="rgba(255,255,255,0.08)">
            {dots.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="0.7" />
            ))}
          </g>
          {agents.flatMap((a) =>
            nodes.map((n) => (
              <path
                key={`${a.name}-${n.label}`}
                d={`M ${nodeRightX} ${n.y} C ${(nodeRightX + agentLeftX) / 2} ${n.y} ${(nodeRightX + agentLeftX) / 2} ${a.y} ${agentLeftX} ${a.y}`}
                fill="none"
                stroke={a.color}
                strokeOpacity="0.45"
                strokeWidth="1"
              />
            )),
          )}
          {nodes.map((n) => (
            <circle key={`nd-${n.label}`} cx={nodeRightX} cy={n.y} r="1.8" fill="rgba(255,255,255,0.9)" />
          ))}
          {agents.map((a) => (
            <circle key={`ad-${a.name}`} cx={agentLeftX} cy={a.y} r="1.8" fill={a.color} />
          ))}
        </svg>

        {nodes.map((n) => {
          const NodeIcon = n.Icon;
          const pct = (n.y / H) * 100;
          return (
            <div
              key={n.label}
              className="absolute flex flex-col gap-1 border border-dashed border-white/30 bg-white/[0.05] px-2 py-1.5"
              style={{
                left: 8,
                top: `${pct}%`,
                width: 82,
                transform: "translateY(-50%)",
              }}
            >
              <div className="flex items-center gap-1 text-[7.5px] uppercase tracking-[0.1em] text-white/45">
                <NodeIcon size={9} strokeWidth={1.5} className="text-white/60" />
                {n.label}
              </div>
              <div className="font-mono text-[9px] leading-tight text-white/85">{n.body}</div>
            </div>
          );
        })}

        {agents.map((a) => {
          const AgentIcon = a.Icon;
          const pct = (a.y / H) * 100;
          return (
            <div
              key={a.name}
              className="absolute flex items-center gap-1.5 border border-dashed bg-white/[0.04] px-1.5 py-1"
              style={{
                right: 4,
                top: `${pct}%`,
                width: 74,
                transform: "translateY(-50%)",
                borderColor: `${a.color}80`,
              }}
            >
              <AgentIcon size={12} />
              <span className="font-mono text-[9px] text-white/85">{a.name}</span>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}

export function DiffVisual() {
  const lines: Array<{ k: " " | "-" | "+"; t: string }> = [
    { k: " ", t: "export function auth(req) {" },
    { k: "-", t: "  const t = req.cookies.token" },
    { k: "-", t: "  return verify(t, SECRET)" },
    { k: "+", t: "  const t = getBearer(req)" },
    { k: "+", t: "  if (!t) throw Unauthorized" },
    { k: "+", t: "  return verifyJWT(t)" },
    { k: " ", t: "}" },
  ];
  return (
    <Frame>
      <div className="w-full max-w-[340px] border border-dashed border-white/20 bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-dashed border-white/15 px-2.5 py-2 font-mono text-[11px] text-white/50">
          <span>auth.ts</span>
          <span className="flex gap-2">
            <span className="text-emerald-300/80">+3</span>
            <span className="text-rose-300/80">-2</span>
          </span>
        </div>
        <div className="flex flex-col p-2.5 font-mono text-[11px] leading-[1.5]">
          {lines.map((l, i) => (
            <div
              key={i}
              className={
                "flex gap-2 px-1 " +
                (l.k === "+"
                  ? "bg-emerald-400/10 text-emerald-100/90"
                  : l.k === "-"
                    ? "bg-rose-400/10 text-rose-100/90"
                    : "text-white/50")
              }
            >
              <span className="w-2 text-white/40">{l.k}</span>
              <span>{l.t}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 border-t border-dashed border-white/15 px-2.5 py-2">
          <span className="border border-dashed border-cyan-300/40 px-2 py-0.5 font-mono text-[10px] text-cyan-200/80">
            commit
          </span>
          <span className="border border-dashed border-white/20 px-2 py-0.5 font-mono text-[10px] text-white/60">
            open PR
          </span>
        </div>
      </div>
    </Frame>
  );
}

export function TerminalVisual() {
  return (
    <Frame>
      <div className="w-full max-w-[340px] border border-dashed border-white/20 bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-dashed border-white/15 px-2.5 py-2 font-mono text-[11px] text-white/50">
          <span>~/app · zsh</span>
          <span className="flex items-center gap-1 border border-dashed border-white/20 px-1.5 py-0.5 text-[10px]">
            <Search size={9} strokeWidth={1.5} />
            <span>next.config</span>
          </span>
        </div>
        <div className="flex flex-col gap-0.5 p-3 font-mono text-[11px] leading-[1.45]">
          <div>
            <span className="text-cyan-300/80">$ </span>
            <span className="text-white/85">npm run dev</span>
          </div>
          <div className="text-emerald-300/85">✓ ready in 240ms</div>
          <div>
            <span className="text-cyan-300/80">→ </span>
            <span className="text-white/85 underline decoration-white/40 underline-offset-2">
              http://localhost:3000
            </span>
          </div>
          <div>
            <span className="text-amber-300/85">warn </span>
            <span className="text-white/55">slow module: lodash</span>
          </div>
          <div>
            <span className="text-rose-300/85">error </span>
            <span className="text-white/55">TS2339 · auth.ts:12</span>
          </div>
          <div className="mt-1 flex items-center">
            <span className="text-cyan-300/80">$ </span>
            <span className="ml-1 inline-block h-[10px] w-[6px] animate-pulse bg-white/70" />
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function PreviewVisual() {
  return (
    <Frame>
      <div className="w-full max-w-[340px] border border-dashed border-white/20 bg-white/[0.02]">
        <div className="flex items-center gap-2 border-b border-dashed border-white/15 px-2.5 py-2 font-mono text-[10px] text-white/50">
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
            <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
          </span>
          <span className="flex-1 truncate border border-dashed border-white/15 px-1.5 py-0.5 text-white/60">
            localhost:3000
          </span>
          <span className="flex items-center gap-1 text-emerald-300/85">
            <RefreshCw size={9} strokeWidth={1.75} className="animate-spin" />
            <span>live</span>
          </span>
        </div>
        <div className="flex flex-col gap-2 p-3">
          <div className="h-2 w-2/3 bg-white/70" />
          <div className="h-1.5 w-1/2 bg-white/25" />
          <div className="mt-1 grid grid-cols-3 gap-1.5">
            <div className="h-8 border border-dashed border-cyan-300/40 bg-cyan-300/[0.08]" />
            <div className="h-8 border border-dashed border-white/20 bg-white/[0.03]" />
            <div className="h-8 border border-dashed border-white/20 bg-white/[0.03]" />
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[9px] font-mono text-white/50">
            <span className="h-1 w-1 rounded-full bg-emerald-300/80" />
            <span>agent edited hero.tsx · reloaded 40ms ago</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function StatusVisual() {
  const rows: Array<{
    Icon: ComponentType<{ size?: number }>;
    name: string;
    status: "done" | "running" | "idle";
    detail: string;
  }> = [
    { Icon: ClaudeCode, name: "claude", status: "done", detail: "auth flow · 4 files" },
    { Icon: Codex, name: "codex", status: "running", detail: "writing tests…" },
    { Icon: Cline, name: "cline", status: "running", detail: "refactor db…" },
    { Icon: GeminiCLI, name: "gemini", status: "idle", detail: "waiting" },
  ];
  return (
    <Frame>
      <div className="w-full max-w-[340px] border border-dashed border-white/20 bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-dashed border-white/15 px-2.5 py-2 font-mono text-[11px] text-white/50">
          <span>sessions</span>
          <span className="flex items-center gap-1 text-[10px] text-white/45">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300/80" />
            live
          </span>
        </div>
        <div className="flex flex-col">
          {rows.map(({ Icon, name, status, detail }) => (
            <div
              key={name}
              className="flex items-center gap-2 border-b border-dashed border-white/10 px-2.5 py-2 last:border-b-0"
            >
              <Icon size={14} />
              <div className="flex flex-1 flex-col leading-tight">
                <span className="font-mono text-[11px] text-white/85">{name}</span>
                <span className="font-mono text-[9px] text-white/45">{detail}</span>
              </div>
              {status === "done" && (
                <span className="flex items-center gap-1 border border-dashed border-emerald-300/40 px-1.5 py-0.5 font-mono text-[9px] text-emerald-300/85">
                  <Check size={9} strokeWidth={2} />
                  done
                </span>
              )}
              {status === "running" && (
                <span className="flex items-center gap-1 border border-dashed border-cyan-300/40 px-1.5 py-0.5 font-mono text-[9px] text-cyan-300/85">
                  <span className="flex gap-[2px]">
                    <span className="h-1 w-1 animate-pulse rounded-full bg-cyan-300/85 [animation-delay:0ms]" />
                    <span className="h-1 w-1 animate-pulse rounded-full bg-cyan-300/85 [animation-delay:150ms]" />
                    <span className="h-1 w-1 animate-pulse rounded-full bg-cyan-300/85 [animation-delay:300ms]" />
                  </span>
                  run
                </span>
              )}
              {status === "idle" && (
                <span className="border border-dashed border-white/20 px-1.5 py-0.5 font-mono text-[9px] text-white/45">
                  idle
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

export function TokensVisual() {
  const nodes: Array<{ x: number; y: number; r: number; hot?: boolean }> = [
    { x: 130, y: 90, r: 5, hot: true },
    { x: 70, y: 50, r: 3 },
    { x: 200, y: 45, r: 3 },
    { x: 60, y: 130, r: 3 },
    { x: 205, y: 135, r: 3 },
    { x: 100, y: 30, r: 2 },
    { x: 165, y: 25, r: 2 },
    { x: 35, y: 90, r: 2 },
    { x: 225, y: 90, r: 2 },
    { x: 105, y: 155, r: 2 },
    { x: 170, y: 158, r: 2 },
  ];
  const links: Array<[number, number]> = [
    [0, 1], [0, 2], [0, 3], [0, 4],
    [1, 5], [1, 7], [2, 6], [2, 8],
    [3, 9], [4, 10], [5, 6],
  ];
  return (
    <Frame>
      <div className="w-full max-w-[340px] border border-dashed border-white/20 bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-dashed border-white/15 px-2.5 py-2 font-mono text-[11px] text-white/50">
          <span>knowledge graph</span>
          <span className="text-[10px] text-white/45">shared · local</span>
        </div>
        <svg viewBox="0 0 260 180" className="w-full">
          {links.map(([a, b], i) => (
            <line
              key={i}
              x1={nodes[a].x}
              y1={nodes[a].y}
              x2={nodes[b].x}
              y2={nodes[b].y}
              stroke="rgba(34,211,238,0.35)"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          ))}
          {nodes.map((n, i) => (
            <circle
              key={i}
              cx={n.x}
              cy={n.y}
              r={n.r}
              fill={n.hot ? "#22d3ee" : "rgba(255,255,255,0.85)"}
              opacity={n.hot ? 1 : 0.85}
            />
          ))}
        </svg>
        <div className="grid grid-cols-2 border-t border-dashed border-white/15 font-mono text-[10px]">
          <div className="flex flex-col gap-0.5 border-r border-dashed border-white/15 px-2.5 py-2">
            <span className="text-white/45">token efficiency</span>
            <span className="text-cyan-300/90">86%</span>
          </div>
          <div className="flex flex-col gap-0.5 px-2.5 py-2">
            <span className="text-white/45">tool calls</span>
            <span className="text-cyan-300/90">−92%</span>
          </div>
        </div>
      </div>
    </Frame>
  );
}

export function DatabaseBranchesVisual() {
  const branches: Array<{
    name: string;
    agent: ComponentType<{ size?: number }>;
    color: string;
    rows: string;
  }> = [
    { name: "main",       agent: ClaudeCode, color: "#ffffff", rows: "1.2M rows" },
    { name: "feat/api",   agent: Codex,      color: "#22d3ee", rows: "1.2M rows" },
    { name: "feat/ui",    agent: Cline,      color: "#a5f3fc", rows: "1.2M rows" },
    { name: "fix/schema", agent: GeminiCLI,  color: "#0ea5e9", rows: "1.2M rows" },
  ];
  return (
    <Frame>
      <div className="w-full max-w-[340px] border border-dashed border-white/20 bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-dashed border-white/15 px-2.5 py-2 font-mono text-[11px] text-white/50">
          <span className="flex items-center gap-1.5">
            <DatabaseIcon size={11} strokeWidth={1.5} />
            postgres
          </span>
          <span className="text-[10px] text-white/45">copy-on-write</span>
        </div>
        <div className="flex flex-col">
          {branches.map(({ name, agent: Agent, color, rows }) => (
            <div
              key={name}
              className="flex items-center gap-2 border-b border-dashed border-white/10 px-2.5 py-2 last:border-b-0"
            >
              <span
                className="flex h-[18px] w-[18px] items-center justify-center border border-dashed"
                style={{ borderColor: `${color}80` }}
              >
                <Agent size={10} />
              </span>
              <div className="flex flex-1 flex-col leading-tight">
                <span className="font-mono text-[11px] text-white/85">{name}</span>
                <span className="font-mono text-[9px] text-white/45">{rows}</span>
              </div>
              <span
                className="border border-dashed px-1.5 py-0.5 font-mono text-[9px]"
                style={{ borderColor: `${color}60`, color: `${color}` }}
              >
                branch
              </span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

export function SandboxVisual() {
  const platforms: Array<{
    Icon: ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;
    name: string;
    tech: string;
  }> = [
    { Icon: MonitorCheck, name: "windows", tech: "Job Objects" },
    { Icon: Apple,        name: "macos",   tech: "sandbox-exec" },
    { Icon: TerminalIcon, name: "linux",   tech: "bubblewrap" },
  ];
  return (
    <Frame>
      <div className="w-full max-w-[340px] border border-dashed border-white/20 bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-dashed border-white/15 px-2.5 py-2 font-mono text-[11px] text-white/50">
          <span>hephaestus · sandbox</span>
          <span className="flex items-center gap-1 text-[10px] text-emerald-300/85">
            <Check size={9} strokeWidth={2} />
            isolated
          </span>
        </div>
        <div className="flex flex-col">
          {platforms.map(({ Icon, name, tech }) => (
            <div
              key={name}
              className="flex items-center gap-2 border-b border-dashed border-white/10 px-2.5 py-2 last:border-b-0"
            >
              <span className="flex h-[18px] w-[18px] items-center justify-center border border-dashed border-white/25">
                <Icon size={11} strokeWidth={1.5} className="text-white/85" />
              </span>
              <span className="flex-1 font-mono text-[11px] text-white/85">{name}</span>
              <span className="border border-dashed border-white/20 px-1.5 py-0.5 font-mono text-[9px] text-white/60">
                {tech}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

export function NativeVisual() {
  const rows: Array<{ label: string; tempest: string; other: string; pct: number }> = [
    { label: "boot",   tempest: "0.4s",  other: "3.2s",  pct: 12 },
    { label: "memory", tempest: "58 MB", other: "410 MB", pct: 14 },
    { label: "binary", tempest: "12 MB", other: "180 MB", pct: 7 },
  ];
  return (
    <Frame>
      <div className="w-full max-w-[340px] border border-dashed border-white/20 bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-dashed border-white/15 px-2.5 py-2 font-mono text-[11px] text-white/50">
          <span className="flex items-center gap-1.5">
            <ZapIcon size={11} strokeWidth={1.5} />
            tauri 2 · native
          </span>
          <span className="text-[10px] text-white/45">win · mac · linux</span>
        </div>
        <div className="flex flex-col gap-2.5 p-3">
          {rows.map(({ label, tempest, other, pct }) => (
            <div key={label} className="flex flex-col gap-1">
              <div className="flex items-center justify-between font-mono text-[10px]">
                <span className="text-white/55">{label}</span>
                <span className="flex gap-2">
                  <span className="text-cyan-300/90">{tempest}</span>
                  <span className="text-white/30 line-through">{other}</span>
                </span>
              </div>
              <div className="relative h-1 w-full bg-white/[0.06]">
                <span
                  className="absolute inset-y-0 left-0 bg-cyan-300/70"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

export function HistoryVisual() {
  const sessions: Array<{
    Icon: ComponentType<{ size?: number }>;
    name: string;
    when: string;
    resumed?: boolean;
  }> = [
    { Icon: ClaudeCode, name: "auth flow", when: "2h ago", resumed: true },
    { Icon: Codex, name: "test suite", when: "yesterday" },
    { Icon: Cline, name: "db migration", when: "3d ago" },
    { Icon: GeminiCLI, name: "docs draft", when: "last week" },
  ];
  return (
    <Frame>
      <div className="w-full max-w-[340px] border border-dashed border-white/20 bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-dashed border-white/15 px-2.5 py-2 font-mono text-[11px] text-white/50">
          <span className="flex items-center gap-1.5">
            <Clock size={10} strokeWidth={1.5} />
            history
          </span>
          <span className="text-[10px] text-white/40">resumes ⇥ exact state</span>
        </div>
        <div className="relative flex flex-col">
          <span
            className="pointer-events-none absolute bottom-2 left-[14px] top-2 w-px bg-white/10"
            aria-hidden
          />
          {sessions.map(({ Icon, name, when, resumed }) => (
            <div
              key={name}
              className="relative flex items-center gap-2 px-2.5 py-2"
            >
              <span
                className={
                  "relative z-10 flex h-[18px] w-[18px] items-center justify-center border border-dashed " +
                  (resumed
                    ? "border-cyan-300/50 bg-cyan-300/10"
                    : "border-white/25 bg-[#030303]")
                }
              >
                <Icon size={10} />
              </span>
              <div className="flex flex-1 flex-col leading-tight">
                <span className="font-mono text-[11px] text-white/85">{name}</span>
                <span className="font-mono text-[9px] text-white/45">{when}</span>
              </div>
              {resumed && (
                <span className="flex items-center gap-1 border border-dashed border-cyan-300/40 px-1.5 py-0.5 font-mono text-[9px] text-cyan-300/85">
                  <RotateCcw size={9} strokeWidth={2} />
                  resumed
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}
