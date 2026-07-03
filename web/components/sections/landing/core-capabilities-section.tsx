import { Check } from "lucide-react";
import Image from "next/image";
import { Container } from "@/components/layout/container";

export function CoreCapabilitiesSection() {
  return (
    <Container className="mt-20 pb-20">
      <p className="text-sm text-muted-foreground font-semibold mb-3">CORE CAPABILITIES</p>
      <h2 className="text-2xl min-[1000px]:text-3xl font-normal leading-snug">
        <span className="text-foreground">Built to handle the hard parts.</span>
        <br className="hidden min-[700px]:block" />
        {" "}<span className="text-muted-foreground">So you can focus on shipping.</span>
      </h2>

      <div className="flex flex-col gap-4 mt-8">

        <div className="overflow-hidden grid grid-cols-1 min-[700px]:grid-cols-2">
          <div className="p-8 min-[1000px]:p-10 flex flex-col justify-center gap-10">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground font-semibold">PARALLEL SESSIONS</p>
              <h3 className="text-xl min-[1000px]:text-2xl font-normal leading-snug">
                <span className="text-foreground">Five agents running.</span>{" "}
                <span className="text-muted-foreground">Zero collisions.</span>
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Each session runs in its own isolated git worktree. Agents never touch each other's files — no merge conflicts mid-run, no stepping on uncommitted changes. You switch tools the same way you switch tabs.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {[
                "Each agent on its own branch, automatically",
                "No stash juggling, no detective work",
                "Switch between Claude Code, Aider, OpenCode and more",
              ].map((text) => (
                <div key={text} className="flex items-center gap-2">
                  <Check className="size-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded overflow-hidden bg-foreground/[0.06]">
            <Image src="/screenshots/parallel.png" alt="Parallel sessions" width={1312} height={1040} className="w-full h-auto" />
          </div>
        </div>

        <div className="overflow-hidden grid grid-cols-1 min-[700px]:grid-cols-2">
          <div className="rounded overflow-hidden bg-foreground/[0.06]">
            <Image src="/screenshots/diff-viewer.png" alt="Diff viewer" width={1312} height={1040} className="w-full h-auto" />
          </div>
          <div className="p-8 min-[1000px]:p-10 flex flex-col justify-center gap-10">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground font-semibold">BUILT-IN DIFF & PUSH</p>
              <h3 className="text-xl min-[1000px]:text-2xl font-normal leading-snug">
                <span className="text-foreground">Review what each agent changed.</span>{" "}
                <span className="text-muted-foreground">Ship it without leaving Tempest.</span>
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                A stream diff viewer shows exactly what each agent touched. Stage, commit, push, and open a PR — all without switching to another tool.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {[
                "Stream diff viewer per session",
                "Stage, commit, and push from inside the app",
                "Open a PR without leaving Tempest",
              ].map((text) => (
                <div key={text} className="flex items-center gap-2">
                  <Check className="size-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-hidden grid grid-cols-1 min-[700px]:grid-cols-2">
          <div className="p-8 min-[1000px]:p-10 flex flex-col justify-center gap-10">
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground font-semibold">LIVE PREVIEW</p>
              <h3 className="text-xl min-[1000px]:text-2xl font-normal leading-snug">
                <span className="text-foreground">Watch changes land in real time.</span>{" "}
                <span className="text-muted-foreground">No alt-tab, no second monitor.</span>
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Your local dev server updates live as agents make changes. See the result without switching context — right inside Tempest.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {[
                "Live localhost preview inside the app",
                "Updates as agents write code",
                "No external browser tab required",
              ].map((text) => (
                <div key={text} className="flex items-center gap-2">
                  <Check className="size-3.5 text-muted-foreground shrink-0" />
                  <p className="text-sm text-muted-foreground">{text}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded overflow-hidden bg-foreground/[0.06]">
            <Image src="/screenshots/live-preview.png" alt="Live preview" width={1312} height={1040} className="w-full h-auto" />
          </div>
        </div>

      </div>
    </Container>
  );
}

