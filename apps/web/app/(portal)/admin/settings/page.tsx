"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminTabs } from "@/components/admin-tabs";
import { ActionButton, Note, Panel, PortalPage } from "@/components/portal-ui";
import {
  ApiError,
  deleteSetting,
  fetchSettings,
  upsertSetting,
  type SettingDto,
} from "@/lib/api";

/**
 * System settings (JSON config). Values are edited as JSON and validated
 * client-side before they are sent, so a typo cannot brick a config key.
 */
export default function AdminSettingsPage() {
  const [rows, setRows] = useState<SettingDto[]>([]);
  const [editing, setEditing] = useState<SettingDto | null>(null);
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("{}");
  const [newDescription, setNewDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setRows(await fetchSettings());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load settings.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function startEdit(s: SettingDto) {
    setEditing(s);
    setText(JSON.stringify(s.value, null, 2));
    setDescription(s.description ?? "");
    setOk(null);
  }

  async function onSaveEdit() {
    if (!editing) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setError("Value is not valid JSON. Fix the syntax and try again.");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await upsertSetting(editing.key, parsed, description.trim() || undefined);
      setOk(`Saved ${editing.key}.`);
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onCreate() {
    if (!newKey.trim()) {
      setError("A setting key is required.");
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(newValue);
    } catch {
      setError("Value is not valid JSON. Fix the syntax and try again.");
      return;
    }
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await upsertSetting(newKey.trim(), parsed, newDescription.trim() || undefined);
      setOk(`Saved ${newKey.trim()}.`);
      setNewKey("");
      setNewValue("{}");
      setNewDescription("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Save failed.");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(key: string) {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      await deleteSetting(key);
      setOk(`Deleted ${key}.`);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PortalPage title="Settings" backLabel="Back to admin console" backHref="/admin/overview">
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

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {rows.length === 0 && (
          <p className="col-span-full py-4 text-center text-sm text-mist">No settings stored yet.</p>
        )}
        {rows.map((s) => (
          <Panel key={s.key} className="!p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="break-all text-sm font-bold text-soft">{s.key}</p>
              <span className="shrink-0 text-[11px] text-mist">
                {new Date(s.updatedAt).toLocaleDateString()}
              </span>
            </div>
            {s.description && <p className="mt-1 text-xs text-mist">{s.description}</p>}
            <pre className="mt-2 overflow-x-auto rounded-xl bg-night-2 p-3 text-[11px] leading-relaxed text-soft">
              {JSON.stringify(s.value, null, 2)}
            </pre>
            <div className="mt-3 flex gap-2">
              <ActionButton tone="quiet" onClick={() => startEdit(s)} disabled={busy}>
                Edit
              </ActionButton>
              <ActionButton tone="danger" onClick={() => void onDelete(s.key)} disabled={busy}>
                Delete
              </ActionButton>
            </div>
          </Panel>
        ))}
      </div>

      {editing && (
        <div className="mt-4 sm:max-w-2xl">
          <Panel title={`Edit ${editing.key}`}>
            <div className="mt-3 space-y-3">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-mist">
                  Value (JSON)
                </span>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={5}
                  className="w-full resize-y rounded-2xl border border-white/10 bg-night-2 px-4 py-3 font-mono text-sm text-soft outline-none focus:border-green/50"
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-mist">
                  Description
                </span>
                <input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-night-2 px-4 py-3 text-sm text-soft outline-none focus:border-green/50"
                />
              </label>
              <div className="flex gap-2">
                <ActionButton onClick={() => void onSaveEdit()} disabled={busy}>
                  Save value
                </ActionButton>
                <ActionButton tone="quiet" onClick={() => setEditing(null)}>
                  Cancel
                </ActionButton>
              </div>
            </div>
          </Panel>
        </div>
      )}

      <div className="mt-4">
        <Panel title="Add or overwrite a setting">
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="support.email"
              className="w-full rounded-2xl border border-white/10 bg-night-2 px-4 py-3 text-sm text-soft outline-none focus:border-green/50"
            />
            <textarea
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              rows={3}
              className="w-full resize-y rounded-2xl border border-white/10 bg-night-2 px-4 py-3 font-mono text-sm text-soft outline-none focus:border-green/50"
            />
            <input
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Description (optional)"
              className="w-full rounded-2xl border border-white/10 bg-night-2 px-4 py-3 text-sm text-soft outline-none focus:border-green/50"
            />
            <ActionButton onClick={() => void onCreate()} disabled={busy}>
              Save setting
            </ActionButton>
            <p className="text-xs text-mist sm:col-span-2">
              An existing key is overwritten. Values are stored as JSON.
            </p>
          </div>
        </Panel>
      </div>
    </PortalPage>
  );
}
