import { FolderOpen } from "lucide-react";
import { Container } from "../_components/container";
import { Aurora } from "../_components/aurora";
import { WindowsLogo } from "@/components/icons/windows";
import { TuxIcon } from "@/components/icons/linux";
import { AppleLogo } from "@/components/icons/apple";
import { AgentsIllustration } from "@/components/sections/landing/agents-illustration";

const steps = [
  {
    title: "Download Tempest",
    body: "Install the desktop app in seconds on Windows, macOS, or Linux. No account, no subscription, no sign-up.",
  },
  {
    title: "Open your repo",
    body: "Point Tempest at any git repository. Sessions get their own isolated worktrees automatically — no manual branching.",
  },
  {
    title: "Run agents in parallel",
    body: "Pick your tool — Claude Code, Codex, Gemini, or any other. Launch multiple sessions and watch them work at once.",
  },
];

export function HowItWorksSection() {
  return (
    <Container className="mt-16 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30">
      <div className="relative overflow-hidden">
        <Aurora className="absolute inset-0" />
        <div className="relative z-10 px-6 pt-6 pb-10 sm:px-8 sm:pt-8 sm:pb-12 lg:px-10 lg:pt-10 lg:pb-16">
          <span className="text-[13px] uppercase tracking-[0.12em] text-white/60">
            How it works
          </span>
          <h2 className="mt-5 max-w-3xl font-pixel text-[28px] leading-[1.05] tracking-[-0.02em] sm:text-[34px] md:text-[40px]">
            <span className="text-white">Open Tempest.</span>{" "}
            <span className="text-white/50">Start a session in 3 steps.</span>
          </h2>
        </div>
      </div>

      <div className="grid grid-cols-3 border-t border-dashed border-white/15">
        {steps.map(({ title, body }, i) => (
          <div
            key={title}
            className={
              i > 0
                ? "flex flex-col border-l border-dashed border-white/15"
                : "flex flex-col"
            }
          >
            <div className="relative flex h-72 flex-col items-center justify-center gap-2 overflow-hidden border-b border-dashed border-white/15">
                {title === "Download Tempest" && (
                  <>
                    <a
                      href="/download"
                      className="flex h-[3.75rem] w-52 items-center gap-3 bg-white px-4 transition-opacity hover:opacity-90"
                    >
                      <WindowsLogo className="size-7 shrink-0 text-black" />
                      <span className="flex flex-col items-start leading-none">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-black">
                          Download now for
                        </span>
                        <span className="text-xl font-semibold tracking-tight text-black">
                          Windows
                        </span>
                      </span>
                    </a>
                    <a
                      href="/download"
                      className="flex h-[3.75rem] w-52 items-center gap-3 bg-white px-4 transition-opacity hover:opacity-90"
                    >
                      <TuxIcon className="size-9 shrink-0 text-black" />
                      <span className="flex flex-col items-start leading-none">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-black">
                          Download now for
                        </span>
                        <span className="text-xl font-semibold tracking-tight text-black">
                          GNU / Linux
                        </span>
                      </span>
                    </a>
                    <a
                      href="/download"
                      className="flex h-[3.75rem] w-52 items-center gap-3 bg-white px-4 transition-opacity hover:opacity-90"
                    >
                      <AppleLogo className="size-7 shrink-0 text-black" />
                      <span className="flex flex-col items-start leading-none">
                        <span className="text-[10px] uppercase tracking-[0.12em] text-black">
                          Download now for
                        </span>
                        <span className="text-xl font-semibold tracking-tight text-black">
                          macOS
                        </span>
                      </span>
                    </a>
                  </>
                )}
                {title === "Open your repo" && (
                  <div className="flex h-full w-full items-center justify-center px-6">
                    <div className="flex items-center gap-3 bg-white px-6 py-4 shadow-lg">
                      <FolderOpen
                        className="size-6 text-black"
                        strokeWidth={1.5}
                      />
                      <span className="text-base font-semibold text-black">
                        Add a project
                      </span>
                    </div>
                  </div>
                )}
              {title === "Run agents in parallel" && <AgentsIllustration />}
            </div>
            <div className="flex flex-col gap-3 p-6 sm:p-8">
              <p className="font-pixel text-[20px] leading-[1.1] tracking-[-0.02em] text-white">
                {title}
              </p>
              <p className="text-[14px] font-light leading-[1.6] text-white/60">
                {body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
