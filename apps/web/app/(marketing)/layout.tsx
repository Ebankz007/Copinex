import Link from "next/link";
import "./marketing.css";
import { SiteHeader } from "@/components/site-header";

/**
 * Marketing shell — the official Copinex light design (risk bar, sticky
 * header, navy footer). Used by the public site and the pre-login auth pages.
 */
export default function MarketingLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="marketing">
      <div className="risk-bar" role="note" aria-label="Trading risk notice">
        <div className="shell risk-inner">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
          <p>Forex and CFD trading involves substantial risk and may result in loss. Returns and referral income are not guaranteed.</p>
          <a href="#risk-note">Risk notice</a>
        </div>
      </div>

      <SiteHeader />

      {children}

      <footer className="site-footer" id="risk-note">
        <div className="shell footer-top">
          <div className="footer-brand">
            <Link href="/" className="wordmark" aria-label="Copinex home">
              <span className="wordmark-name">COPINEX</span>
              <span className="wordmark-note">Copy · Trade · Grow</span>
            </Link>
            <p>
              AI-assisted copy-trading technology designed around visible controls,
              personal broker custody, and responsible participation.
            </p>
          </div>
          <nav className="footer-nav" aria-label="Footer navigation">
            <div>
              <h2>Explore</h2>
              <Link href="/#how-it-works">How it works</Link>
              <Link href="/#technology">Technology</Link>
              <Link href="/#safety">Safety &amp; control</Link>
            </div>
            <div>
              <h2>Company</h2>
              <Link href="/#community">Community</Link>
              <Link href="/faq">FAQ</Link>
              <Link href="/contact">Contact</Link>
            </div>
            <div>
              <h2>Legal</h2>
              <span>Terms · Pending</span>
              <span>Privacy · Pending</span>
              <span>Risk disclosure · Pending</span>
            </div>
          </nav>
        </div>
        <div className="shell prelaunch-status">
          <div>
            <span>Platform status</span>
            <strong>Live — registration and member portal are open</strong>
          </div>
          <p>Only commit funds you can afford to place at risk.</p>
        </div>
        <div className="shell footer-bottom">
          <p className="footer-risk">
            Forex and CFD trading involves substantial risk and may not be suitable for everyone.
            Leverage can magnify gains and losses. Past performance is not indicative of future
            results. Copinex does not guarantee trading returns, referral income, rank achievement,
            or rewards. Only commit funds you can afford to place at risk. Information on this
            website is general and does not consider your personal objectives or financial
            circumstances.
          </p>
          <div className="footer-meta">
            <span>© 2026 Copinex</span>
            <span>Copy. Trade. Grow.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}