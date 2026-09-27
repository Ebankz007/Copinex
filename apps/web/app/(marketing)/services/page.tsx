import Link from "next/link";
import { PageHero } from "@/components/page-hero";

export const metadata = {
  title: "Services — Copinex",
  description:
    "Copinex services: the AI Analysis Engine, the Trade & Risk Engine, MT5 copy integration, and the Community Rewards program.",
};

const SERVICES = [
  {
    kicker: "01 · ANALYSIS",
    title: "AI Analysis Engine",
    body: "Continuously evaluates selected market conditions and supports strategy decisions with data. AI assists the process; it does not guarantee an outcome.",
  },
  {
    kicker: "02 · EXECUTION",
    title: "Trade & Risk Engine",
    body: "Applies position sizing, execution rules, drawdown monitoring, and defined exit controls to every copied position.",
  },
  {
    kicker: "03 · CONNECTION",
    title: "MT5 Copy Integration",
    body: "Connects an eligible personal broker account to the verified Copinex managed strategy for visible, automated execution.",
  },
  {
    kicker: "04 · COMMUNITY",
    title: "Community Rewards",
    body: "A qualification-based referral and leadership program. Rewards depend on qualification and activity and are never guaranteed.",
  },
  {
    kicker: "05 · OVERSIGHT",
    title: "Professional Review",
    body: "A human review layer sits between the analysis engine and execution, so intelligence passes through discipline.",
  },
  {
    kicker: "06 · CONTROL",
    title: "Member Portal",
    body: "Monitor balances, investments, network activity, and notifications — and manage your account from one place.",
  },
];

export default function ServicesPage() {
  return (
    <main>
      <PageHero
        eyebrow="Services"
        title="One disciplined pipeline from signal to execution."
        body="Every Copinex service exists to keep your capital visible, your risk managed, and your participation responsible."
      />

      <section className="section">
        <div className="shell">
          <div className="control-grid is-auto">
            {SERVICES.map((s) => (
              <article key={s.title} className="control-card">
                <span className="control-icon">
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" />
                  </svg>
                </span>
                <p style={{ marginTop: 16, color: "var(--blue-600)", fontSize: 12, fontWeight: 900, letterSpacing: "0.14em" }}>
                  {s.kicker}
                </p>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </article>
            ))}
          </div>

          <div className="community-panel" style={{ marginTop: 44 }}>
            <div>
              <p className="eyebrow eyebrow-light">Get started</p>
              <h3>Ready to see it working?</h3>
              <p className="community-copy">
                Create your account, complete onboarding, and explore the member portal. The $50
                membership fee unlocks withdrawals, investments, and PAMM — commissions flow from
                day one.
              </p>
              <Link href="/register" className="btn">
                Create account
              </Link>
            </div>
            <ul className="clarification-list">
              <li>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m5 12 4 4 10-10" />
                </svg>
                The membership fee is not trading capital.
              </li>
              <li>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m5 12 4 4 10-10" />
                </svg>
                Broker funding is placed directly into your own broker account.
              </li>
              <li>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m5 12 4 4 10-10" />
                </svg>
                No return, income, or reward is guaranteed.
              </li>
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}