import Link from "next/link";
import { VerifyEmailPanel } from "@/components/verify-email-panel";

export const metadata = {
  title: "Verify email — Copinex",
  description: "Confirm your Copinex account email address.",
};

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Link href="/" className="wordmark" aria-label="Copinex home">
          <span className="wordmark-name">COPINEX</span>
          <span className="wordmark-note">Copy · Trade · Grow</span>
        </Link>
        <h1>Verify your email</h1>
        <p>Verification secures account recovery and confirms you own this address.</p>
        <div style={{ marginTop: 24 }}>
          <VerifyEmailPanel token={token} />
        </div>
      </div>
    </main>
  );
}