import { Container } from "@/components/layout/container";
import { WindowsLogo } from "@/components/icons/windows";
import { TuxIcon } from "@/components/icons/linux";
import { AppleLogo } from "@/components/icons/apple";
import { FolderOpen } from "lucide-react";
import { AgentsIllustration } from "./agents-illustration";

export function HowItWorksSection() {
  return (
    <Container className="mt-12 pb-20">
      <p className="text-sm text-muted-foreground font-semibold mb-3">HOW IT WORKS</p>
      <h2 className="text-2xl min-[1000px]:text-3xl font-normal leading-snug">
        <span className="text-foreground">Open Tempest.</span>{" "}
        <span className="text-muted-foreground">Start a session in 3 steps.</span>
      </h2>
      <div className="grid grid-cols-1 min-[700px]:grid-cols-3 gap-4 mt-8">
        {[
          { title: "Download Tempest", body: "Install the desktop app in seconds on Windows, macOS, or Linux. No account, no subscription, no sign-up required." },
          { title: "Open your repo", body: "Point Tempest at any git repository. Sessions get their own isolated worktrees automatically — no manual branching." },
          { title: "Run agents in parallel", body: "Pick your tool — Claude Code, Aider, OpenCode, or any other. Launch multiple sessions and watch them work simultaneously." },
        ].map(({ title, body }) => (
          <div key={title} className="flex flex-col gap-3">
            <div
              className="relative h-72 rounded overflow-hidden flex flex-col items-center justify-center gap-1.5 bg-muted dark:bg-background border border-foreground/[0.08]"
            >
              {title === "Open your repo" && (
                <div className="relative flex items-center justify-center w-full h-full px-6">
                  {/* Add a project box */}
                  <div className="relative flex items-center gap-3 rounded-xl bg-foreground px-6 py-4 shadow-lg">
                    <FolderOpen className="size-6 text-background" strokeWidth={1.5} />
                    <span className="text-base font-semibold text-background">Add a project</span>
                  </div>
                </div>
              )}
              {title === "Run agents in parallel" && (
                <AgentsIllustration />
              )}
              {title === "Download Tempest" && (
                <>
                  <a href="#" className="w-52 h-[3.75rem] rounded bg-foreground flex items-center px-4 gap-3 transition-colors hover:opacity-90">
                    <WindowsLogo className="size-7 shrink-0 text-background" />
                    <span className="flex flex-col items-start leading-none">
                      <span className="text-[10px] text-background uppercase tracking-[0.12em]">Download now for</span>
                      <span className="text-xl font-semibold text-background tracking-tight">Windows</span>
                    </span>
                  </a>
                  <a href="#" className="w-52 h-[3.75rem] rounded bg-foreground flex items-center px-4 gap-3 transition-colors hover:opacity-90">
                    <TuxIcon className="size-9 shrink-0 text-background" />
                    <span className="flex flex-col items-start leading-none">
                      <span className="text-[10px] text-background uppercase tracking-[0.12em]">Download now for</span>
                      <span className="text-xl font-semibold text-background tracking-tight">GNU / Linux</span>
                    </span>
                  </a>
                  <a href="#" className="w-52 h-[3.75rem] rounded bg-foreground flex items-center px-4 gap-3 transition-colors hover:opacity-90">
                    <AppleLogo className="size-7 shrink-0 text-background" />
                    <span className="flex flex-col items-start leading-none">
                      <span className="text-[10px] text-background uppercase tracking-[0.12em]">Download now for</span>
                      <span className="text-xl font-semibold text-background tracking-tight">macOS</span>
                    </span>
                  </a>
                </>
              )}
            </div>
            <p className="text-xl text-foreground">{title}</p>
            <p className="text-base text-muted-foreground leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </Container>
  );
}
