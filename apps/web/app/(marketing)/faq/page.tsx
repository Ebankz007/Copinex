import Link from "next/link";
import { PageHero } from "@/components/page-hero";

export const metadata = {
  title: "FAQ — Copinex",
  description:
    "Frequently asked questions about Copinex: custody, risk, the membership fee, broker funding, connection, and eligibility.",
};

const FAQS = [
  {
    q: "Does Copinex hold my trading funds?",
    a: "No. Trading capital remains in your personal account with the approved broker. You fund and withdraw through the broker, not Copinex.",
  },
  {
    q: "Is any trading return guaranteed?",
    a: "No. Trading losses are possible. Risk controls are designed to manage exposure, but they cannot guarantee a return or eliminate loss.",
  },
  {
    q: "What is the difference between the membership fee and broker funding?",
    a: "The membership fee is a separate Copinex membership transaction. Broker funding is trading capital placed directly into your own broker account. They must never be combined or paid through the same unverified path.",
  },
  {
    q: "How do I connect to the Copinex strategy?",
    a: "The connection method is verified through the member portal. Exact steps appear after the method, strategy identity, broker server, disclosures, and official URLs are confirmed.",
  },
  {
    q: "Can I pause or stop copying?",
    a: "The intended experience includes pause, resume, and disconnect controls. The exact verified steps are defined in the approved connection guide and agreement.",
  },
  {
    q: "What risks can the controls not remove?",
    a: "Controls cannot eliminate market loss, leverage effects, slippage, price gaps, outages, liquidity constraints, broker risk, synchronization differences, or changing market conditions.",
  },
  {
    q: "Which countries are eligible?",
    a: "Operating and restricted jurisdictions are not configured. Eligibility will depend on applicable law, broker availability, sanctions screening, age, and approved operating rules.",
  },
  {
    q: "What is the 90-day settlement period?",
    a: "Investment packages accrue daily profit over 90 days. Profit becomes available after the settlement period, and a monthly profit share is credited according to the published schedule.",
  },
  {
    q: "Do I need to recruit people to participate?",
    a: "No. You do not need to recruit people to hold a personal broker account or understand the trading service. Community rewards are a separate, qualification-based program.",
  },
];

export default function FaqPage() {
  return (
    <main>
      <PageHero
        eyebrow="FAQ"
        title="Clear answers. Honest unknowns."
        body="The essentials about custody, risk, connection, membership, and eligibility — in plain language."
      />

      <section className="section">
        <div className="shell faq-layout">
          <div className="section-heading">
            <p className="eyebrow">Frequently asked</p>
            <h2>Everything you asked us, answered straight.</h2>
            <p>
              If your question is not here, reach out through the member portal or the contact page.
            </p>
            <div style={{ marginTop: 28 }}>
              <Link href="/contact" className="btn">
                Contact us
              </Link>
            </div>
          </div>
          <div className="faq-list">
            {FAQS.map((f) => (
              <details key={f.q} className="faq-item">
                <summary>{f.q}</summary>
                <div className="faq-answer">
                  <p>{f.a}</p>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}