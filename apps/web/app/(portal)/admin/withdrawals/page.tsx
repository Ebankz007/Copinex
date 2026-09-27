"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminTabs } from "@/components/admin-tabs";
import { ActionButton, Note, Panel, PortalPage } from "@/components/portal-ui";
import {
  ApiError,
  approveWithdrawal,
  fetchAdminWithdrawals,
  rejectWithdrawal,
  type AdminWithdrawalDto,
} from "@/lib/api";
import { formatCents } from "@/lib/format";

const STATUSES = ["", "PENDING", "PAID", "REJECTED"] as const;

/**
 * Withdrawal queue. Q4: Pay2Crypto rail only — Copinex never pays from a
 * balance; operations sends USDT manually and records the payout txid.
 */
export default function AdminWithdrawalsPage() {
  const [rows, setRows] = useState<AdminWithdrawalDto[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [txids, setTxids] = useState<Record<string, string>>({});

  const load = useCallback(async (s: string) => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchAdminWithdrawals(s || undefined));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load withdrawals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(status);
  }, [status, load]);

  async function onApprove(row: AdminWithdrawalDto) {
    setBusyId(row.request.id);
    setError(null);
    setOk(null);
    try {
      await approveWithdrawal(row.request.id, txids[row.request.id]?.trim() || undefined);
      setOk(`Marked ${formatCents(row.request.amountCents)} as PAID for ${row.user.email}.`);
      await load(status);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Approval failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function onReject(row: AdminWithdrawalDto) {
    setBusyId(row.request.id);
    setError(null);
    setOk(null);
    try {
      await rejectWithdrawal(row.request.id);
      setOk(`Rejected the request from ${row.user.email}.`);
      await load(status);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Rejection failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PortalPage title="Withdrawals" backLabel="Back to admin console" backHref="/admin/overview">
      <AdminTabs />

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <button
            key={s || "all"}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
              status === s
                ? "border-green/40 bg-green/15 text-green"
                : "border-white/10 bg-white/5 text-mist hover:text-soft"
            }`}
          >
            {s === "" ? "All" : s}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4">
          <Note tone="error">{error}</Note>
        </div>
      )}
      {ok && (
        <div className="mt-4">
          <Note tone="ok">{ok}</Note>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {loading && <p className="py-6 text-center text-sm text-mist">Loading requests…</p>}
        {!loading && rows.length === 0 && (
          <p className="py-6 text-center text-sm text-mist">No withdrawal requests here.</p>
        )}

        {rows.map((row) => {
          const r = row.request;
          const pending = r.status === "PENDING";
          return (
            <Panel key={r.id} className="!p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-lg font-bold tracking-tight text-soft">
                    {formatCents(r.amountCents)}
                  </p>
                  <p className="truncate text-xs text-mist">{row.user.email}</p>
                  <p className="mt-1 text-[11px] text-mist">
                    {new Date(r.createdAt).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    r.status === "PENDING"
                      ? "bg-amber-400/15 text-amber-300"
                      : r.status === "REJECTED"
                        ? "bg-red-400/15 text-red-300"
                        : "bg-green/15 text-green"
                  }`}
                >
                  {r.status}
                </span>
              </div>

              <p className="mt-1.5 text-[11px] text-mist">
                {r.walletType === "WITHDRAWAL"
                  ? "Investment profits (90-day settlement)"
                  : "COPINEX balance (commissions & profit share)"}
              </p>

              {r.payoutTxid && (
                <p className="mt-2 break-all text-[11px] text-mist">txid {r.payoutTxid}</p>
              )}

              {pending && (
                <div className="mt-3 space-y-2">
                  <input
                    value={txids[r.id] ?? ""}
                    onChange={(e) => setTxids({ ...txids, [r.id]: e.target.value })}
                    placeholder="USDT payout txid (optional)"
                    className="w-full rounded-2xl border border-white/10 bg-night-2 px-4 py-2.5 text-sm text-soft outline-none focus:border-green/50"
                  />
                  <div className="flex gap-2">
                    <ActionButton
                      onClick={() => void onApprove(row)}
                      disabled={busyId === r.id}
                    >
                      Approve
                    </ActionButton>
                    <ActionButton
                      tone="danger"
                      onClick={() => void onReject(row)}
                      disabled={busyId === r.id}
                    >
                      Reject
                    </ActionButton>
                  </div>
                </div>
              )}
            </Panel>
          );
        })}
      </div>

      <p className="mt-6 text-xs text-mist">
        Approving records the manual USDT transfer. Copinex does not pay from a balance — send the
        funds, then record the txid above.
      </p>
    </PortalPage>
  );
}
