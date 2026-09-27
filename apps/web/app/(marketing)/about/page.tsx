import Link from "next/link";
import { PageHero } from "@/components/page-hero";

export const metadata = {
  title: "About — Copinex",
  description:
    "Copinex is an AI-assisted copy-trading technology ecosystem designed around personal broker custody, visible controls, and responsible participation.",
};

export default function AboutPage() {
  return (
    <main>
      <PageHero
        eyebrow="About Copinex"
        title="A system built on custody, visibility, and discipline."
        body="Copinex is an AI-assisted copy-trading technology ecosystem. We design the strategy and risk layer; your trading capital stays with your approved personal broker."
      />

      <section className="section">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">What we are</p>
            <h2>Technology and oversight — not a broker, not a bank.</h2>
            <p>
              Copinex supplies the analysis engine, the trade and risk engine, and the MT5 copy
              integration that connects an eligible personal broker account to a managed strategy.
              We are not presented as a broker, bank, deposit-taker, or guaranteed-income program.
            </p>
          </div>

          <div className="control-grid is-auto" style={{ marginTop: 44 }}>
            <article className="control-card">
              <span className="control-icon">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </span>
              <h3>AI Analysis Engine</h3>
              <p>Continuous evaluation of selected market conditions, supporting strategy decisions with data.</p>
            </article>
            <article className="control-card">
              <span className="control-icon">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </span>
              <h3>Trade &amp; Risk Engine</h3>
              <p>Position sizing, execution rules, drawdown monitoring, and defined exit controls.</p>
            </article>
            <article className="control-card">
              <span className="control-icon">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="19" cy="5" r="2" />
                  <circle cx="19" cy="19" r="2" />
                  <path d="m7 11 10-5M7 13l10 5" />
                </svg>
              </span>
              <h3>MT5 Copy Integration</h3>
              <p>Visible, automated execution through an eligible personal broker account.</p>
            </article>
            <article className="control-card">
              <span className="control-icon">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <h3>Community Program</h3>
              <p>A qualification-based referral and leadership program, separate from trading.</p>
            </article>
          </div>

          <div className="security-banner" style={{ marginTop: 26 }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <div>
              <strong>Our operating principles</strong>
              <p>
                Trading funds stay with your broker. Activity remains visible. Risk controls guide
                execution. Nothing is guaranteed. Every claim on this site is designed to survive
                independent scrutiny.
              </p>
            </div>
          </div>

          <div style={{ marginTop: 34 }}>
            <Link href="/register" className="btn">
              Create your account
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}