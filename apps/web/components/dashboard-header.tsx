"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchMe, logout, type UserDto } from "@/lib/api";

function initials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    return (parts[0][0] + (parts[parts.length - 1][0] ?? "")).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

/**
 * Dashboard header. Shows the real member (name, ID, avatar) when a session
 * token exists; otherwise the demo persona with a Sign in affordance.
 */
export function DashboardHeader() {
  const router = useRouter();
  const [user, setUser] = useState<UserDto | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMe().then((u) => {
      if (!cancelled) {
        setUser(u);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function onSignOut() {
    logout();
    setUser(null);
    router.refresh();
  }

  const displayName = user?.fullName ?? (user ? "Copinex Member" : "Forex GrandMaster");
  const displayId = user ? user.id.slice(0, 8).toUpperCase() : "TP682923";
  const avatar = user ? initials(user.fullName, user.email) : "FG";

  return (
    <header className="flex items-start justify-between">
      <div>
        <p className="text-sm text-mist">Welcome back,</p>
        <h1 className="mt-0.5 text-xl font-bold tracking-tight text-soft">{displayName}</h1>
        <span className="mt-1.5 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] font-medium text-mist">
          ID: {displayId}
        </span>
        {user?.role === "ADMIN" && (
          <span className="ml-1.5 inline-flex items-center rounded-full border border-green/30 bg-green/10 px-2.5 py-0.5 text-[11px] font-bold text-green">
            ADMIN
          </span>
        )}
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-green to-teal-2 text-sm font-bold text-night">
          {avatar}
        </div>
        {loaded && !user && (
          <Link
            href="/login"
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold text-soft transition hover:bg-white/10"
          >
            Sign in
          </Link>
        )}
        {loaded && user && (
          <button
            onClick={onSignOut}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold text-mist transition hover:bg-white/10 hover:text-soft"
          >
            Sign out
          </button>
        )}
      </div>
    </header>
  );
}