import { GitBranch, History, Activity, GitMerge, Eye, Terminal, MonitorPlay, GitPullRequest, Zap, Layers, Plus, Bot } from "lucide-react";
import { Container } from "@/components/layout/container";

export function CoreFeaturesSection() {
  return (
    <Container className="mt-20 pb-20">
      <p className="text-sm text-muted-foreground font-semibold mb-3">CORE FEATURES</p>
      <h2 className="text-2xl min-[1000px]:text-3xl font-normal leading-snug">
        <span className="text-foreground">Everything you need to run parallel AI agents.</span>
        <br className="hidden min-[700px]:block" />
        {" "}<span className="text-muted-foreground">Nothing you don't.</span>
      </h2>
      <div className="relative grid divide-x divide-y border grid-cols-1 min-[700px]:grid-cols-2 min-[1000px]:grid-cols-4 mt-8 *:p-8">
        {[
          { icon: Bot,            title: "One window",            body: "Claude Code, Aider, OpenCode, Copilot CLI, Cline, Goose — every agent running in parallel, one window." },
          { icon: GitBranch,      title: "Worktree isolation",    body: "Every session gets its own git worktree and branch. Agents never touch each other's files." },
          { icon: History,        title: "Full history",          body: "Close a tab and reopen it later. Each agent resumes exactly where it left off." },
          { icon: Activity,       title: "Live status",           body: "See the instant each agent finishes a turn. No tab-watching, no babysitting." },
          { icon: GitMerge,       title: "Diff, commit, PR",      body: "Review every change in a live diff viewer. Stage, commit, push, and open a PR without leaving Tempest." },
          { icon: MonitorPlay,    title: "Live preview",          body: "Watch your dev server update in real time as agents change code." },
          { icon: Terminal,       title: "Real terminal",         body: "ANSI color, in-session search, clickable links — a full terminal in every session." },
          { icon: Layers,         title: "Token Intelligence",    body: "A shared code-knowledge graph cuts context tokens up to 64% and tool calls up to 58%. Coming soon." },
          { icon: GitPullRequest, title: "Database branches",     body: "An isolated Postgres instance per agent, so parallel runs never corrupt each other's data. Coming soon." },
          { icon: Eye,            title: "Zero conflicts",        body: "Even a rogue agent can't reach your main branch. Blast radius: zero." },
          { icon: Zap,            title: "Native, not Electron",  body: "Tauri 2 native performance on Windows, macOS, and Linux." },
          { icon: Plus,           title: "And more",              body: "New features ship every week. Tempest is just getting started." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="space-y-3">
            <div className="flex items-center gap-2">
              <Icon className="size-4" />
              <h3 className="text-sm font-medium">{title}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </Container>
  );
}
