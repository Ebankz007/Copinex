import Link from "next/link";
import { ProcessSlider } from "@/components/process-slider";

export const metadata = {
  title: "Copinex — AI-Assisted Copy Trading with Control",
  description:
    "Copinex combines AI-assisted market analysis, professional trader oversight, and disciplined risk controls to connect your personal broker account to a managed copy-trading strategy.",
};

function ShieldIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="10" width="16" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <main>
      {/* ── Hero ─────────────────────────────────────────── */}
      <section className="hero" aria-labelledby="hero-title">
        <div className="shell hero-inner">
          <div className="hero-copy">
            <p className="eyebrow eyebrow-light">AI-assisted copy trading ecosystem</p>
            <h1 id="hero-title">
              Trade with a system.
              <br />
              <span>Stay in control.</span>
            </h1>
            <p className="hero-body">
              Copinex combines AI-assisted market analysis, professional trader oversight, and
              disciplined risk controls to connect your personal broker account to a managed
              copy-trading strategy. Your trading capital stays with your approved broker.
            </p>
            <div className="hero-actions">
              <Link className="btn btn-light" href="#how-it-works">
                See how it works <ArrowIcon />
              </Link>
              <Link className="btn btn-outline" href="/register">
                Create account <ArrowIcon />
              </Link>
            </div>
            <p className="hero-risk">
              <strong>Trading involves substantial risk.</strong> No return or income is guaranteed.
            </p>
          </div>

          <aside className="account-card" aria-label="Copinex account and strategy structure">
            <div className="card-head">
              <div>
                <p className="card-kicker">ACCOUNT STRUCTURE</p>
                <h2>Your capital stays separate.</h2>
              </div>
              <span className="status-pill">Live platform</span>
            </div>
            <div className="personal-account">
              <span className="account-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" />
                </svg>
              </span>
              <div>
                <span>Personal broker account</span>
                <strong>Held in your name, where required</strong>
              </div>
              <svg aria-label="Protected account boundary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="10" width="16" height="11" rx="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
              </svg>
            </div>
            <div className="connection-list">
              <div className="connection-row">
                <span>Verified connection</span>
                <strong>Via approved broker</strong>
              </div>
              <div className="connection-row">
                <span>Copinex strategy layer</span>
                <strong>AI-assisted + reviewed</strong>
              </div>
              <div className="connection-row">
                <span>User visibility</span>
                <strong>Monitor and control</strong>
              </div>
            </div>
            <p className="card-foot">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
              No performance data is shown until independently verified.
            </p>
          </aside>
        </div>
      </section>

      {/* ── Assurance strip ──────────────────────────────── */}
      <section className="assurance" aria-label="Key service principles">
        <div className="shell assurance-grid">
          <div className="assurance-item">
            <span className="check">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="m6 12 4 4 8-9" />
              </svg>
            </span>
            Trading funds stay with your broker
          </div>
          <div className="assurance-item">
            <span className="check">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="m6 12 4 4 8-9" />
              </svg>
            </span>
            Activity remains visible
          </div>
          <div className="assurance-item">
            <span className="check">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="m6 12 4 4 8-9" />
              </svg>
            </span>
            Risk controls guide execution
          </div>
          <div className="assurance-item">
            <span className="check">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="m6 12 4 4 8-9" />
              </svg>
            </span>
            No guaranteed outcomes
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────── */}
      <section className="section section-soft" id="how-it-works">
        <div className="shell process-layout">
          <div className="process-copy">
            <div className="section-heading">
              <p className="eyebrow">How Copinex works</p>
              <h2>A clear path from account to control.</h2>
              <p>
                The exact handoff becomes available only after the broker, connection method, and
                legal terms are verified.
              </p>
            </div>
            <p className="slider-instruction">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 12h8M12 8l4 4-4 4" />
                <rect x="3" y="3" width="18" height="18" rx="4" />
              </svg>
              Use the arrows, dots, keyboard, or swipe to explore.
            </p>
          </div>
          <ProcessSlider />
        </div>
      </section>

      {/* ── Safety & control ─────────────────────────────── */}
      <section className="section" id="safety">
        <div className="shell">
          <div className="split-heading">
            <div className="section-heading">
              <p className="eyebrow">Custody &amp; control</p>
              <h2>Your account. Your visibility. Your control.</h2>
              <p>Copinex supplies the strategy and technology layer. Your personal broker holds your trading account.</p>
            </div>
            <aside className="boundary-note">
              <strong>WHAT COPINEX IS NOT</strong>
              <p>Not presented here as a broker, bank, deposit-taker, or guaranteed-income program.</p>
            </aside>
          </div>
          <div className="control-grid">
            <article className="control-card">
              <span className="control-icon">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18v12H3zM3 10h18M7 15h3" />
                </svg>
              </span>
              <h3>Funds stay with your broker</h3>
              <p>You fund and withdraw through your personal approved broker account, not through Copinex.</p>
            </article>
            <article className="control-card">
              <span className="control-icon">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </span>
              <h3>Trades stay visible</h3>
              <p>Monitor copied activity through the verified MetaTrader 5 or broker experience.</p>
            </article>
            <article className="control-card">
              <span className="control-icon">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M10 14v6" />
                </svg>
              </span>
              <h3>Risk settings matter</h3>
              <p>Allocation, position sizing, drawdown controls, and stop-loss logic are part of the operating framework.</p>
            </article>
            <article className="control-card">
              <span className="control-icon">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M9.5 9v6M14.5 9v6" />
                </svg>
              </span>
              <h3>Pause when you choose</h3>
              <p>The verified platform process should explain how to pause, resume, or disconnect.</p>
            </article>
          </div>
          <div className="security-banner">
            <ShieldIcon />
            <div>
              <strong>Protect your access details</strong>
              <p>
                Copinex should never ask for your email password, bank PIN, card PIN, one-time
                password, crypto seed phrase, or remote access to your device. Only follow verified
                links on the official Copinex domain.
              </p>
            </div>
          </div>
          <p className="custody-disclosure">
            The membership fee is not trading capital. Broker-account funding is not paid to Copinex.
          </p>
        </div>
      </section>

      {/* ── Technology ───────────────────────────────────── */}
      <section className="section technology" id="technology">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow eyebrow-light">One disciplined pipeline</p>
            <h2>Intelligence is only useful when it passes through discipline.</h2>
            <p>Professional oversight reviews the system and market conditions. AI assists the process; it does not guarantee an outcome.</p>
          </div>
          <div className="tech-grid">
            <article className="tech-card">
              <div className="tech-card-top">
                <span>01</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M2 12h4M18 12h4M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <h3>AI Analysis Engine</h3>
              <p>Continuously evaluates selected market conditions and supports strategy decisions with data.</p>
            </article>
            <article className="tech-card">
              <div className="tech-card-top">
                <span>02</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                  <path d="M9 12l2 2 4-4" />
                </svg>
              </div>
              <h3>Trade &amp; Risk Engine</h3>
              <p>Applies position sizing, execution rules, drawdown monitoring, and defined exit controls.</p>
            </article>
            <article className="tech-card">
              <div className="tech-card-top">
                <span>03</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="5" cy="12" r="2" />
                  <circle cx="19" cy="5" r="2" />
                  <circle cx="19" cy="19" r="2" />
                  <path d="m7 11 10-5M7 13l10 5" />
                </svg>
              </div>
              <h3>MT5 Copy Integration</h3>
              <p>Connects an eligible personal broker account to the verified Copinex managed strategy for visible, automated execution.</p>
            </article>
          </div>
          <div className="pipeline" aria-label="Signal-to-execution process">
            <div className="pipeline-item">
              <span className="pipeline-number">01</span>
              <div>
                <strong>AI-assisted analysis</strong>
                <span>Market conditions evaluated</span>
              </div>
            </div>
            <div className="pipeline-item">
              <span className="pipeline-number">02</span>
              <div>
                <strong>Professional oversight</strong>
                <span>Human review layer</span>
              </div>
            </div>
            <div className="pipeline-item">
              <span className="pipeline-number">03</span>
              <div>
                <strong>Risk gate</strong>
                <span>Sizing · limits · exits</span>
              </div>
            </div>
            <div className="pipeline-item">
              <span className="pipeline-number">04</span>
              <div>
                <strong>Client broker account</strong>
                <span>Outside Copinex custody</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Two paths ────────────────────────────────────── */}
      <section className="section section-soft" id="community">
        <div className="shell">
          <div className="section-heading">
            <p className="eyebrow">Two distinct paths</p>
            <h2>Trading and community participation are separate.</h2>
            <p>Choose the part of the ecosystem that fits your goals. Each path has distinct risks, rules, and responsibilities.</p>
          </div>
          <div className="paths-grid">
            <article className="path-card">
              <span>PATH A</span>
              <span className="path-icon">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 12h4l2-6 4 12 2-6h6" />
                </svg>
              </span>
              <h3>Copy-trading participant</h3>
              <p>
                Open and fund an eligible personal broker account, review the risk disclosures,
                choose approved settings, and connect to the verified managed strategy.
              </p>
            </article>
            <article className="path-card">
              <span>PATH B</span>
              <span className="path-icon">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </span>
              <h3>Community partner</h3>
              <p>
                Refer and support eligible members under approved Community Rewards terms. Rewards
                depend on qualification and activity and are never guaranteed.
              </p>
            </article>
          </div>
          <div className="community-panel">
            <div>
              <p className="eyebrow eyebrow-light">Community program</p>
              <h3>Built for transparent participation.</h3>
              <p className="community-copy">
                Copinex operates a qualification-based community referral and leadership program.
                Full terms, eligibility rules, reward calculations, examples, and income disclosures
                are published in the member portal after legal review.
              </p>
              <Link className="btn" href="/register">
                Join the program <ArrowIcon />
              </Link>
            </div>
            <ul className="clarification-list">
              <li>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m5 12 4 4 10-10" />
                </svg>
                You do not need to recruit people to hold a personal broker account or understand the trading service.
              </li>
              <li>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m5 12 4 4 10-10" />
                </svg>
                Community rewards are not investment returns.
              </li>
              <li>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m5 12 4 4 10-10" />
                </svg>
                Trading profit share applies only if realized profit occurs under approved terms.
              </li>
              <li>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m5 12 4 4 10-10" />
                </svg>
                No reward is paid on a client's underlying trading principal.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <section className="section" id="faq">
        <div className="shell faq-layout">
          <div className="section-heading">
            <p className="eyebrow">FAQ</p>
            <h2>Clear answers. Honest unknowns.</h2>
            <p>The essentials about custody, risk, connection, and eligibility.</p>
          </div>
          <div className="faq-list">
            <details className="faq-item">
              <summary>Does Copinex hold my trading funds?</summary>
              <div className="faq-answer">
                <p>
                  No. Trading capital remains in your personal account with the approved broker.
                  You fund and withdraw through the broker, not Copinex.
                </p>
              </div>
            </details>
            <details className="faq-item">
              <summary>Is any trading return guaranteed?</summary>
              <div className="faq-answer">
                <p>
                  No. Trading losses are possible. Risk controls are designed to manage exposure,
                  but they cannot guarantee a return or eliminate loss.
                </p>
              </div>
            </details>
            <details className="faq-item">
              <summary>What is the difference between the membership fee and broker funding?</summary>
              <div className="faq-answer">
                <p>
                  The membership fee is a separate Copinex membership transaction. Broker funding is
                  trading capital placed directly into your own broker account. They must never be
                  combined or paid through the same unverified path.
                </p>
              </div>
            </details>
            <details className="faq-item">
              <summary>How do I connect to the Copinex strategy?</summary>
              <div className="faq-answer">
                <p>
                  The connection method is verified through the member portal. Exact steps appear
                  after the method, strategy identity, broker server, disclosures, and official URLs
                  are confirmed.
                </p>
              </div>
            </details>
            <details className="faq-item">
              <summary>Can I pause or stop copying?</summary>
              <div className="faq-answer">
                <p>
                  The intended experience includes pause, resume, and disconnect controls. The exact
                  verified steps are defined in the approved connection guide and agreement.
                </p>
              </div>
            </details>
            <details className="faq-item">
              <summary>What risks can the controls not remove?</summary>
              <div className="faq-answer">
                <p>
                  Controls cannot eliminate market loss, leverage effects, slippage, price gaps,
                  outages, liquidity constraints, broker risk, synchronization differences, or
                  changing market conditions.
                </p>
              </div>
            </details>
            <details className="faq-item">
              <summary>Which countries are eligible?</summary>
              <div className="faq-answer">
                <p>
                  Operating and restricted jurisdictions are not configured. Eligibility will depend
                  on applicable law, broker availability, sanctions screening, age, and approved
                  operating rules.
                </p>
              </div>
            </details>
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────── */}
      <section className="final-cta">
        <div className="shell final-inner">
          <div className="final-copy">
            <p className="eyebrow eyebrow-light">Take the next informed step</p>
            <h2>Ready to understand the system?</h2>
            <p>
              Review how Copinex works, understand the risks, and complete each verified onboarding
              step at your own pace.
            </p>
          </div>
          <div className="final-actions">
            <Link className="btn btn-light" href="/register">
              Create account <ArrowIcon />
            </Link>
            <Link className="btn btn-outline" href="#faq">
              Read the FAQ
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}