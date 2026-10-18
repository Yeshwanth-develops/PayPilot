"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

const API = (
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

type CaptureResult = {
    order_id: string;
    capture_id?: string;
    status: string;
    product: string;
    amount?: string;
    currency?: string;
    message: string;
};

function ReturnContent() {
    const searchParams = useSearchParams();
    const orderId = searchParams.get("token");

    const [message, setMessage] = useState(
        orderId ? "Verifying PayPal order..." : ""
    );
    const [result, setResult] = useState<CaptureResult | null>(null);
    const [error, setError] = useState(
        orderId ? "" : "No PayPal order ID was returned."
    );
    const requestedRef = useRef(false);

    useEffect(() => {
        if (!orderId || requestedRef.current) return;
        requestedRef.current = true;

        async function captureOrder() {
            try {
                const response = await fetch(`${API}/api/checkout/capture`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ order_id: orderId }),
                });

                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.detail || "Payment verification failed.");
                }

                setResult(data as CaptureResult);
                setMessage("");
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err.message
                        : "Could not verify the PayPal order."
                );
                setMessage("");
            }
        }

        void captureOrder();
    }, [orderId]);

    return (
        <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.04] p-8">
            <Link href="/" className="text-xl font-bold">
                PayPilot<span className="text-cyan-400">.</span>
            </Link>

            {message && <p className="mt-8 text-slate-300">{message}</p>}

            {error && (
                <div className="mt-8 rounded-xl border border-red-400/30 p-5">
                    <h1 className="text-xl font-semibold text-red-300">
                        Verification incomplete
                    </h1>
                    <p className="mt-3 text-sm leading-6 text-slate-300">{error}</p>
                    <p className="mt-3 text-xs text-slate-400">
                        Check the PayPal order status before retrying. Do not assume
                        a failed browser response means the payment was not captured.
                    </p>
                </div>
            )}

            {result && (
                <div className="mt-8 rounded-xl border border-emerald-400/30 p-5">
                    <h1 className="text-2xl font-bold text-emerald-300">
                        Sandbox capture verified
                    </h1>
                    <p className="mt-3 text-slate-300">{result.product}</p>
                    <p className="mt-2 text-sm text-slate-400">
                        Order: {result.order_id}
                    </p>
                    {result.capture_id && (
                        <p className="mt-2 text-sm text-slate-400">
                            Capture: {result.capture_id}
                        </p>
                    )}
                    {result.amount && (
                        <p className="mt-4 text-xl font-bold text-cyan-300">
                            {result.currency === "USD" ? `$${result.amount}` : `${result.currency} ${result.amount}`}
                        </p>
                    )}
                    <p className="mt-4 text-sm text-emerald-300">{result.message}</p>
                </div>
            )}

            <div className="mt-8 flex flex-wrap gap-3">
                {result?.order_id && (
                    <Link
                        href={`/transactions/${encodeURIComponent(result.order_id)}`}
                        className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-5 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-400/20"
                    >
                        View Transaction Audit →
                    </Link>
                )}
                <Link
                    href="/"
                    className="rounded-xl border border-white/15 px-5 py-3 text-sm transition hover:bg-white/10"
                >
                    Return to PayPilot
                </Link>
            </div>
        </section>
    );
}

export default function CheckoutReturnPage() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-white">
            <Suspense fallback={<div className="text-slate-400">Loading order details...</div>}>
                <ReturnContent />
            </Suspense>
        </main>
    );
}
