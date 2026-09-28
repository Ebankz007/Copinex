"use client";

import { useEffect } from "react";
import { isDemoMode, serverLogout } from "@/lib/api";

/**
 * Security idle timer for the logged-in area. After INACTIVITY_MINUTES
 * without a sign of life the session is revoked server-side and the member
 * lands on the login page with an explanation — an unattended browser must
 * not hold a live 7-day token indefinitely.
 *
 * Anything that proves a human is present resets the clock: mouse, keys,
 * touch, scroll, and returning to the tab. Demo mode (no token) is ignored
 * entirely — there is nothing to protect.
 */
const INACTIVITY_MINUTES = 15;

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "click"] as const;

export function InactivityLogout() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let done = false;

    const fire = () => {
      if (done) return;
      done = true;
      // Best-effort server revocation (already-revoked tokens 401 here —
      // serverLogout clears the local token either way), then bounce.
      serverLogout()
        .catch(() => undefined)
        .finally(() => {
          window.location.assign("/login?reason=inactive");
        });
    };

    const arm = () => {
      if (done || isDemoMode()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(fire, INACTIVITY_MINUTES * 60_000);
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") arm();
    };

    arm();
    ACTIVITY_EVENTS.forEach((name) =>
      window.addEventListener(name, arm, { passive: true }),
    );
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timer) clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, arm));
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
