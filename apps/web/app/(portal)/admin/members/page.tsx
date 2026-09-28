"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminTabs } from "@/components/admin-tabs";
import { ActionButton, Note, Panel, PortalPage } from "@/components/portal-ui";
import {
  ApiError,
  activateMember,
  searchAdminMembers,
  updateAdminMember,
  type AdminMemberDto,
} from "@/lib/api";

type Filter = "all" | "activated" | "unactivated";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "activated", label: "Activated" },
  { key: "unactivated", label: "Unactivated" },
];

/** Member directory: search, activation filter, activate + edit (name/role/status). */
export default function AdminMembersPage() {
  const [members, setMembers] = useState<AdminMemberDto[]>([]);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminMemberDto | null>(null);

  const load = useCallback(async (term: string, f: Filter) => {
    setLoading(true);
    setError(null);
    try {
      const activated = f === "all" ? undefined : f === "activated";
      setMembers(await searchAdminMembers(term || undefined, activated));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load members.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      void load(search, filter);
    }, 250);
    return () => clearTimeout(t);
  }, [search, filter, load]);

  async function onActivate(m: AdminMemberDto) {
    setBusyId(m.id);
    setError(null);
    setOk(null);
    try {
      await activateMember(m.id);
      setOk(`Activated ${m.email} â€” the $50 fee is recorded as paid.`);
      await load(search, filter);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Activation failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function onSaveEdit() {
    if (!editing) return;
    setBusyId(editing.id);
    setError(null);
    setOk(null);
    try {
      await updateAdminMember(editing.id, {
        fullName: editing.fullName,
        role: editing.role,
        status: editing.status,
      });
      setOk(`Saved changes to ${editing.email}.`);
      setEditing(null);
      await load(search, filter);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <PortalPage title="Members" backLabel="Back to admin console" backHref="/admin/overview">
      <AdminTabs />

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search email or nameâ€¦"
          aria-label="Search members"
          className="w-full rounded-2xl border border-white/10 bg-night-2 px-4 py-3 text-[15px] text-soft outline-none transition focus:border-green/50 md:max-w-sm"
        />

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                filter === f.key
                  ? "border-green/40 bg-green/15 text-green"
                  : "border-white/10 bg-white/5 text-mist hover:text-soft"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {loading && <p className="py-6 text-center text-sm text-mist sm:col-span-2 xl:col-span-3">Loading membersâ€¦</p>}
        {!loading && members.length === 0 && (
          <p className="py-6 text-center text-sm text-mist sm:col-span-2 xl:col-span-3">
            No members match this filter.
          </p>
        )}

        {members.map((m) => (
          <Panel key={m.id} className="flex h-full flex-col !p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-bold text-soft">
                  {m.fullName ?? m.email}
                </p>
                <p className="truncate text-xs text-mist">{m.email}</p>
                <p className="mt-1 text-[11px] text-mist">ID {m.id.slice(0, 8).toUpperCase()}</p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    m.membershipActivated
                      ? "bg-green/15 text-green"
                      : "bg-amber-400/15 text-amber-300"
                  }`}
                >
                  {m.membershipActivated ? "Activated" : "Unactivated"}
                </span>
                {m.role !== "MEMBER" && (
                  <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[10px] font-bold text-mist">
                    {m.role}
                  </span>
                )}
                {!m.emailVerifiedAt && (
                  <span className="rounded-full border border-white/15 px-2.5 py-0.5 text-[10px] font-bold text-mist">
                    Email unverified
                  </span>
                )}
              </div>
            </div>

            <div className="mt-3 flex gap-2 pt-1 md:mt-auto">
              {!m.membershipActivated && (
                <ActionButton
                  onClick={() => void onActivate(m)}
                  disabled={busyId === m.id}
                >
                  Activate ($50)
                </ActionButton>
              )}
              <ActionButton
                tone="quiet"
                onClick={() => setEditing(m)}
                disabled={busyId === m.id}
              >
                Edit
              </ActionButton>
            </div>
          </Panel>
        ))}
      </div>

      {editing && (
        <div className="mt-4 sm:max-w-2xl">
          <Panel title={`Edit ${editing.email}`}>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-mist">
                  Full name
                </span>
                <input
                  value={editing.fullName ?? ""}
                  onChange={(e) =>
                    setEditing({ ...editing, fullName: e.target.value || null })
                  }
                  className="w-full rounded-2xl border border-white/10 bg-night-2 px-4 py-3 text-[15px] text-soft outline-none focus:border-green/50"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-mist">
                  Role
                </span>
                <select
                  value={editing.role}
                  onChange={(e) =>
                    setEditing({ ...editing, role: e.target.value as AdminMemberDto["role"] })
                  }
                  className="w-full rounded-2xl border border-white/10 bg-night-2 px-4 py-3 text-[15px] text-soft outline-none focus:border-green/50"
                >
                  <option value="MEMBER">MEMBER</option>
                  <option value="ADMIN">ADMIN</option>
                  <option value="SUPERADMIN">SUPERADMIN</option>
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-mist">
                  Status
                </span>
                <select
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      status: e.target.value as "ACTIVE" | "INACTIVE" | "SUSPENDED",
                    })
                  }
                  className="w-full rounded-2xl border border-white/10 bg-night-2 px-4 py-3 text-[15px] text-soft outline-none focus:border-green/50"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="SUSPENDED">SUSPENDED</option>
                </select>
              </label>
              <p className="text-xs text-mist">
                You cannot demote, disable, or suspend your own account.
              </p>
              <div className="flex gap-2">
                <ActionButton onClick={() => void onSaveEdit()} disabled={busyId === editing.id}>
                  Save changes
                </ActionButton>
                <ActionButton tone="quiet" onClick={() => setEditing(null)}>
                  Cancel
                </ActionButton>
              </div>
            </div>
          </Panel>
        </div>
      )}
    </PortalPage>
  );
}
