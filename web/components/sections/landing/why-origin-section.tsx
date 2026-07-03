import Image from "next/image";
import { GitBranch, History, Coins } from "lucide-react";
import { Container } from "@/components/layout/container";

export function WhyOriginSection() {
  return (
    <Container className="mt-20 pb-20">
      <div className="flex flex-col min-[700px]:flex-row min-[700px]:items-stretch gap-8">
        <div className="min-[700px]:w-2/3 flex flex-col gap-3">
          <p className="text-sm text-muted-foreground font-semibold">WHY TEMPEST</p>
          <h2 className="text-2xl min-[1000px]:text-3xl font-normal leading-snug">
            <span className="text-foreground">More windows don't give you more isolation.</span>
            <br className="hidden min-[700px]:block" />
            {" "}<span className="text-muted-foreground">They give you more chaos.</span>
          </h2>
        </div>
        <div className="min-[700px]:w-1/3 flex flex-col min-[700px]:justify-end">
          <p className="text-base text-muted-foreground leading-relaxed">
            Shared knowledge base. Every agent on its own branch — nothing steps on anything else. Run five in parallel without confusion.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 min-[700px]:grid-cols-3 gap-4 mt-8">
        {[
          { icon: GitBranch, title: "Isolated git worktrees", body: "Each session runs on its own branch. Agents never touch each other's files, so no merge conflicts mid-run and no stepping on uncommitted changes." },
          { icon: Coins,     title: "Token intelligence", body: "A local code-knowledge graph lives on your machine and is shared across every session. Agents pull from it instead of scanning files on their own — up to 64% less context, up to 58% fewer tool calls." },
          { icon: History,   title: "Session continuity", body: "Close a tab, reopen it, and the agent resumes exactly where it left off with full history intact. Nothing is lost." },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded bg-foreground/[0.06] p-6 flex flex-col gap-6">
            <div className="w-9 h-9 rounded-md bg-foreground/[0.08] border border-foreground/[0.1] flex items-center justify-center">
              <Icon size={16} className="text-foreground" />
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-sm text-foreground leading-snug">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </Container>
  );
}
