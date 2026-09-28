"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminTabs } from "@/components/admin-tabs";
import { ActionButton, Note, Panel, PortalPage } from "@/components/portal-ui";
import {
  ApiError,
  createAnnouncement,
  deleteAnnouncement,
  fetchAnnouncements,
  updateAnnouncement,
  type AnnouncementDto,
} from "@/lib/api";

const EMPTY = { title: "", body: "", status: "DRAFT" as "DRAFT" | "PUBLISHED" };

/** Announcements: draft or publish. Publishing fans out to every member. */
export default function AdminContentPage() {
  const [rows, setRows] = useState<AnnouncementDto[]>([]);
  const [draft, setDraft] = useState(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchAnnouncements());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load announcements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(a: AnnouncementDto) {
    setEditingId(a.id);
    setDraft({ title: a.title, body: a.body, status: a.status });
    setOk(null);
  }

  function reset() {
    setEditingId(null);
    setDraft(EMPTY);
  }

  async function onSave() {
    if (!draft.title.trim() || !draft.body.trim()) {
      setError("Title and body are both required.");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      if (editingId) {
        await updateAnnouncement(editingId, {
          title: draft.title.trim(),
          body: draft.body.trim(),
          status: draft.status,
        });
        setOk("Announcement updated.");
      } else {
        await createAnnouncement({
          title: draft.title.trim(),
          body: draft.body.trim(),
          status: draft.status,
        });
        setOk(
          draft.status === "PUBLISHED"
            ? "Announcement published â€” every member has been notified."
            : "Draft saved.",
        );
      }
      reset();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(a: AnnouncementDto) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await deleteAnnouncement(a.id);
      setOk("Announcement deleted.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalPage title="Content" backLabel="Back to admin console" backHref="/admin/overview">
      <AdminTabs />

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

      <div className="mt-4">
        <Panel title={editingId ? "Edit announcement" : "New announcement"}>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-mist">
                Title
              </span>
              <input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Scheduled maintenance"
                className="w-full rounded-2xl border border-white/10 bg-night-2 px-4 py-3 text-[15px] text-soft outline-none focus:border-green/50"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-mist">
                Body
              </span>
              <textarea
                value={draft.body}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                rows={4}
                placeholder="What members need to knowâ€¦"
                className="w-full resize-y rounded-2xl border border-white/10 bg-night-2 px-4 py-3 text-[15px] text-soft outline-none focus:border-green/50"
              />
            </label>
            <div className="flex gap-2">
              {(["DRAFT", "PUBLISHED"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setDraft({ ...draft, status: s })}
                  className={`flex-1 rounded-2xl border px-3 py-2.5 text-xs font-bold transition ${
                    draft.status === s
                      ? "border-green/40 bg-green/15 text-green"
                      : "border-white/10 bg-white/5 text-mist"
                  }`}
                >
                  {s === "DRAFT" ? "Save as draft" : "Publish now"}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <ActionButton onClick={() => void onSave()} disabled={busy}>
                {editingId ? "Save changes" : "Create announcement"}
              </ActionButton>
              {editingId && (
                <ActionButton tone="quiet" onClick={reset}>
                  Cancel
                </ActionButton>
              )}
            </div>
            <p className="text-xs text-mist">
              Publishing sends a notification to every member immediately.
            </p>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading && <p className="col-span-full py-4 text-center text-sm text-mist">Loadingâ€¦</p>}
        {!loading && rows.length === 0 && (
          <p className="col-span-full py-4 text-center text-sm text-mist">No announcements yet.</p>
        )}

        {rows.map((a) => (
          <Panel key={a.id} className="!p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[15px] font-bold text-soft">{a.title}</p>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                  a.status === "PUBLISHED"
                    ? "bg-green/15 text-green"
                    : "bg-amber-400/15 text-amber-300"
                }`}
              >
                {a.status}
              </span>
            </div>
            <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-mist">
              {a.body}
            </p>
            <p className="mt-1.5 text-[11px] text-mist">
              {a.publishedAt
                ? `Published ${new Date(a.publishedAt).toLocaleString()}`
                : `Created ${new Date(a.createdAt).toLocaleString()}`}
            </p>
            <div className="mt-3 flex gap-2">
              <ActionButton tone="quiet" onClick={() => startEdit(a)} disabled={busy}>
                Edit
              </ActionButton>
              <ActionButton tone="danger" onClick={() => void onDelete(a)} disabled={busy}>
                Delete
              </ActionButton>
            </div>
          </Panel>
        ))}
      </div>
    </PortalPage>
  );
}
