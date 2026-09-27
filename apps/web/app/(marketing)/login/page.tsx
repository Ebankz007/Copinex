import Link from "next/link";
import { AuthForm } from "@/components/auth-form";

export const metadata = {
  title: "Sign in — Copinex",
};

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Link href="/" className="wordmark" aria-label="Copinex home">
          <span className="wordmark-name">COPINEX</span>
          <span className="wordmark-note">Copy · Trade · Grow</span>
        </Link>
        <h1>Welcome back</h1>
        <p>Sign in to your Copinex account. Admins land in the console, members in the portal.</p>

        <div style={{ marginTop: 24 }}>
          <AuthForm mode="login" />
        </div>
      </div>
    </main>
  );
}