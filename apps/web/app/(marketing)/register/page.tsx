import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export const metadata = {
  title: "Register — Copinex",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ sponsor?: string }>;
}) {
  const { sponsor } = await searchParams;
  const sponsorId = sponsor && /^[0-9a-f-]{8,64}$/i.test(sponsor) ? sponsor : undefined;

  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Link href="/" className="wordmark" aria-label="Copinex home">
          <span className="wordmark-name">COPINEX</span>
          <span className="wordmark-note">Copy · Trade · Grow</span>
        </Link>
        <h1>Create your account</h1>
        <p>
          Join Copinex and start earning daily investment returns. Commissions flow from day one —
          the $50 membership unlocks withdrawals, investments &amp; PAMM.
        </p>

        <div style={{ marginTop: 24 }}>
          <AuthForm mode="register" sponsorId={sponsorId} />
        </div>
      </div>
    </main>
  );
}