/**
 * Demo data layer — used when no API token is present (no login UI yet).
 * All projections are computed by @copinex/engine, the SAME math the backend
 * runs, so the demo is always numerically honest. UI shows a DEMO badge.
 */
import {
  AVAILABLE_AFTER_DAYS,
  DAILY_ACCRUAL_DAYS,
  INVESTMENT_PACKAGES,
  addDays,
  computeDailyProfitCents,
  computeMonthlyProfitCents,
  getPackageForAmount,
} from "@copinex/engine";
import type { InvestmentDto, PackageDto } from "./api";

export const DEMO = true;

export function getDemoPackages(): PackageDto[] {
  return INVESTMENT_PACKAGES.map((p) => ({
    id: `demo-pkg-${p.tier}`,
    tier: p.tier,
    name: p.name,
    minAmountCents: p.minAmountCents,
    maxAmountCents: p.maxAmountCents,
    monthlyRateBps: p.monthlyRateBps,
    dailyRateBps: p.dailyRateBps,
    description: `Invest from $${(p.minAmountCents / 100).toLocaleString()}${p.maxAmountCents ? ` to $${(p.maxAmountCents / 100).toLocaleString()}` : "+"}.`,
  }));
}

export function getDemoWallet() {
  return { availableCents: 12970, lockedCents: 0 };
}

export function getDemoInvestments(): InvestmentDto[] {
  const now = new Date();
  const pkg = getPackageForAmount(10000)!;
  const daily = computeDailyProfitCents(10000, pkg.dailyRateBps);
  return [
    {
      investment: {
        id: "demo-inv-1",
        principalCents: 10000,
        status: "ACTIVE",
        startDate: addDays(now, -24).toISOString(),
        accrualEndDate: addDays(now, 66).toISOString(),
        availableDate: addDays(now, 75).toISOString(),
      },
      package: { ...pkg, id: "demo-pkg-1", description: null },
      summary: { totalEarnedCents: 24 * daily, availableCents: 0, lockedCents: 24 * daily },
    },
  ];
}

export function createDemoInvestment(amountCents: number) {
  const pkg = getPackageForAmount(amountCents);
  if (!pkg) throw new Error("Amount must be at least $50");
  const daily = computeDailyProfitCents(amountCents, pkg.dailyRateBps);
  const monthly = computeMonthlyProfitCents(amountCents, pkg.monthlyRateBps);
  const now = new Date();
  return {
    investment: {
      id: `demo-inv-${Date.now()}`,
      principalCents: amountCents,
      status: "ACTIVE" as const,
      startDate: now.toISOString(),
      accrualEndDate: addDays(now, DAILY_ACCRUAL_DAYS).toISOString(),
      availableDate: addDays(now, AVAILABLE_AFTER_DAYS).toISOString(),
    },
    package: { ...pkg, id: `demo-pkg-${pkg.tier}`, description: null },
    schedule: {
      dailyCredits: Array.from({ length: DAILY_ACCRUAL_DAYS }, (_, i) => ({
        day: i + 1,
        amountCents: daily,
        creditedAt: addDays(now, i + 1).toISOString(),
        availableAt: addDays(now, AVAILABLE_AFTER_DAYS).toISOString(),
      })),
      monthlyProfitCents: monthly,
    },
  };
}