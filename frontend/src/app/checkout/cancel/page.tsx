"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function CancelContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  return (
    <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.04] p-8">
      <Link href="/" className="text-xl font-bold">
        PayPilot<span className="text-cyan-400">.</span>
      </Link>

      <div className="mt-8 rounded-xl border border-amber-400/30 bg-amber-400/[0.03] p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400/20 text-amber-300 font-bold">
            !
          </span>
          <h1 className="text-2xl font-bold text-amber-300">
            Checkout Cancelled
          </h1>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-300">
          You cancelled the checkout on PayPal Sandbox. No payment has been authorized or captured from your account.
        </p>

        {token && (
          <p className="mt-3 text-xs text-slate-500 font-mono">
            Order Token: {token}
          </p>
        )}

        <div className="mt-5 space-y-2 border-t border-white/10 pt-4 text-xs text-slate-400">
          <p>✓ Spending policy limits remain intact.</p>
          <p>✓ Your wallet or test card was not charged.</p>
          <p>✓ You can modify your budget or choose a different product.</p>
        </div>
      </div>

      <Link
        href="/"
        className="mt-8 inline-block rounded-xl bg-cyan-400 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
      >
        Return to PayPilot Dashboard
      </Link>
    </section>
  );
}

export default function CheckoutCancelPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
      <Suspense fallback={<div className="text-slate-400">Loading...</div>}>
        <CancelContent />
      </Suspense>
    </main>
  );
}
