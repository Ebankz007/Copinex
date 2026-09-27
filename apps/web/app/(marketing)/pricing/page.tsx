import Link from "next/link";
import { PageHero } from "@/components/page-hero";

export const metadata = {
  title: "Pricing — Copinex",
  description:
    "Copinex pricing: a one-time $50 membership fee, profit-share settlements, and a qualification-based community rewards program.",
};

const ROWS = [
  {
    item: "Membership fee",
    detail: "One-time $50 activation fee (paid once, unlocks withdrawals, investments & PAMM)",
    cost: "$50",
  },
  {
    item: "Investment packages",
    detail: "90-day packages from $50 — daily profit accrual, monthly profit share, principal returned at maturity",
    cost: "From $50",
  },
  {
    item: "Profit share",
    detail: "Settlement splits realized profit 60% client / 10% sponsor / 30% company",
    cost: "60 / 10 / 30",
  },
  {
    item: "Direct referral bonus",
    detail: "Paid to your sponsor on your first registration",
    cost: "$15",
  },
  {
    item: "Generation bonuses",
    detail: "Paid on deeper levels of your network",
    cost: "$2 / level",
  },
  {
    item: "Community rewards",
    detail: "Qualification-based, never guaranteed",
    cost: "Variable",
  },
  {
    item: "Withdrawals",
    detail: "Manual USDT settlement by operations after approval",
    cost: "Included",
  },
];

export default function PricingPage() {
  return (
    <main>
      <PageHero
        eyebrow="Pricing"
        title="Simple, transparent costs. No hidden fees."
        body="One membership fee. Investment packages with a defined profit-share structure. A community program with published rules."
      />

      <section className="section">
        <div className="shell">
          <div className="split-heading">
            <div className="section-heading">
              <p className="eyebrow">Fee structure</p>
              <h2>What things cost, and what they are not.</h2>
              <p>
                The membership fee is not trading capital. Broker funding is never paid to Copinex.
                Every number here is the number that applies.
              </p>
            </div>
            <aside className="boundary-note">
              <strong>IMPORTANT</strong>
              <p>
                No return or income is guaranteed. Risk controls manage exposure; they cannot
                eliminate loss. Only commit funds you can afford to place at risk.
              </p>
            </aside>
          </div>

          <div
            style={{
              marginTop: 44,
              border: "1px solid var(--line)",
              borderRadius: "var(--radius)",
              background: "var(--white)",
              boxShadow: "var(--shadow)",
              overflow: "hidden",
            }}
          >
            {ROWS.map((row, i) => (
              <div
                key={row.item}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0, 1.1fr) minmax(0, 1.6fr) auto",
                  gap: 20,
                  alignItems: "center",
                  padding: "18px 24px",
                  borderTop: i === 0 ? "none" : "1px solid var(--line)",
                }}
              >
                <strong style={{ color: "var(--navy-950)", fontSize: 15 }}>{row.item}</strong>
                <span style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.55 }}>{row.detail}</span>
                <span
                  style={{
                    padding: "6px 13px",
                    borderRadius: 999,
                    background: "var(--soft)",
                    color: "var(--blue-600)",
                    fontSize: 13,
                    fontWeight: 900,
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.cost}
                </span>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 36, textAlign: "center" }}>
            <Link href="/register" className="btn">
              Start with the $50 membership
            </Link>
            <p style={{ marginTop: 14, color: "var(--muted)", fontSize: 13 }}>
              Commissions flow from day one — activation unlocks withdrawals, investments &amp; PAMM.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}