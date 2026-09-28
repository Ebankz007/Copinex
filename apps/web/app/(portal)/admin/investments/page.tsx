"use client";

import { useEffect, useState } from "react";
import { AdminTabs } from "@/components/admin-tabs";
import { ActionButton, Note, Panel, PortalPage } from "@/components/portal-ui";
import {
  ApiError,
  fetchAdminInvestments,
  fetchAdminSettlements,
  type AdminInvestmentDto,
  type AdminSettlementDto,
} from "@/lib/api";
import { formatCents } from "@/lib/format";

/** Investment book + settlement queue (60/10/30 realized-profit split). */
export default function AdminInvestmentsPage() {
  const [investments, setInvestments] = useState<AdminInvestmentDto[]>([]);
  const [settlements, setSettlements] = useState<AdminSettlementDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchAdminInvestments(), fetchAdminSettlements()])
      .then(([i, s]) => {
        setInvestments(i);
        setSettlements(s);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : "Could not load the investment book."),
      )
      .finally(() => setLoading(false));
  }, []);

  const activePrincipal = investments
    .filter((i) => i.status === "ACTIVE")
    .reduce((sum, i) => sum + i.principalCents, 0);

  return (
    <PortalPage title="Investments" backLabel="Back to admin console" backHref="/admin/overview">
      <AdminTabs />

      {error && (
        <div className="mt-4">
          <Note tone="error">{error}</Note>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-white/10 bg-navy p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mist">
            Active principal
          </p>
          <p className="mt-1.5 text-xl font-bold tracking-tight text-soft">
            {formatCents(activePrincipal)}
          </p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-navy p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-mist">
            Open positions
          </p>
          <p className="mt-1.5 text-xl font-bold tracking-tight text-soft">
            {investments.filter((i) => i.status === "ACTIVE").length}
          </p>
        </div>
      </div>

      <div className="mt-4">
        <Panel title={`Investment book (${investments.length})`}>
          {loading && <p className="mt-3 text-sm text-mist">LoadingÃ¢â‚¬Â¦</p>}
          {!loading && investments.length === 0 && (
            <p className="mt-3 text-sm text-mist">No investments yet.</p>
          )}
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {investments.map((i) => (
              <li key={i.id} className="rounded-2xl border border-white/5 bg-night-2 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-bold text-soft">
                      {formatCents(i.principalCents)}
                    </p>
                    <p className="text-[11px] text-mist">
                      {i.userId.slice(0, 8).toUpperCase()} Ã‚Â· pkg {i.packageId.slice(0, 6)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      i.status === "ACTIVE"
                        ? "bg-green/15 text-green"
                        : "border border-white/15 text-mist"
                    }`}
                  >
                    {i.status}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-mist">
                  Accrues until {new Date(i.accrualEndDate).toLocaleDateString()} Ã‚Â· available{" "}
                  {new Date(i.availableDate).toLocaleDateString()} (90-day settlement)
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title={`Settlements (${settlements.length})`}>
          {!loading && settlements.length === 0 && (
            <p className="mt-3 text-sm text-mist">No settlements recorded.</p>
          )}
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {settlements.map((s) => (
              <li key={s.id} className="rounded-2xl border border-white/5 bg-night-2 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-bold text-soft">
                      {formatCents(s.realizedProfitCents)}
                    </p>
                    <p className="text-[11px] text-mist">
                      Period {s.period} Ã‚Â· client {s.clientId.slice(0, 8).toUpperCase()}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                      s.status === "PENDING"
                        ? "bg-amber-400/15 text-amber-300"
                        : s.status === "PROCESSED"
                          ? "bg-green/15 text-green"
                          : "bg-red-400/15 text-red-300"
                    }`}
                  >
                    {s.status}
                  </span>
                </div>
                <p className="mt-1.5 text-[11px] text-mist">
                  Client {formatCents(s.clientShareCents)} Ã‚Â· Sponsor{" "}
                  {formatCents(s.sponsorShareCents)} Ã‚Â· Company {formatCents(s.companyShareCents)}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4">
        <ActionButton onClick={() => window.location.reload()}>Refresh</ActionButton>
      </div>
    </PortalPage>
  );
}
