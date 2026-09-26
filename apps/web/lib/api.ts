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

/** GET /api/wallets — both wallets + pending holds. */
export interface WalletBalances {
  wallets: {
    walletType: "COPINEX" | "WITHDRAWAL";
    balanceCents: number;
  }[];
  pendingHoldsCents: number;
}

export interface LedgerEntryDto {
  id: string;
  walletType: "COPINEX" | "WITHDRAWAL";
  type: string;
  amountCents: number;
  balanceAfterCents: number;
  sourceType: string;
  createdAt: string;
}

export interface PaymentDto {
  id: string;
  purpose: "ACTIVATION" | "DEPOSIT";
  amountCents: number;
  currency: string;
  status: "PENDING" | "PAID" | "EXPIRED" | "FAILED";
  paymentRef: string;
  gatewayTxid: string | null;
  paymentUrl: string | null;
  txHash: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface WithdrawalRequestDto {
  id: string;
  walletType: "COPINEX" | "WITHDRAWAL";
  amountCents: number;
  status: "PENDING" | "PAID" | "REJECTED";
  payoutTxid: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface UserDto {
  id: string;
  email: string;
  fullName: string | null;
  role: "MEMBER" | "ADMIN";
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  sponsorId: string | null;
  membershipActivated: boolean;
  activatedAt: string | null;
  createdAt: string;
}

export interface BrokerDto {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
}

export interface BrokerAdminDto extends BrokerDto {
  pammLink: string;
}

export interface PammConnectionDto {
  id: string;
  status: "REQUESTED" | "LINKED";
  createdAt: string;
  broker: { id: string; name: string; code: string };
}

const TOKEN_KEY = "copinex_token";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  window.localStorage.removeItem(TOKEN_KEY);
}

export function isDemoMode(): boolean {
  return getToken() === null;
}

/** The logged-in user, or null in demo mode. */
export async function fetchMe(): Promise<UserDto | null> {
  if (isDemoMode()) return null;
  try {
    const data = await request<{ user: UserDto }>("/auth/me");
    return data.user;
  } catch {
    // Expired/invalid token — treat as demo rather than crash the page.
    clearToken();
    return null;
  }
}

export async function login(email: string, password: string): Promise<{ token: string; user: UserDto }> {
  const data = await request<{ token: string; user: UserDto }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

export async function register(input: {
  email: string;
  password: string;
  fullName?: string;
  sponsorId?: string;
}): Promise<{ token: string; user: UserDto }> {
  const data = await request<{ token: string; user: UserDto }>("/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  setToken(data.token);
  return data;
}

export function logout(): void {
  clearToken();
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

// ── PAMM service ───────────────────────────────────────

/** Public partner-broker directory (active only). */
export async function fetchBrokers(): Promise<BrokerDto[]> {
  const data = await request<{ brokers: BrokerDto[] }>("/brokers");
  return data.brokers;
}

/** Submit a PAMM connection request → returns the broker's private link. */
export async function requestPammConnection(brokerId: string) {
  return request<{ connection: PammConnectionDto; redirectUrl: string }>(
    "/pamm/connections",
    {
      method: "POST",
      body: JSON.stringify({ brokerId }),
    },
  );
}

/** The client's own connection requests. */
export async function fetchMyConnections(): Promise<PammConnectionDto[]> {
  const data = await request<{ connections: PammConnectionDto[] }>("/pamm/connections");
  return data.connections;
}

// ── PAMM service (admin) ───────────────────────────────

export async function fetchAllBrokers(): Promise<BrokerAdminDto[]> {
  const data = await request<{ brokers: BrokerAdminDto[] }>("/admin/brokers");
  return data.brokers;
}

export async function createBroker(input: {
  name: string;
  code: string;
  pammLink: string;
}): Promise<BrokerAdminDto> {
  const data = await request<{ broker: BrokerAdminDto }>("/admin/brokers", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.broker;
}

export async function removeBroker(brokerId: string): Promise<BrokerAdminDto> {
  const data = await request<{ broker: BrokerAdminDto }>(
    `/admin/brokers/${brokerId}`,
    { method: "DELETE" },
  );
  return data.broker;
}

export async function fetchAllConnections(): Promise<PammConnectionDto[]> {
  const data = await request<{ connections: PammConnectionDto[] }>(
    "/admin/pamm/connections",
  );
  return data.connections;
}

// ── Wallet & payments (transaction hub) ────────────────

/** Both wallet balances + pending withdrawal holds. */
export async function fetchWalletBalances(): Promise<WalletBalances> {
  return request<WalletBalances>("/wallets");
}

/** Ledger history (both wallets), newest first. */
export async function fetchLedger(): Promise<LedgerEntryDto[]> {
  const data = await request<{ entries: LedgerEntryDto[] }>("/wallets/ledger");
  return data.entries;
}

/** The member's payment history (activation fee + deposits). */
export async function fetchMyPayments(): Promise<PaymentDto[]> {
  const data = await request<{ payments: PaymentDto[] }>("/payments");
  return data.payments;
}

/** Create the $50 ACTIVATION invoice → returns the checkout URL. */
export async function createActivationPayment(): Promise<PaymentDto> {
  const data = await request<{ payment: PaymentDto }>("/payments/activate", {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.payment;
}

/** Create a DEPOSIT invoice → credits the COPINEX wallet on confirmation. */
export async function createDepositPayment(amountCents: number): Promise<PaymentDto> {
  const data = await request<{ payment: PaymentDto }>("/payments/deposit", {
    method: "POST",
    body: JSON.stringify({ amountCents }),
  });
  return data.payment;
}

/** Request a withdrawal: funds are held, admin approves or rejects. */
export async function submitWithdrawal(
  walletType: "COPINEX" | "WITHDRAWAL",
  amountCents: number,
): Promise<WithdrawalRequestDto> {
  const data = await request<{ request: WithdrawalRequestDto }>("/wallets/withdraw", {
    method: "POST",
    body: JSON.stringify({ walletType, amountCents }),
  });
  return data.request;
}

/** The member's own withdrawal requests. */
export async function fetchMyWithdrawals(): Promise<WithdrawalRequestDto[]> {
  const data = await request<{ requests: WithdrawalRequestDto[] }>("/wallets/withdrawals");
  return data.requests;
}