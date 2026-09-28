"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { ActionButton, Field, Note, Panel } from "@/components/portal-ui";
import {
  ApiError,
  disableTwoFactor,
  enableTwoFactor,
  setupTwoFactor,
} from "@/lib/api";

/**
 * Two-factor authentication management for the profile page.
 *
 * Setup shows a QR code plus the manual key (for members who cannot scan);
 * confirming a live code enables 2FA and reveals the ten single-use backup
 * codes exactly once. Disabling requires the password, never just a click.
 */
export function TwoFactorPanel({
  enabled,
  onChanged,
}: {
  enabled: boolean;
  onChanged: () => void;
}) {
  const [settingUp, setSettingUp] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [disablePassword, setDisablePassword] = useState("");
  const [confirmingDisable, setConfirmingDisable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onStartSetup() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const setup = await setupTwoFactor();
      setManualKey(setup.manualKey);
      setQrUrl(await QRCode.toDataURL(setup.otpauthUrl));
      setSettingUp(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not start setup.");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirmSetup() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await enableTwoFactor(confirmCode);
      setBackupCodes(res.backupCodes);
      setConfirmCode("");
      setOk("Two-factor authentication is on.");
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "That code did not verify.");
    } finally {
      setBusy(false);
    }
  }

  async function onDisable() {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await disableTwoFactor(disablePassword);
      setDisablePassword("");
      setConfirmingDisable(false);
      setSettingUp(false);
      setQrUrl(null);
      setManualKey(null);
      setBackupCodes(null);
      setOk("Two-factor authentication is off.");
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not disable 2FA.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel
      title="Two-factor authentication"
      action={
        <span
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
            enabled ? "bg-green/15 text-green" : "bg-white/5 text-mist"
          }`}
        >
          {enabled ? "On" : "Off"}
        </span>
      }
    >
      <div className="mt-3 space-y-3">
        {error && <Note tone="error">{error}</Note>}
        {ok && <Note tone="ok">{ok}</Note>}

        {!enabled && !settingUp && (
          <>
            <p className="text-sm text-mist">
              Add a second step to sign-in with your authenticator app. You will
              also get ten single-use backup codes for when your phone is gone.
            </p>
            <ActionButton onClick={() => void onStartSetup()} disabled={busy}>
              Set up two-factor authentication
            </ActionButton>
          </>
        )}

        {!enabled && settingUp && !backupCodes && (
          <>
            <p className="text-sm text-mist">
              Scan this code with your authenticator app (Google Authenticator,
              Authy, 1Password…), then enter the 6-digit code it shows.
            </p>
            {qrUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={qrUrl}
                alt="QR code to scan into your authenticator app"
                className="mx-auto h-48 w-48 rounded-2xl border border-white/10 bg-white p-2"
              />
            )}
            {manualKey && (
              <p className="break-all rounded-2xl border border-white/10 bg-night-2 p-3 text-center font-mono text-sm text-soft">
                {manualKey}
              </p>
            )}
            <Field
              label="6-digit code"
              value={confirmCode}
              onChange={setConfirmCode}
              placeholder="123456"
              autoComplete="one-time-code"
            />
            <ActionButton onClick={() => void onConfirmSetup()} disabled={busy || confirmCode.trim().length < 6}>
              Confirm and enable
            </ActionButton>
          </>
        )}

        {backupCodes && (
          <>
            <Note tone="ok">
              Save these backup codes somewhere safe — each works once, and this
              is the only time they are shown.
            </Note>
            <ul className="grid grid-cols-2 gap-2">
              {backupCodes.map((code) => (
                <li
                  key={code}
                  className="rounded-xl border border-white/10 bg-night-2 px-3 py-2 text-center font-mono text-sm font-bold text-soft"
                >
                  {code}
                </li>
              ))}
            </ul>
            <ActionButton tone="quiet" onClick={() => setBackupCodes(null)}>
              I have saved my codes
            </ActionButton>
          </>
        )}

        {enabled && !confirmingDisable && (
          <>
            <p className="text-sm text-mist">
              Sign-in on this account now requires your authenticator code (or a
              backup code) after the password.
            </p>
            <ActionButton tone="danger" onClick={() => setConfirmingDisable(true)} disabled={busy}>
              Turn off two-factor authentication
            </ActionButton>
          </>
        )}

        {enabled && confirmingDisable && (
          <>
            <p className="text-sm text-mist">
              Enter your password to confirm. Your secret and all backup codes
              will be wiped.
            </p>
            <Field
              label="Current password"
              value={disablePassword}
              onChange={setDisablePassword}
              type="password"
              autoComplete="current-password"
            />
            <div className="flex gap-2">
              <ActionButton tone="danger" onClick={() => void onDisable()} disabled={busy || !disablePassword}>
                Disable 2FA
              </ActionButton>
              <ActionButton tone="quiet" onClick={() => setConfirmingDisable(false)}>
                Cancel
              </ActionButton>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}
