import Link from "next/link";
import { PageHero } from "@/components/page-hero";

export const metadata = {
  title: "Contact — Copinex",
  description:
    "Contact Copinex. Support is available through the member portal; official destinations are published only on the verified Copinex domain.",
};

export default function ContactPage() {
  return (
    <main>
      <PageHero
        eyebrow="Contact"
        title="Talk to the team — through verified channels only."
        body="Support is available to registered members through the member portal. Never share passwords, PINs, or seed phrases with anyone claiming to represent Copinex."
      />

      <section className="section">
        <div className="shell">
          <div className="split-heading">
            <div className="section-heading">
              <p className="eyebrow">Support channels</p>
              <h2>Where to reach us.</h2>
              <p>
                Official support destinations are published only on the verified Copinex domain and
                inside the member portal. If you are a registered member, open the portal and use
                the in-app channels.
              </p>
            </div>
            <aside className="boundary-note">
              <strong>STAY SAFE</strong>
              <p>
                Copinex will never ask for your email password, bank PIN, card PIN, one-time
                password, crypto seed phrase, or remote access to your device.
              </p>
            </aside>
          </div>

          <div className="control-grid is-auto" style={{ marginTop: 44 }}>
            <article className="control-card">
              <span className="control-icon">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
                </svg>
              </span>
              <h3>Member portal</h3>
              <p>Registered members can reach support from inside the portal after signing in.</p>
              <div style={{ marginTop: 16 }}>
                <Link href="/login" className="btn btn-dark">
                  Sign in
                </Link>
              </div>
            </article>
            <article className="control-card">
              <span className="control-icon">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 4h16v12H7l-3 3V4Z" />
                </svg>
              </span>
              <h3>Not a member yet?</h3>
              <p>Create an account to open a support thread and join the community program.</p>
              <div style={{ marginTop: 16 }}>
                <Link href="/register" className="btn">
                  Create account
                </Link>
              </div>
            </article>
            <article className="control-card">
              <span className="control-icon">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </span>
              <h3>Report suspicious contact</h3>
              <p>If someone contacts you claiming to represent Copinex off the official domain, do not respond. Report it through the portal.</p>
            </article>
          </div>

          <div className="security-banner" style={{ marginTop: 26 }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <div>
              <strong>Only follow verified links</strong>
              <p>
                The only official Copinex destinations are published on this domain and inside the
                member portal. Any other channel claiming to be Copinex is not us.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}