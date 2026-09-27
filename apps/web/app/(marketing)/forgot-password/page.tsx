import Link from "next/link";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata = {
  title: "Forgot password — Copinex",
  description: "Request a secure password-reset link for your Copinex account.",
};

export default function ForgotPasswordPage() {
  return (
    <main className="auth-shell">
      <div className="auth-card">
        <Link href="/" className="wordmark" aria-label="Copinex home">
          <span className="wordmark-name">COPINEX</span>
          <span className="wordmark-note">Copy · Trade · Grow</span>
        </Link>
        <h1>Reset your password</h1>
        <p>
          Enter the email on your account and we will send a single-use link. It expires in one
          hour and can be used once.
        </p>
        <div style={{ marginTop: 24 }}>
          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  );
}