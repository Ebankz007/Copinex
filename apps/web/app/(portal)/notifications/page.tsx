"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ActionButton, Note, Panel, PortalPage } from "@/components/portal-ui";
import {
  ApiError,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationDto,
} from "@/lib/api";

/** The member's notification feed (announcements, account, security). */
export default function NotificationsPage() {
  const [rows, setRows] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchNotifications();
      setRows(data.notifications);
      setUnread(data.unread);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRead(n: NotificationDto) {
    setBusy(true);
    setError(null);
    try {
      if (!n.readAt) await markNotificationRead(n.id);
      await load();
      if (n.link) window.location.assign(n.link);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not open the notification.");
    } finally {
      setBusy(false);
    }
  }

  async function onReadAll() {
    setBusy(true);
    setError(null);
    try {
      await markAllNotificationsRead();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not mark all as read.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalPage title="Notifications">
      {error && (
        <div className="mt-4">
          <Note tone="error">{error}</Note>
        </div>
      )}

      {unread > 0 && (
        <div className="mt-4">
          <ActionButton onClick={() => void onReadAll()} disabled={busy}>
            Mark all as read ({unread})
          </ActionButton>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {loading && <p className="py-6 text-center text-sm text-mist">Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className="py-6 text-center text-sm text-mist">No notifications yet.</p>
        )}

        {rows.map((n) => (
          <Panel key={n.id} className={`!p-4 ${n.readAt ? "opacity-70" : ""}`}>
            <div className="flex items-start gap-3">
              {!n.readAt && (
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-green shadow-[0_0_8px_rgba(102,211,19,0.8)]"
                  aria-label="Unread"
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-bold text-soft">{n.title}</p>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-mist">
                  {n.body}
                </p>
                <p className="mt-1.5 text-[11px] text-mist">
                  {n.type} · {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="mt-3">
              {n.link ? (
                <Link
                  href={n.link}
                  onClick={() => {
                    if (!n.readAt) void markNotificationRead(n.id);
                  }}
                  className="flex min-h-11 w-full items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-4 text-sm font-bold text-soft transition hover:bg-white/10"
                >
                  Open
                </Link>
              ) : (
                !n.readAt && (
                  <ActionButton tone="quiet" onClick={() => void onRead(n)} disabled={busy}>
                    Mark as read
                  </ActionButton>
                )
              )}
            </div>
          </Panel>
        ))}
      </div>
    </PortalPage>
  );
}
