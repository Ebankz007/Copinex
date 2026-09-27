"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminTabs } from "@/components/admin-tabs";
import { ActionButton, Note, Panel, PortalPage } from "@/components/portal-ui";
import { ApiError, fetchAuditLog, type AuditEntryDto } from "@/lib/api";

const LIMITS = [25, 100, 250] as const;

/** Immutable admin trail: who did what, to which target, from where. */
export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntryDto[]>([]);
  const [limit, setLimit] = useState<number>(100);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (n: number) => {
    setLoading(true);
    setError(null);
    try {
      setEntries(await fetchAuditLog(n));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load the audit log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(limit);
  }, [limit, load]);

  return (
    <PortalPage title="Audit log" backLabel="Back to admin console" backHref="/admin/overview">
      <AdminTabs />

      <div className="mt-4 flex gap-2">
        {LIMITS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setLimit(n)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
              limit === n
                ? "border-green/40 bg-green/15 text-green"
                : "border-white/10 bg-white/5 text-mist hover:text-soft"
            }`}
          >
            Last {n}
          </button>
        ))}
      </div>

      {error && (
        <div className="mt-4">
          <Note tone="error">{error}</Note>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {loading && <p className="py-4 text-center text-sm text-mist">Loading audit log…</p>}
        {!loading && entries.length === 0 && (
          <p className="py-4 text-center text-sm text-mist">No admin actions recorded yet.</p>
        )}

        {entries.map((e) => (
          <Panel key={e.id} className="!p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold text-soft">{e.action}</p>
              <span className="shrink-0 text-[11px] text-mist">
                {new Date(e.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="mt-1 text-xs text-mist">
              {e.adminEmail ?? e.adminId.slice(0, 8)} → {e.targetType}
              {e.targetId ? ` ${e.targetId.slice(0, 8)}` : ""} · ip {e.ip}
            </p>
            {e.details != null && (
              <pre className="mt-2 overflow-x-auto rounded-xl bg-night-2 p-3 text-[11px] leading-relaxed text-soft">
                {JSON.stringify(e.details, null, 2)}
              </pre>
            )}
          </Panel>
        ))}
      </div>

      <div className="mt-4">
        <ActionButton onClick={() => void load(limit)}>Refresh</ActionButton>
      </div>
    </PortalPage>
  );
}
