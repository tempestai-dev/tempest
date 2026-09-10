import type { ReactNode } from "react";
import { Container } from "./container";

export function ProseShell({ children }: { children: ReactNode }) {
  return (
    <Container className="mt-16 px-0 min-[476px]:px-0 min-[1000px]:px-0 border border-dashed border-muted-foreground/30">
      <article className="prose-landing max-w-none px-6 py-10 sm:px-10 sm:py-14 lg:px-14 lg:py-16">
        {children}
      </article>
    </Container>
  );
}
