
"use client";

import { useEffect, useState } from "react";

type Health = {
  status: string;
  service: string;
  version: string;
};

export default function Home() {
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const api =
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      "http://localhost:8000";

    fetch(`${api}/api/health`)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Backend health check failed");
        }
        return response.json();
      })
      .then((data: Health) => setHealth(data))
      .catch(() =>
        setError("Backend unavailable. Start the FastAPI server.")
      );
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <nav className="flex items-center justify-between border-b border-white/10 px-6 py-5 md:px-12">
        <div>
          <span className="text-xl font-bold tracking-tight">
            PayPilot
          </span>
          <span className="ml-2 text-xs text-slate-400">
            AI COMMERCE
          </span>
        </div>
        <span className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">
          Sandbox mode
        </span>
      </nav>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <p className="mb-4 text-sm font-medium text-cyan-400">
          YOUR PERSONAL AI COMMERCE AGENT
        </p>

        <h1 className="max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
          Smarter purchases.
          <br />
          <span className="text-cyan-400">
            You stay in control.
          </span>
        </h1>

        <p className="mt-6 max-w-2xl text-lg text-slate-400">
          Let AI compare products and evaluate offers while
          deterministic spending policies protect your decisions.
          PayPal handles the checkout.
        </p>

        <div className="mt-10 rounded-2xl border border-white/10 bg-white/[0.04] p-6">
          <h2 className="text-lg font-semibold">
            System status
          </h2>

          <div className="mt-4 flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${health ? "bg-emerald-400" : "bg-amber-400"
                }`}
            />
            <span className="text-sm text-slate-300">
              {health
                ? `Backend connected · ${health.version}`
                : error || "Connecting to backend..."}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              ["01", "Discover products"],
              ["02", "Evaluate policies"],
              ["03", "Pay with PayPal"],
            ].map(([number, label]) => (
              <div
                key={number}
                className="rounded-xl border border-white/10 p-4"
              >
                <p className="text-sm text-cyan-400">{number}</p>
                <p className="mt-2 font-medium">{label}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Coming in the next build phase
                </p>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-8 text-xs text-slate-500">
          AI proposes. Policy protects. PayPal executes.
        </p>
      </section>
    </main>
  );
}
