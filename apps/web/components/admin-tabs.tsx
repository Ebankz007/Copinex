"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin/overview", label: "Overview" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/withdrawals", label: "Withdrawals" },
  { href: "/admin/investments", label: "Investments" },
  { href: "/admin/content", label: "Content" },
  { href: "/admin/settings", label: "Settings" },
  { href: "/admin/audit", label: "Audit" },
  { href: "/admin/brokers", label: "Brokers" },
];

/** Horizontal tab bar shared by every admin console page. */
export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav
      // Mobile: a swipeable rail. The negative margin must track the page frame's
      // responsive gutter (px-4 -> sm:px-6 -> lg:px-8) or the bleed stops lining
      // up with the edge. From lg the eight tabs fit, so they wrap instead.
      className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:flex-wrap lg:overflow-x-visible lg:-mx-8 lg:px-8"
      aria-label="Admin console sections"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition ${
              active
                ? "border-green/40 bg-green/15 text-green"
                : "border-white/10 bg-white/5 text-mist hover:text-soft"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
