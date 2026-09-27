"use client";

import { useCallback, useEffect, useState } from "react";
import { ActionButton, Field, Note, Panel, PortalPage } from "@/components/portal-ui";
import {
  ApiError,
  changePassword,
  fetchMe,
  fetchSessions,
  resendVerification,
  revokeSession,
  serverLogout,
  updateProfile,
  type SessionDto,
  type UserDto,
} from "@/lib/api";

/** Profile, password, email verification, and active sessions. */
export default function ProfilePage() {
  const [user, setUser] = useState<UserDto | null>(null);
  const [fullName, setFullName] = useState("");
  const [sessions, setSessions] = useState<SessionDto[]>([]);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [u, s] = await Promise.all([fetchMe(), fetchSessions()]);
      setUser(u);
      setFullName(u?.fullName ?? "");
      setSessions(s);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load your profile.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSaveName() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const updated = await updateProfile(fullName.trim() || null);
      setUser(updated);
      setOk("Profile updated.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onChangePassword() {
    setError(null);
    setOk(null);
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setOk("Password changed.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Password change failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await resendVerification();
      setOk(res.link ? `Verification email sent. Dev link: ${res.link}` : "Verification email sent.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not send the verification email.");
    } finally {
      setBusy(false);
    }
  }

  async function onRevoke(s: SessionDto) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await revokeSession(s.id);
      setOk("Session revoked.");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not revoke the session.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <PortalPage title="Profile">
        {error ? <Note tone="error">{error}</Note> : <Note>Sign in to manage your profile.</Note>}
      </PortalPage>
    );
  }

  return (
    <PortalPage title="Profile">
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
        <Panel title="Account">
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-mist">Email</dt>
              <dd className="truncate font-bold text-soft">{user.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-mist">Member ID</dt>
              <dd className="font-bold text-soft">{user.id.slice(0, 8).toUpperCase()}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-mist">Membership</dt>
              <dd
                className={`font-bold ${
                  user.membershipActivated ? "text-green" : "text-amber-300"
                }`}
              >
                {user.membershipActivated ? "Active" : "Activation pending"}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-mist">Role</dt>
              <dd className="font-bold text-soft">{user.role}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-mist">Joined</dt>
              <dd className="font-bold text-soft">
                {new Date(user.createdAt).toLocaleDateString()}
              </dd>
            </div>
          </dl>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Display name">
          <div className="mt-3 space-y-3">
            <Field label="Full name" value={fullName} onChange={setFullName} autoComplete="name" />
            <ActionButton onClick={() => void onSaveName()} disabled={busy}>
              Save name
            </ActionButton>
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Change password">
          <div className="mt-3 space-y-3">
            <Field
              label="Current password"
              value={currentPassword}
              onChange={setCurrentPassword}
              type="password"
              autoComplete="current-password"
            />
            <Field
              label="New password"
              value={newPassword}
              onChange={setNewPassword}
              type="password"
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
            <ActionButton onClick={() => void onChangePassword()} disabled={busy}>
              Change password
            </ActionButton>
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title="Email verification">
          <p className="mt-3 text-sm text-mist">
            Verification secures account recovery. It is not required to sign in.
          </p>
          <div className="mt-3">
            <ActionButton tone="quiet" onClick={() => void onResend()} disabled={busy}>
              Send verification email
            </ActionButton>
          </div>
        </Panel>
      </div>

      <div className="mt-4">
        <Panel title={`Active sessions (${sessions.length})`}>
          <ul className="mt-3 space-y-2.5">
            {sessions.map((s) => (
              <li key={s.id} className="rounded-2xl border border-white/5 bg-night-2 p-3.5">
                <p className="text-sm font-bold text-soft">{s.userAgent ?? "Unknown device"}</p>
                <p className="mt-1 text-[11px] text-mist">
                  ip {s.ip} · last seen {new Date(s.lastSeenAt).toLocaleString()}
                </p>
                <div className="mt-2">
                  <ActionButton tone="danger" onClick={() => void onRevoke(s)} disabled={busy}>
                    Revoke session
                  </ActionButton>
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="mt-4">
        <ActionButton
          tone="quiet"
          onClick={() => {
            void serverLogout().then(() => window.location.assign("/login"));
          }}
        >
          Sign out of all devices
        </ActionButton>
      </div>
    </PortalPage>
  );
}
