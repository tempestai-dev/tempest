export default function NewLandingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* ponytail: hide site chrome via global CSS while on this route.
          Swap for a real (new)/layout.tsx route group at cutover. */}
      <style>{`header:not(.nl-header), footer { display: none !important; } html, body { overflow-x: clip; }`}</style>
      {children}
    </>
  );
}
