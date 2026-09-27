/**
 * Portal shell — the dark navy member/admin app. The public marketing site and
 * the pre-login auth pages live in the (marketing) group with the light design;
 * everything behind the session renders inside this shell.
 */
export default function PortalLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-night text-soft">
      <div className="app-glow pointer-events-none fixed inset-0" aria-hidden="true" />
      <div className="relative">{children}</div>
    </div>
  );
}
