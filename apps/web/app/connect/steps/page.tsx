import Link from "next/link";
import {
  ChevronLeftIcon,
  ExternalLinkIcon,
  LinkIcon,
  PlayIcon,
} from "@/components/icons";

const STEPS = [
  {
    n: "STEP 1",
    title: "Register with Broker",
    body: [
      "You must use our partner link to ensure your account is linked to the Master Trader.",
      "Deposit minimum recommended $50 and above with the broker.",
    ],
    action: { label: "Open Registration Page", kind: "outline" as const, href: "#" },
  },
  {
    n: "STEP 2",
    title: "Setup Your Account as FOLLOWER",
    body: [
      "After deposited in your account setup your account as FOLLOWER to copy Master Trader.",
      "Watch video on how to setup — follow the step-by-step guide.",
    ],
    action: { label: "Video Link: How to Setup as Follower", kind: "link" as const, href: "#" },
  },
  {
    n: "STEP 3",
    title: "Already Registered, Deposited and Setup as FOLLOWER?",
    body: ["Once your account setup with minimum capital, proceed to the next step."],
    action: { label: "Link My Account", kind: "primary" as const, href: "/connect/account" },
  },
];

export default function StepsPage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col px-5 pb-10 pt-6">
      {/* Header */}
      <header className="flex items-center gap-3">
        <Link
          href="/connect"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-soft transition hover:bg-white/10"
          aria-label="Back to How to Connect"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-bold tracking-tight text-soft">Onboarding Guide</h1>
      </header>

      {/* Steps */}
      <div className="mt-6 space-y-4">
        {STEPS.map((step) => (
          <section
            key={step.n}
            className="rounded-3xl border border-white/10 bg-navy p-5"
          >
            <span className="inline-flex items-center rounded-full bg-green/10 px-3 py-1 text-[11px] font-bold tracking-[0.12em] text-green">
              {step.n}
            </span>
            <h2 className="mt-3 text-[15px] font-bold leading-snug text-soft">
              {step.title}
            </h2>
            <div className="mt-2 space-y-1.5">
              {step.body.map((line) => (
                <p key={line} className="text-sm leading-relaxed text-mist">
                  {line}
                </p>
              ))}
            </div>

            {step.action.kind === "primary" && (
              <Link
                href={step.action.href}
                className="mt-4 flex items-center justify-center gap-2 rounded-2xl bg-green py-3.5 text-sm font-bold text-night transition hover:brightness-110 active:scale-[0.99]"
              >
                <LinkIcon className="h-4 w-4" />
                {step.action.label}
              </Link>
            )}

            {step.action.kind === "outline" && (
              <Link
                href={step.action.href}
                className="mt-4 flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 py-3.5 text-sm font-bold text-soft transition hover:bg-white/10 active:scale-[0.99]"
              >
                <ExternalLinkIcon className="h-4 w-4" />
                {step.action.label}
              </Link>
            )}

            {step.action.kind === "link" && (
              <Link
                href={step.action.href}
                className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-blue transition hover:text-soft"
              >
                <PlayIcon className="h-4 w-4" />
                {step.action.label}
              </Link>
            )}
          </section>
        ))}
      </div>
    </main>
  );
}