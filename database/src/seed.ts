/**
 * Seed — investment packages + policy config.
 *
 * The five tiers mirror @copinex/engine INVESTMENT_PACKAGES exactly
 * (single source of truth for the math). Config rows let admins override
 * the commission split / accrual windows without redeploying.
 *
 * Usage: pnpm --filter @copinex/database seed
 * Requires DATABASE_URL (defaults to the local dev DB on :5433).
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { INVESTMENT_PACKAGES } from '@copinex/engine';
import * as schema from './schema.js';

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgresql://copinex:copinex_dev_password@127.0.0.1:5433/copinex',
});

const db = drizzle(pool, { schema });

const PACKAGE_DESCRIPTIONS: Record<number, string> = {
  1: '10% monthly return. Invest $50 – $499.',
  2: '11% monthly return. Invest $500 – $999.',
  3: '12% monthly return. Invest $1,000 – $1,999.',
  4: '13.5% monthly return. Invest $2,000 – $4,999.',
  5: '15% monthly return. Invest $5,000 and above.',
};

async function main() {
  // ── Investment packages ─────────────────────────────
  for (const p of INVESTMENT_PACKAGES) {
    await db
      .insert(schema.investmentPackages)
      .values({
        tier: p.tier,
        name: p.name,
        minAmountCents: p.minAmountCents,
        maxAmountCents: p.maxAmountCents,
        monthlyRateBps: p.monthlyRateBps,
        dailyRateBps: p.dailyRateBps,
        status: 'ACTIVE',
        description: PACKAGE_DESCRIPTIONS[p.tier],
      })
      .onConflictDoNothing({ target: schema.investmentPackages.tier });
  }

  // ── Policy config (admins can override; engine constants are the fallback) ──
  const configRows = [
    {
      key: 'investment.uplineCommissionRateBps',
      value: 2000,
      description: 'Additional % of monthly profit paid to the upline chain (2000 = 20%).',
    },
    {
      key: 'investment.uplineCommissionSplit',
      value: { directSponsor: 5000, gen2: 2000, gen3: 1000, gen4: 750, gen5: 750, gen6: 500 },
      description: 'Split of the 20% pool across upline levels 1–6 (bps, sum = 10000).',
    },
    {
      key: 'investment.dailyAccrualDays',
      value: 90,
      description: 'Days of daily profit accrual at the start of an investment.',
    },
    {
      key: 'investment.availableAfterDays',
      value: 90,
      description: 'Settlement period: days until the first 90 days of profit become withdrawable.',
    },
  ];
  for (const row of configRows) {
    await db
      .insert(schema.config)
      .values({ ...row, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: schema.config.key,
        set: { value: row.value, description: row.description, updatedAt: new Date() },
      });
  }

  console.log(`Seeded ${INVESTMENT_PACKAGES.length} investment packages + ${configRows.length} config rows.`);
  await pool.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});