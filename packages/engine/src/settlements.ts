/**
 * Copinex Compensation Engine — Trading Settlement (§7)
 *
 * Realized trading profit splits 60/10/30 (client / sponsor / company), and
 * ONLY when realized profit > 0 — a loss or breakeven period pays nobody.
 *
 * Documented assumption (flagged in the audit, §7 open question): the sponsor's
 * 10% performance share is ACTIVE-gated and compresses exactly like the Direct
 * Referral Bonus (§3) — inactive sponsor → next qualified upline. The gate is
 * config-driven: requireActive=false pays the natural sponsor regardless.
 *
 * When no qualified upline exists, the 10% share is NOT paid (unallocated) and
 * reverts to the company — the caller credits it to the company bucket.
 */
import { distributeTradingProfitShare } from './allocation.js';
import { resolveQualifiedUpline } from './compression.js';
import type { UplineMember } from './types.js';

/** Decision for the sponsor's 10% performance share. */
export interface SponsorOverridePayout {
  recipientId: string | null;
  amountCents: number;
  /** True when inactive members were skipped to reach the recipient. */
  compressed: boolean;
  /** True when no qualified upline exists — the share reverts to the company. */
  unallocated: boolean;
}

/** Options for the §7 sponsor override gate. */
export interface SponsorOverrideOptions {
  /** Gate the share on Active status + compression. Default: true. */
  requireActive?: boolean;
}

/**
 * §7 — Decide the sponsor's 10% performance share for one settlement.
 *
 * @param sponsorShareCents The 10% share from distributeTradingProfitShare.
 * @param chain The client's sponsor chain (level 1 = direct sponsor).
 */
export function computeSponsorOverridePayout(
  sponsorShareCents: number,
  chain: UplineMember[],
  opts: SponsorOverrideOptions = {},
): SponsorOverridePayout {
  const { requireActive = true } = opts;
  if (!Number.isInteger(sponsorShareCents) || sponsorShareCents < 0) {
    throw new Error(
      `computeSponsorOverridePayout: sponsorShareCents must be a non-negative integer, got ${sponsorShareCents}`,
    );
  }

  if (!requireActive) {
    const sponsor = chain.find((m) => m.level === 1);
    return sponsor
      ? { recipientId: sponsor.userId, amountCents: sponsorShareCents, compressed: false, unallocated: false }
      : { recipientId: null, amountCents: sponsorShareCents, compressed: false, unallocated: true };
  }

  const qualified = resolveQualifiedUpline(chain, 1);
  if (!qualified) {
    return { recipientId: null, amountCents: sponsorShareCents, compressed: false, unallocated: true };
  }
  return {
    recipientId: qualified.member.userId,
    amountCents: sponsorShareCents,
    compressed: qualified.compressed,
    unallocated: false,
  };
}

/** The full §7 settlement decision for one client in one period. */
export interface TradingSettlement {
  clientCents: number;
  sponsorOverride: SponsorOverridePayout;
  /** The company's 30% share (before any unallocated sponsor share reverts). */
  companyCents: number;
}

/**
 * §7 — Compute the full settlement for a client's realized period profit.
 *
 * @returns null when profit <= 0 (no split, nobody paid).
 */
export function computeTradingSettlement(
  periodRealizedProfitCents: number,
  chain: UplineMember[],
  opts: SponsorOverrideOptions = {},
): TradingSettlement | null {
  const shares = distributeTradingProfitShare(periodRealizedProfitCents);
  if (!shares) return null;
  const sponsorOverride = computeSponsorOverridePayout(shares.sponsorCents, chain, opts);
  return { clientCents: shares.clientCents, sponsorOverride, companyCents: shares.companyCents };
}