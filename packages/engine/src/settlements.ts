/**
 * Copinex Compensation Engine — Trading Settlement (§7)
 *
 * Realized trading profit splits 60/10/30 (client / sponsor / company), and
 * ONLY when realized profit > 0 — a loss or breakeven period pays nobody.
 *
 * Earning rule (Henry, 2026-09-26): the sponsor's 10% performance share is paid
 * to the natural direct sponsor regardless of Active status. No compression, no
 * sponsor override — every account earns.
 *
 * When the client has no direct sponsor, the 10% share is NOT paid (unallocated)
 * and reverts to the company — the caller credits it to the company bucket.
 */
import { distributeTradingProfitShare } from './allocation.js';
import type { UplineMember } from './types.js';

/** Decision for the sponsor's 10% performance share. */
export interface SponsorOverridePayout {
  recipientId: string | null;
  amountCents: number;
  /** True when the client has no direct sponsor — the share reverts to the company. */
  unallocated: boolean;
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
): SponsorOverridePayout {
  if (!Number.isInteger(sponsorShareCents) || sponsorShareCents < 0) {
    throw new Error(
      `computeSponsorOverridePayout: sponsorShareCents must be a non-negative integer, got ${sponsorShareCents}`,
    );
  }

  const sponsor = chain.find((m) => m.level === 1);
  return sponsor
    ? { recipientId: sponsor.userId, amountCents: sponsorShareCents, unallocated: false }
    : { recipientId: null, amountCents: sponsorShareCents, unallocated: true };
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
): TradingSettlement | null {
  const shares = distributeTradingProfitShare(periodRealizedProfitCents);
  if (!shares) return null;
  const sponsorOverride = computeSponsorOverridePayout(shares.sponsorCents, chain);
  return { clientCents: shares.clientCents, sponsorOverride, companyCents: shares.companyCents };
}