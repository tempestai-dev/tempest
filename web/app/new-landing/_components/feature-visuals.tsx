import type { ComponentType, ReactNode } from "react";
import { ClaudeCode, Codex, Cline, GeminiCLI } from "@lobehub/icons";

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-5 sm:p-6">
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
      <div className="w-full max-w-[280px] border border-dashed border-white/20 bg-white/[0.02]">
        <div className="flex border-b border-dashed border-white/15">
          {tabs.map(({ name, Icon, active }) => (
            <div
              key={name}
              className={
                "flex flex-1 items-center gap-1.5 px-2 py-1.5 text-[9px] font-mono " +
                (active ? "bg-white/[0.05] text-white" : "text-white/40")
              }
            >
              <Icon size={10} />
              {name}
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-1.5 p-3 font-mono text-[9px] leading-none text-white/50">
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
      <svg viewBox="0 0 260 180" className="w-full max-w-[260px]">
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
  const dots: Array<[number, number]> = [];
  for (let x = 10; x < 260; x += 12) {
    for (let y = 10; y < 180; y += 12) dots.push([x, y]);
  }
  return (
    <Frame>
      <svg viewBox="0 0 260 180" className="w-full max-w-[260px]">
        <g fill="rgba(255,255,255,0.08)">
          {dots.map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="0.7" />
          ))}
        </g>

        <path d="M 60 42 C 100 42 100 96 140 96" fill="none" stroke="#22d3ee" strokeOpacity="0.55" strokeWidth="1" />
        <path d="M 60 92 C 100 92 100 96 140 96" fill="none" stroke="#a5f3fc" strokeOpacity="0.55" strokeWidth="1" />
        <path d="M 60 142 C 100 142 100 96 140 96" fill="none" stroke="#0ea5e9" strokeOpacity="0.55" strokeWidth="1" />

        <g fontFamily="monospace" fontSize="7.5">
          <g>
            <rect x="14" y="28" width="46" height="28" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.25)" strokeDasharray="2 2" />
            <text x="19" y="39" fill="rgba(255,255,255,0.45)" fontSize="6.5">CHAT</text>
            <text x="19" y="50" fill="rgba(255,255,255,0.8)">auth flow…</text>
          </g>

          <g>
            <rect x="14" y="78" width="46" height="28" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.25)" strokeDasharray="2 2" />
            <text x="19" y="89" fill="rgba(255,255,255,0.45)" fontSize="6.5">FILE</text>
            <text x="19" y="100" fill="rgba(255,255,255,0.8)">auth.ts</text>
          </g>

          <g>
            <rect x="14" y="128" width="46" height="28" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.25)" strokeDasharray="2 2" />
            <text x="19" y="139" fill="rgba(255,255,255,0.45)" fontSize="6.5">NOTE</text>
            <text x="19" y="150" fill="rgba(255,255,255,0.8)">use hs256</text>
          </g>

          <g>
            <rect x="140" y="76" width="70" height="40" fill="rgba(34,211,238,0.08)" stroke="#22d3ee" strokeOpacity="0.6" strokeDasharray="2 2" />
            <text x="147" y="88" fill="rgba(34,211,238,0.85)" fontSize="6.5">AGENT</text>
            <text x="147" y="100" fill="rgba(255,255,255,0.85)">claude</text>
            <text x="147" y="110" fill="rgba(255,255,255,0.45)">3 refs ▸ run</text>
          </g>
        </g>

        <circle cx="60" cy="42" r="1.5" fill="#22d3ee" />
        <circle cx="60" cy="92" r="1.5" fill="#a5f3fc" />
        <circle cx="60" cy="142" r="1.5" fill="#0ea5e9" />
        <circle cx="140" cy="96" r="1.5" fill="#22d3ee" />
      </svg>
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
      <div className="w-full max-w-[280px] border border-dashed border-white/20 bg-white/[0.02]">
        <div className="flex items-center justify-between border-b border-dashed border-white/15 px-2 py-1.5 font-mono text-[9px] text-white/50">
          <span>auth.ts</span>
          <span className="flex gap-2">
            <span className="text-emerald-300/80">+3</span>
            <span className="text-rose-300/80">-2</span>
          </span>
        </div>
        <div className="flex flex-col p-2 font-mono text-[9px] leading-[1.5]">
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
        <div className="flex items-center gap-1.5 border-t border-dashed border-white/15 px-2 py-1.5">
          <span className="border border-dashed border-cyan-300/40 px-1.5 py-0.5 font-mono text-[8px] text-cyan-200/80">
            commit
          </span>
          <span className="border border-dashed border-white/20 px-1.5 py-0.5 font-mono text-[8px] text-white/60">
            open PR
          </span>
        </div>
      </div>
    </Frame>
  );
}
