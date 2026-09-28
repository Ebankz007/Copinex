"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AdminTabs } from "@/components/admin-tabs";
import { ActionButton, Note, Panel, PortalPage } from "@/components/portal-ui";
import { ApiError, fetchAdminOverview, type AdminOverviewDto } from "@/lib/api";
import { formatCents } from "@/lib/format";

export default function AdminOverviewPage() {
  const [data, setData] = useState<AdminOverviewDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAdminOverview()
      .then(setData)
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Could not load the admin overview."),
      );
  }, []);

  const metrics: { label: string; value: string; href?: string }[] = data
    ? [
        { label: "Total users", value: String(data.totalUsers) },
        { label: "Activated members", value: String(data.activeMembers) },
        { label: "Active investments", value: String(data.activeInvestments) },
        {
          label: "Investment principal",
          value: formatCents(data.activeInvestmentPrincipalCents),
        },
        {
          label: "Pending withdrawals",
          value: String(data.pendingWithdrawals),
          href: "/admin/withdrawals",
        },
        {
          label: "Pending withdrawal value",
          value: formatCents(data.pendingWithdrawalCents),
          href: "/admin/withdrawals",
        },
        { label: "Pending settlements", value: String(data.pendingSettlements) },
        { label: "Pools", value: String(data.pools.length) },
      ]
    : [];

  return (
    <PortalPage title="Admin console" backLabel="Back to dashboard">
      <AdminTabs />

      {error && (
        <div className="mt-4">
          <Note tone="error">{error}</Note>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {metrics.map((m) => {
          const inner = (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mist">
                {m.label}
              </p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-soft">{m.value}</p>
            </>
          );
          return m.href ? (
            <Link
              key={m.label}
              href={m.href}
              className="rounded-2xl border border-white/10 bg-navy p-4 transition hover:border-green/30"
            >
              {inner}
            </Link>
          ) : (
            <div key={m.label} className="rounded-2xl border border-white/10 bg-navy p-4">
              {inner}
            </div>
          );
        })}
      </div>

      {/* Pools and recent activity sit side by side from lg up. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {data && data.pools.length > 0 && (
          <div>
            <Panel title="Pools">
              <ul className="mt-3 space-y-2">
                {data.pools.map((p) => (
                  <li
                    key={p.name}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="truncate text-mist">{p.name}</span>
                    <span className="shrink-0 font-bold text-soft">
                      {formatCents(p.balanceCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        )}

        <div>
          <Panel
            title="Recent admin activity"
            action={
              <Link href="/admin/audit" className="text-xs font-bold text-green">
                Full audit
              </Link>
            }
          >
            {data && data.recentAudit.length > 0 ? (
              <ul className="mt-3 space-y-2.5">
                {data.recentAudit.map((a) => (
                  <li key={a.id} className="text-sm">
                    <span className="font-bold text-soft">{a.action}</span>{" "}
                    <span className="text-mist">· {a.targetType}</span>
                    <p className="text-xs text-mist">
                      {a.adminEmail ?? a.adminId.slice(0, 8)} ·{" "}
                      {new Date(a.createdAt).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-mist">No admin activity recorded yet.</p>
            )}
          </Panel>
        </div>
      </div>

      <div className="mt-4 sm:max-w-xs">
        <ActionButton onClick={() => window.location.reload()}>Refresh</ActionButton>
      </div>
    </PortalPage>
  );
}
