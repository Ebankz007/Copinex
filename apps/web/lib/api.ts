/**
 * API client. The session token lives in an httpOnly cookie (set and cleared
 * by the API) — JavaScript never sees it, which closes the
 * localStorage-exfiltration hole. What the UI needs is only the *presence*
 * signal, via the readable `copinex_authed` flag cookie.
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

/**
 * Role hierarchy: SUPERADMIN > ADMIN > MEMBER. Mirrors
 * apps/api/src/lib/roles.ts — keep the two in step.
 */
export type UserRole = "MEMBER" | "ADMIN" | "SUPERADMIN";

/** ADMIN and SUPERADMIN both reach the admin console. */
export function isAdminRole(role: UserRole | undefined | null): boolean {
  return role === "ADMIN" || role === "SUPERADMIN";
}

export interface UserDto {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  sponsorId: string | null;
  membershipActivated: boolean;
  activatedAt: string | null;
  totpEnabled: boolean;
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

const AUTH_FLAG = "copinex_authed";

/**
 * Presence signal only — it confers nothing. Every request is authenticated
 * server-side against the httpOnly session cookie, which document.cookie,
 * devtools, and injected scripts alike cannot read.
 */
function hasAuthFlag(): boolean {
  if (typeof document === "undefined") return false;
  return document.cookie
    .split(";")
    .some((part) => part.trim().startsWith(`${AUTH_FLAG}=`));
}

/** Drop the local presence signal (the API clears the real cookies). */
export function clearAuthFlag(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_FLAG}=; Max-Age=0; path=/`;
}

export function isDemoMode(): boolean {
  return !hasAuthFlag();
}

/** The logged-in user, or null in demo mode. */
export async function fetchMe(): Promise<UserDto | null> {
  if (isDemoMode()) return null;
  try {
    const data = await request<{ user: UserDto }>("/auth/me");
    return data.user;
  } catch {
    // Expired/invalid session — treat as demo rather than crash the page.
    clearAuthFlag();
    return null;
  }
}

/**
 * Login result is a three-way union: members WITHOUT 2FA get a session
 * immediately; members WITH 2FA get a 5-minute challenge; STAFF without an
 * enrolled second factor get an enrolment challenge that opens ONLY the
 * setup/enable endpoints. Callers must handle all three arms.
 */
export type LoginResult =
  | { requiresTwoFactor: true; challenge: string }
  | { requiresEnrollment: true; challenge: string }
  | { token: string; user: UserDto };

export async function login(email: string, password: string): Promise<LoginResult> {
  // No token handling here — the session arrives as httpOnly cookies on the
  // response, and the browser attaches them to every later call itself.
  return request<LoginResult>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
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
  return data;
}

/** Logout — revokes the session server-side, then clears the local token. */
export async function logout(): Promise<void> {
  await serverLogout();
}

async function request<T>(
  path: string,
  options: RequestInit & { bearer?: string } = {},
): Promise<T> {
  // Same-origin /api proxy: the browser attaches the httpOnly session cookie
  // itself. No Authorization header is ever constructed in JavaScript — there
  // is no token here to leak. The single exception is the staff-enrolment
  // challenge, passed explicitly as `bearer` (it is short-lived and authorises
  // only the setup/enable endpoints).
  const { bearer, ...init } = options;
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
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

/**
 * Fresh checkout URL for a PENDING payment: the stored link when young,
 * a brand-new gateway request when stale. The checkout button calls this
 * first so the member always lands on a live Pay2Crypto page.
 */
export async function refreshCheckout(paymentId: string): Promise<{ paymentUrl: string; refreshed: boolean }> {
  return request<{ paymentUrl: string; refreshed: boolean }>(`/payments/${paymentId}/checkout`, {
    method: "POST",
    body: JSON.stringify({}),
  });
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

// ── Admin console ──────────────────────────────────────

export interface AdminMemberDto {
  id: string;
  email: string;
  fullName: string | null;
  role: UserRole;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED";
  isActive: boolean;
  membershipActivated: boolean;
  activatedAt: string | null;
  emailVerifiedAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
}

export interface AdminInvestmentDto {
  id: string;
  userId: string;
  packageId: string;
  principalCents: number;
  status: "ACTIVE" | "MATURED" | "CLOSED";
  startDate: string;
  accrualEndDate: string;
  availableDate: string;
  createdAt: string;
}

export interface AdminWithdrawalDto {
  request: WithdrawalRequestDto & { userId: string };
  user: { id: string; email: string; fullName: string | null };
}

export interface AdminSettlementDto {
  id: string;
  period: string;
  clientId: string;
  realizedProfitCents: number;
  clientShareCents: number;
  sponsorShareCents: number;
  companyShareCents: number;
  status: "PENDING" | "PROCESSED" | "FAILED";
  createdAt: string;
}

export interface PoolDto {
  id: string;
  name: string;
  balanceCents: number;
  updatedAt: string;
}

export interface AuditEntryDto {
  id: string;
  adminId: string;
  adminEmail: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  details: unknown;
  ip: string;
  createdAt: string;
}

export async function fetchAdminMembers(activated?: boolean): Promise<AdminMemberDto[]> {
  const q = activated === undefined ? "" : `?activated=${activated}`;
  const data = await request<{ members: AdminMemberDto[] }>(`/admin/members${q}`);
  return data.members;
}

export async function activateMember(memberId: string): Promise<AdminMemberDto> {
  const data = await request<{ member: AdminMemberDto }>(`/admin/members/${memberId}/activate`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.member;
}

export async function fetchAdminInvestments(): Promise<AdminInvestmentDto[]> {
  const data = await request<{ investments: AdminInvestmentDto[] }>("/admin/investments");
  return data.investments;
}

export async function fetchAdminWithdrawals(status?: string): Promise<AdminWithdrawalDto[]> {
  const q = status ? `?status=${status}` : "";
  const data = await request<{ withdrawals: AdminWithdrawalDto[] }>(`/admin/wallets/withdrawals${q}`);
  return data.withdrawals;
}

export async function approveWithdrawal(
  requestId: string,
  payoutTxid?: string,
): Promise<WithdrawalRequestDto> {
  const data = await request<{ request: WithdrawalRequestDto }>(
    `/admin/wallets/withdrawals/${requestId}/approve`,
    { method: "POST", body: JSON.stringify({ payoutTxid }) },
  );
  return data.request;
}

export async function rejectWithdrawal(requestId: string): Promise<WithdrawalRequestDto> {
  const data = await request<{ request: WithdrawalRequestDto }>(
    `/admin/wallets/withdrawals/${requestId}/reject`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return data.request;
}

export async function fetchAdminSettlements(): Promise<AdminSettlementDto[]> {
  const data = await request<{ settlements: AdminSettlementDto[] }>("/admin/settlements");
  return data.settlements;
}

export async function fetchAdminPools(): Promise<PoolDto[]> {
  const data = await request<{ pools: PoolDto[] }>("/admin/pools");
  return data.pools;
}

export async function fetchAuditLog(limit = 100): Promise<AuditEntryDto[]> {
  const data = await request<{ entries: AuditEntryDto[] }>(`/admin/audit?limit=${limit}`);
  return data.entries;
}

// ── Account & security (auth surface) ──────────────────

export interface SessionDto {
  id: string;
  ip: string;
  userAgent: string | null;
  lastSeenAt: string;
  createdAt: string;
  revokedAt: string | null;
}

export interface NotificationDto {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Confirm an email-verification token (24h TTL). Throws if invalid/expired. */
export async function verifyEmail(token: string): Promise<void> {
  await request<{ verified: true }>("/auth/verify-email", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

/** Re-send the verification email (dev: the link is echoed back). */
export async function resendVerification(): Promise<{ link?: string }> {
  return request<{ link?: string }>("/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Always succeeds — never reveals whether an email exists. */
export async function forgotPassword(email: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

/** Reset the password with the emailed token (1h TTL). */
export async function resetPassword(token: string, newPassword: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}

/** Update the profile (fullName). */
export async function updateProfile(fullName: string | null): Promise<UserDto> {
  const data = await request<{ user: UserDto }>("/auth/profile", {
    method: "PATCH",
    body: JSON.stringify({ fullName }),
  });
  return data.user;
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ ok: true }> {
  return request<{ ok: true }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

/** Active sessions for the signed-in member. */
export async function fetchSessions(): Promise<SessionDto[]> {
  const data = await request<{ sessions: SessionDto[] }>("/auth/sessions");
  return data.sessions;
}

export async function revokeSession(sessionId: string): Promise<SessionDto> {
  const data = await request<{ session: SessionDto }>(`/auth/sessions/${sessionId}/revoke`, {
    method: "POST",
    body: JSON.stringify({}),
  });
  return data.session;
}

/** Logout server-side (revokes the session and drops the cookies), then clears the local presence flag. */
export async function serverLogout(): Promise<void> {
  try {
    await request<{ ok: true }>("/auth/logout", { method: "POST", body: JSON.stringify({}) });
  } finally {
    clearAuthFlag();
  }
}

// ── Two-factor authentication (TOTP) ───────────────────────

export interface TwoFactorSetup {
  otpauthUrl: string;
  manualKey: string;
}

/**
 * Pending staff-enrolment challenge, held in memory (never the URL — URLs
 * leak into history and logs). Set by the login form when the server answers
 * requiresEnrollment; consumed once by the enrol page.
 */
let pendingEnrollChallenge: string | null = null;

export function setPendingEnrollChallenge(challenge: string): void {
  pendingEnrollChallenge = challenge;
}

export function takePendingEnrollChallenge(): string | null {
  const challenge = pendingEnrollChallenge;
  pendingEnrollChallenge = null;
  return challenge;
}

/** Phase 1 over an enrolment challenge (no session exists yet). */
export async function enrollSetup(challenge: string): Promise<TwoFactorSetup> {
  return request<TwoFactorSetup>("/auth/2fa/setup", {
    method: "POST",
    bearer: challenge,
    body: JSON.stringify({}),
  });
}

/** Phase 2 over an enrolment challenge → backup codes AND the first session. */
export async function enrollEnable(
  challenge: string,
  token: string,
): Promise<{ backupCodes: string[]; token: string; user: UserDto }> {
  return request<{ backupCodes: string[]; token: string; user: UserDto }>("/auth/2fa/enable", {
    method: "POST",
    bearer: challenge,
    body: JSON.stringify({ token }),
  });
}

/** Phase 1: store an unenrolled secret, get it back for scanning. */
export async function setupTwoFactor(): Promise<TwoFactorSetup> {
  return request<TwoFactorSetup>("/auth/2fa/setup", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** Phase 2: confirm a live code → 2FA on, single-use backup codes returned once. */
export async function enableTwoFactor(token: string): Promise<{ backupCodes: string[] }> {
  return request<{ backupCodes: string[] }>("/auth/2fa/enable", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

/** Redeem a login challenge with a TOTP or backup code → session. */
export async function verifyTwoFactor(
  challenge: string,
  token: string,
): Promise<{ token: string; user: UserDto; viaBackupCode: boolean }> {
  const data = await request<{ token: string; user: UserDto; viaBackupCode: boolean }>(
    "/auth/2fa/verify",
    { method: "POST", body: JSON.stringify({ challenge, token }) },
  );
  return data;
}

export async function twoFactorStatus(): Promise<{ enabled: boolean }> {
  return request<{ enabled: boolean }>("/auth/2fa/status");
}

/** Disable 2FA after a password re-check. */
export async function disableTwoFactor(password: string): Promise<{ disabled: boolean }> {
  return request<{ disabled: boolean }>("/auth/2fa/disable", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

/** The member's notifications, newest first. */
export async function fetchNotifications(): Promise<{ notifications: NotificationDto[]; unread: number }> {
  return request<{ notifications: NotificationDto[]; unread: number }>("/auth/notifications");
}

export async function markNotificationRead(notificationId: string): Promise<NotificationDto> {
  const data = await request<{ notification: NotificationDto }>(
    `/auth/notifications/${notificationId}/read`,
    { method: "POST", body: JSON.stringify({}) },
  );
  return data.notification;
}

export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  return request<{ updated: number }>("/auth/notifications/read-all", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

// ── Admin console (new rails) ──────────────────────────

export interface AdminOverviewDto {
  totalUsers: number;
  activeMembers: number;
  pendingWithdrawals: number;
  pendingWithdrawalCents: number;
  activeInvestments: number;
  activeInvestmentPrincipalCents: number;
  pendingSettlements: number;
  pools: { name: string; balanceCents: number }[];
  recentAudit: AuditEntryDto[];
}

/** Admin console overview — headline numbers + recent audit activity. */
export async function fetchAdminOverview(): Promise<AdminOverviewDto> {
  const data = await request<{ overview: AdminOverviewDto }>("/admin/overview");
  return data.overview;
}


export interface AnnouncementDto {
  id: string;
  title: string;
  body: string;
  status: "DRAFT" | "PUBLISHED";
  createdBy: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettingDto {
  key: string;
  value: unknown;
  description: string | null;
  updatedAt: string;
}

/** Search members by email/name; optional activation filter. */
export async function searchAdminMembers(search?: string, activated?: boolean): Promise<AdminMemberDto[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (activated !== undefined) params.set("activated", String(activated));
  const q = params.toString();
  const data = await request<{ members: AdminMemberDto[] }>(`/admin/members${q ? `?${q}` : ""}`);
  return data.members;
}

/** Edit a member: fullName (null clears it), status, isActive, role. */
export async function updateAdminMember(
  memberId: string,
  patch: {
    fullName?: string | null;
    status?: "ACTIVE" | "INACTIVE" | "SUSPENDED";
    isActive?: boolean;
    role?: UserRole;
  },
): Promise<AdminMemberDto> {
  const data = await request<{ member: AdminMemberDto }>(`/admin/members/${memberId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return data.member;
}

export async function fetchAnnouncements(): Promise<AnnouncementDto[]> {
  const data = await request<{ announcements: AnnouncementDto[] }>("/admin/announcements");
  return data.announcements;
}

export async function createAnnouncement(input: {
  title: string;
  body: string;
  status?: "DRAFT" | "PUBLISHED";
}): Promise<AnnouncementDto> {
  const data = await request<{ announcement: AnnouncementDto }>("/admin/announcements", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.announcement;
}

export async function updateAnnouncement(
  announcementId: string,
  input: { title?: string; body?: string; status?: "DRAFT" | "PUBLISHED" },
): Promise<AnnouncementDto> {
  const data = await request<{ announcement: AnnouncementDto }>(
    `/admin/announcements/${announcementId}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  return data.announcement;
}

export async function deleteAnnouncement(announcementId: string): Promise<{ deleted: true }> {
  return request<{ deleted: true }>(`/admin/announcements/${announcementId}`, {
    method: "DELETE",
  });
}

export async function fetchSettings(): Promise<SettingDto[]> {
  const data = await request<{ settings: SettingDto[] }>("/admin/settings");
  return data.settings;
}

export async function upsertSetting(
  key: string,
  value: unknown,
  description?: string,
): Promise<SettingDto> {
  const data = await request<{ setting: SettingDto }>(`/admin/settings/${key}`, {
    method: "PUT",
    body: JSON.stringify({ value, description }),
  });
  return data.setting;
}

export async function deleteSetting(key: string): Promise<{ deleted: true }> {
  return request<{ deleted: true }>(`/admin/settings/${key}`, { method: "DELETE" });
}