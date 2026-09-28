"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ChevronLeftIcon, PlusIcon, TrashIcon } from "@/components/icons";
import { AdminTabs } from "@/components/admin-tabs";
import {
  BrokerAdminDto,
  PammConnectionDto,
  createBroker,
  fetchAllBrokers,
  fetchAllConnections,
  fetchMe,
  removeBroker,
} from "@/lib/api";

export default function AdminBrokersPage() {
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [brokers, setBrokers] = useState<BrokerAdminDto[]>([]);
  const [connections, setConnections] = useState<PammConnectionDto[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [pammLink, setPammLink] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [b, c] = await Promise.all([fetchAllBrokers(), fetchAllConnections()]);
    setBrokers(b);
    setConnections(c);
  }, []);

  useEffect(() => {
    fetchMe()
      .then((me) => {
        setIsAdmin(me?.role === "ADMIN");
        if (me?.role === "ADMIN") {
          load().catch(() => setError("Could not load broker data."));
        }
      })
      .catch(() => setIsAdmin(false));
  }, [load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await createBroker({ name, code, pammLink });
      setName("");
      setCode("");
      setPammLink("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add broker.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(brokerId: string) {
    setError(null);
    setBusy(true);
    try {
      await removeBroker(brokerId);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove broker.");
    } finally {
      setBusy(false);
    }
  }

  if (isAdmin === null) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 pb-10 pt-6 sm:max-w-xl sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8 xl:max-w-7xl">
        <p className="text-sm text-mist">Checking accessÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦</p>
      </main>
    );
  }

  if (isAdmin === false) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 pb-10 pt-6 sm:max-w-xl sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8 xl:max-w-7xl">
        <p className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-soft">
          Admin access required.{" "}
          <Link href="/login" className="font-semibold text-green underline">
            Log in
          </Link>{" "}
          with an admin account.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-4 px-4 pb-10 pt-6 sm:max-w-xl sm:px-6 md:max-w-3xl lg:max-w-6xl lg:px-8 xl:max-w-7xl">
      <header className="flex items-center gap-3">
        <Link
          href="/admin/overview"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-soft transition hover:bg-white/10"
          aria-label="Back to admin console"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold tracking-tight text-soft">PAMM Brokers</h1>
      </header>

      <AdminTabs />

      {error && (
        <p className="mt-4 rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-soft">
          {error}
        </p>
      )}

      {/* Add broker */}
      <section className="mt-6 rounded-3xl border border-white/10 bg-navy p-5">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-mist">
          Add Broker
        </h2>
        <form onSubmit={handleAdd} className="mt-4 grid gap-4 sm:max-w-2xl md:grid-cols-2">
          <div>
            <label htmlFor="broker-name" className="text-sm font-semibold text-soft">
              Name
            </label>
            <input
              id="broker-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="PUPRIME"
              required
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-soft placeholder:text-mist focus:border-green focus:outline-none"
            />
          </div>
          <div>
            <label htmlFor="broker-code" className="text-sm font-semibold text-soft">
              Code
            </label>
            <input
              id="broker-code"
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="PU"
              maxLength={10}
              required
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-soft placeholder:text-mist focus:border-green focus:outline-none"
            />
          </div>
          <div className="md:col-span-2">
            <label htmlFor="broker-link" className="text-sm font-semibold text-soft">
              PAMM Private Link
            </label>
            <input
              id="broker-link"
              type="url"
              value={pammLink}
              onChange={(e) => setPammLink(e.target.value)}
              placeholder="https://pamm.broker.com/private/ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦"
              required
              className="mt-2 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-soft placeholder:text-mist focus:border-green focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green py-3.5 text-[15px] font-bold text-night transition hover:brightness-110 disabled:opacity-60 md:col-span-2 md:max-w-xs"
          >
            <PlusIcon className="h-4 w-4" />
            Add Broker
          </button>
        </form>
      </section>

      {/* Broker list */}
      <section className="mt-7">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-mist">
          Broker List ({brokers.length})
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {brokers.length === 0 && (
            <p className="col-span-full py-4 text-center text-sm text-mist">No brokers yet.</p>
          )}
          {brokers.map((broker) => (
            <div
              key={broker.id}
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-navy p-4"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green to-teal-2 text-sm font-extrabold text-night">
                {broker.code}
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-bold text-soft">
                  {broker.name}
                </span>
                <span className="block truncate text-xs text-mist">
                  {broker.pammLink}
                </span>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    broker.isActive
                      ? "bg-green/15 text-green"
                      : "bg-red-400/15 text-red-400"
                  }`}
                >
                  {broker.isActive ? "ACTIVE" : "REMOVED"}
                </span>
              </span>
              {broker.isActive && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleRemove(broker.id)}
                  aria-label={`Remove ${broker.name}`}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-400/30 bg-red-400/10 text-red-400 transition hover:bg-red-400/20 disabled:opacity-60"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Connection requests */}
      <section className="mt-7">
        <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-mist">
          Connection Requests ({connections.length})
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {connections.length === 0 && (
            <p className="col-span-full py-4 text-center text-sm text-mist">
              No connection requests yet.
            </p>
          )}
          {connections.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-4 rounded-2xl border border-white/10 bg-navy p-4"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-green to-teal-2 text-sm font-extrabold text-night">
                {c.broker.code}
              </span>
              <span className="flex-1">
                <span className="block text-[15px] font-bold text-soft">
                  {c.broker.name}
                </span>
                <span className="block text-xs text-mist">
                  {new Date(c.createdAt).toLocaleString()}
                </span>
              </span>
              <span className="rounded-full bg-green/15 px-3 py-1 text-[11px] font-semibold text-green">
                {c.status}
              </span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
