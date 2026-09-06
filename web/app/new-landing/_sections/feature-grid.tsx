import type { ReactNode } from "react";
import Image from "next/image";
import {
  Bot,
  GitBranch,
  MessagesSquare,
  GitPullRequest,
  Terminal,
  MonitorPlay,
  Activity,
  History,
  Coins,
  Database,
  Shield,
  Zap,
} from "lucide-react";
import { Container } from "../_components/container";
import { Aurora } from "../_components/aurora";
import {
  OneWindowVisual,
  WorktreesVisual,
  ThreadsVisual,
  DiffVisual,
  TerminalVisual,
  PreviewVisual,
  StatusVisual,
  HistoryVisual,
  TokensVisual,
  DatabaseBranchesVisual,
  SandboxVisual,
  NativeVisual,
} from "../_components/feature-visuals";

type Feature = {
  icon: typeof Bot;
  title: string;
  body: string;
  image?: { src: string; alt: string; width: number; height: number };
  visual?: () => ReactNode;
};

const features: Feature[] = [
  { icon: Bot,             title: "One window",          body: "Claude Code, Codex, Aider, Gemini — every CLI agent running side by side, no window swapping.", visual: OneWindowVisual },
  { icon: GitBranch,       title: "Parallel worktrees",  body: "Every session gets its own git worktree and branch. Agents never touch each other's files.", visual: WorktreesVisual },
  { icon: MessagesSquare,  title: "Threads",             body: "Drop chats, files, and notes onto a canvas. Feed each agent exactly the context it needs.", visual: ThreadsVisual },
  { icon: GitPullRequest,  title: "Diff, commit, PR",    body: "Review every change in a live diff viewer. Stage, commit, push, and open a PR without leaving Tempest.", visual: DiffVisual },
  { icon: Terminal,        title: "Real terminal",       body: "ANSI color, in-session search, clickable links — a full PTY in every session.", visual: TerminalVisual },
  { icon: MonitorPlay,     title: "Live preview",        body: "Watch your dev server update in real time as agents change code.", visual: PreviewVisual },
  { icon: Activity,        title: "Live status",         body: "See the instant each agent finishes a turn. No tab-watching, no babysitting.", visual: StatusVisual },
  { icon: History,         title: "Full history",        body: "Close a tab and reopen it later. Each agent resumes exactly where it left off.", visual: HistoryVisual },
  { icon: Coins,           title: "Token intelligence",  body: "A local knowledge graph shared across sessions — 86% token efficiency, 92% fewer tool calls.", visual: TokensVisual },
  { icon: Database,        title: "Database branches",   body: "An isolated Postgres instance per agent. Parallel runs never corrupt each other's data.", visual: DatabaseBranchesVisual },
  { icon: Shield,          title: "Hephaestus sandbox",  body: "OS-level process isolation on every platform. Job Objects, sandbox-exec, bubblewrap.", visual: SandboxVisual },
  { icon: Zap,             title: "Native, not Electron",body: "Tauri 2 on Windows, macOS, and Linux. Boots fast, stays cool, feels like the OS.", visual: NativeVisual },
];

export function FeatureGridSection() {
  return (
    <Container className="mt-16 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30">
      <div className="relative overflow-hidden">
        <Aurora
          className="absolute inset-0"
          colors={[
            "#000000",
            "#0ea5e9",
            "#000000",
            "#22d3ee",
            "#000000",
            "#a5f3fc",
            "#000000",
          ]}
        />
        <div className="relative z-10 grid gap-8 px-6 pt-6 pb-10 sm:px-8 sm:pt-8 sm:pb-12 lg:px-10 lg:pt-10 lg:pb-16 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-end lg:gap-10">
          <div className="flex flex-col gap-5">
            <span className="text-[13px] uppercase tracking-[0.12em] text-white/60">
              Everything in the box
            </span>
            <h2 className="max-w-3xl font-pixel text-[28px] leading-[1.05] tracking-[-0.02em] sm:text-[34px] md:text-[40px]">
              <span className="text-white">Twelve capabilities.</span>{" "}
              <span className="text-white/50">One workspace.</span>
            </h2>
          </div>
          <p className="max-w-md text-[14px] font-light leading-[1.6] text-white/60 lg:pb-1">
            Tempest is a full agentic engineering platform, not a wrapper.
            Every feature ships in the same binary, works offline, and stays
            out of your way.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 border-t border-dashed border-white/15 sm:grid-cols-2 lg:grid-cols-3">
        {features.map(({ icon: Icon, title, body, image, visual: Visual }, i) => {
          const smCol = i % 2;
          const lgCol = i % 3;
          return (
            <div
              key={title}
              className={[
                "flex flex-col border-dashed border-white/15",
                i > 0 && "border-t",
                i < 2 && "sm:border-t-0",
                smCol > 0 && "sm:border-l",
                i < 3 ? "lg:border-t-0" : "lg:border-t",
                lgCol > 0 ? "lg:border-l" : "lg:border-l-0",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div
                className="relative aspect-[4/3] w-full overflow-hidden border-b border-dashed border-white/15"
                style={{ backgroundColor: "#030303" }}
              >
                {Visual ? (
                  <Visual />
                ) : image ? (
                  <Image
                    src={image.src}
                    alt={image.alt}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    quality={100}
                    unoptimized
                    className="object-cover object-center"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[11px] uppercase tracking-[0.14em] text-white/25">
                    image
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-4 p-5 sm:p-6">
                <div className="flex h-9 w-9 items-center justify-center border border-dashed border-white/25 bg-white/[0.04]">
                  <Icon size={15} className="text-white" strokeWidth={1.5} />
                </div>
                <div className="flex flex-col gap-2">
                  <p className="font-pixel text-[17px] leading-[1.1] tracking-[-0.02em] text-white">
                    {title}
                  </p>
                  <p className="text-[13px] font-light leading-[1.55] text-white/60">
                    {body}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Container>
  );
}
