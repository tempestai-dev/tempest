import Image from "next/image";
import { Container } from "@/components/layout/container";

export function WhoItsForSection() {
  return (
    <Container className="mt-20 pb-20">
      <p className="text-sm text-muted-foreground font-semibold mb-3">WHO IT'S FOR</p>
      <h2 className="text-2xl min-[1000px]:text-3xl font-normal leading-snug">
        <span className="text-foreground">Built for developers who ship in parallel.</span>
        <br className="hidden min-[700px]:block" />
        {" "}<span className="text-muted-foreground">And want to ship faster.</span>
      </h2>
      <div className="grid grid-cols-1 min-[700px]:grid-cols-2 min-[1000px]:grid-cols-4 gap-6 mt-8">
        {[
          {
            title: "Solo builders",
            image: "/personas/solo-builders.jpg",
            body: "Run five agents in parallel and build five features at once. Ship a week of work in a day, and keep every thread straight.",
          },
          {
            title: "Freelancers",
            image: "/personas/freelancers.jpg",
            body: "Client A, B, and C — each agent on its own branch and worktree. Switch context without the chaos or the merge conflicts.",
          },
          {
            title: "Open source contributors",
            image: "/personas/open-source-contributors.jpg",
            body: "Try three approaches to the same issue at once. Drop the ones that fail, merge the one that works. No stash juggling.",
          },
          {
            title: "Teams",
            image: "/personas/students.jpg",
            body: "Every teammate's agent runs isolated in its own worktree, so automated sessions never cause merge conflicts. Review diffs, push, and open PRs inside Tempest.",
          },
        ].map(({ title, image, body }) => (
          <div key={title} className="flex flex-col">
            <div className="relative w-full aspect-[3/4] rounded overflow-hidden bg-foreground/[0.06]">
              <Image src={image} alt={title} fill loading="eager" className="object-cover" />
            </div>
            <h3 className="mt-4 text-sm font-semibold text-foreground">{title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{body}</p>
          </div>
        ))}
      </div>
    </Container>
  );
}
