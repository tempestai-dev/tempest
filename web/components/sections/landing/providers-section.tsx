import { Container } from "@/components/layout/container";
import { ProvidersRow } from "@/components/providers-row";

export function ProvidersSection() {
  return (
    <Container className="py-8">
      <p className="text-sm text-muted-foreground uppercase tracking-widest text-center">
        One knowledge graph. Every agent you already use, in parallel
      </p>
      <ProvidersRow />
    </Container>
  );
}
