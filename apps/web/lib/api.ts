/**
 * API client. Uses the Bearer token from localStorage when present.
 * Without a token (no login UI yet) the data layer falls back to the
 * engine-computed demo data — clearly badged in the UI.
 */
import {
  createDemoInvestment,
  getDemoInvestments,
  getDemoPackages,
  getDemoWallet,
} from "./demo";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface PackageDto {
  id: string;
  tier: number;
  name: string;
  minAmountCents: number;
  maxAmountCents: number | null;
  monthlyRateBps: number;
  dailyRateBps: number;
  description: string | null;
}

export interface InvestmentDto {
  investment: {
    id: string;
    principalCents: number;
    status: "ACTIVE" | "MATURED" | "CLOSED";
    startDate: string;
    accrualEndDate: string;
    availableDate: string;
  };
  package: PackageDto;
  summary: { totalEarnedCents: number; availableCents: number; lockedCents: number };
}

export interface WalletSummary {
  availableCents: number;
  lockedCents: number;
  totalCents: number;
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem("copinex_token");
}

export function isDemoMode(): boolean {
  return getToken() === null;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    let body: { error?: string; message?: string } | null = null;
    try {
      body = (await res.json()) as { error?: string; message?: string };
    } catch {
      // non-JSON error body
    }
    throw new ApiError(res.status, body?.error ?? "REQUEST_ERROR", body?.message ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export async function fetchPackages(): Promise<PackageDto[]> {
  if (isDemoMode()) return getDemoPackages();
  const data = await request<{ packages: PackageDto[] }>("/investments/packages");
  return data.packages;
}

export async function fetchWallet(): Promise<WalletSummary> {
  if (isDemoMode()) return { ...getDemoWallet(), totalCents: 12970 };
  const data = await request<{ wallet: WalletSummary }>("/investments/wallet");
  return data.wallet;
}

export async function fetchInvestments(): Promise<InvestmentDto[]> {
  if (isDemoMode()) return getDemoInvestments();
  const data = await request<{ investments: InvestmentDto[] }>("/investments");
  return data.investments;
}

export async function startInvestment(amountCents: number) {
  if (isDemoMode()) return createDemoInvestment(amountCents);
  return request<{
    investment: InvestmentDto["investment"];
    package: PackageDto;
    schedule: { dailyCredits: unknown[]; monthlyProfitCents: number };
  }>("/investments", {
    method: "POST",
    body: JSON.stringify({ amountCents }),
  });
}