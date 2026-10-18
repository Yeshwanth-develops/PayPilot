"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

type Transaction = {
    id: number;
    paypal_order_id: string;
    paypal_capture_id: string | null;
    product_id: string;
    product_name: string;
    catalog_price_usd: string;
    budget_limit_usd: string;
    checkout_amount: string;
    checkout_currency: string;
    policy_decision: string;
    payment_status: string;
    created_at: string;
    updated_at: string;
};

const API_BASE = (
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

const usd = (value: string | number) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
    }).format(Number(value));

const dateTime = (value: string) => {
    if (!value) return "Not available";

    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
        });
};

function InfoCard({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="rounded-xl border border-white/10 bg-slate-900/80 p-4">
            <p className="text-sm text-slate-400">{label}</p>
            <p className="mt-2 break-words font-semibold text-white">
                {value}
            </p>
        </div>
    );
}

export default function TransactionDetailPage() {
    const params = useParams<{ orderId: string }>();
    const orderId = params?.orderId ? decodeURIComponent(params.orderId) : "";

    const [transaction, setTransaction] = useState<Transaction | null>(null);
    const [loading, setLoading] = useState(Boolean(orderId));
    const [error, setError] = useState(
        orderId ? "" : "No order ID provided in URL."
    );

    useEffect(() => {
        if (!orderId) return;

        const controller = new AbortController();

        async function loadTransaction() {
            try {
                const response = await fetch(
                    `${API_BASE}/api/transactions/${encodeURIComponent(orderId)}`,
                    { signal: controller.signal, cache: "no-store" }
                );

                if (!response.ok) {
                    if (response.status === 404) {
                        throw new Error("Transaction not found.");
                    }
                    throw new Error(
                        `Could not load transaction (${response.status}).`
                    );
                }

                const data = await response.json();
                setTransaction(data.transaction);
            } catch (err) {
                if (err instanceof Error && err.name === "AbortError") {
                    return;
                }

                setError(
                    err instanceof Error
                        ? err.message
                        : "An unexpected error occurred."
                );
            } finally {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            }
        }

        loadTransaction();

        return () => controller.abort();
    }, [orderId]);

    const completed =
        transaction?.payment_status === "COMPLETED" &&
        Boolean(transaction.paypal_capture_id);

    const statusClass = completed
        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
        : "border-amber-400/30 bg-amber-400/10 text-amber-300";

    return (
        <main className="min-h-screen bg-[#050817] px-5 py-8 text-white md:px-10">
            <div className="mx-auto max-w-5xl">
                <Link
                    href="/transactions"
                    className="text-sm text-cyan-300 hover:text-cyan-200"
                >
                    ← Back to transaction dashboard
                </Link>

                <header className="mb-8 mt-6">
                    <p className="text-xs font-bold tracking-[0.3em] text-cyan-300">
                        TRANSACTION INTELLIGENCE
                    </p>
                    <h1 className="mt-3 text-3xl font-bold md:text-4xl">
                        Transaction details
                    </h1>
                    <p className="mt-3 break-all text-sm text-slate-400">
                        Order ID: {orderId}
                    </p>
                </header>

                {loading && (
                    <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-8 text-slate-300">
                        Loading transaction details...
                    </div>
                )}

                {!loading && error && (
                    <div
                        role="alert"
                        className="rounded-2xl border border-red-400/30 bg-red-400/5 p-6"
                    >
                        <h2 className="font-semibold text-red-300">
                            Unable to load transaction
                        </h2>
                        <p className="mt-2 text-sm text-slate-300">{error}</p>
                        <p className="mt-2 text-sm text-slate-400">
                            Check that the backend is running and the order ID is valid.
                        </p>
                    </div>
                )}

                {!loading && !error && transaction && (
                    <div className="space-y-6">
                        <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 md:p-8">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div>
                                    <p className="text-sm text-slate-400">
                                        Product
                                    </p>
                                    <h2 className="mt-2 text-2xl font-bold">
                                        {transaction.product_name}
                                    </h2>
                                    <p className="mt-2 text-sm text-slate-400">
                                        Product ID: {transaction.product_id}
                                    </p>
                                </div>

                                <span
                                    className={`rounded-full border px-3 py-1 text-xs font-bold ${statusClass}`}
                                >
                                    {transaction.payment_status}
                                </span>
                            </div>

                            <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                <InfoCard
                                    label="Catalog price"
                                    value={usd(transaction.catalog_price_usd)}
                                />
                                <InfoCard
                                    label="Checkout amount"
                                    value={`${transaction.checkout_currency} ${Number(transaction.checkout_amount).toFixed(2)}`}
                                />
                                <InfoCard
                                    label="Spending budget"
                                    value={usd(transaction.budget_limit_usd)}
                                />
                            </div>
                        </section>

                        <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 md:p-8">
                            <h2 className="text-xl font-bold">
                                Spending policy audit
                            </h2>
                            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                                <InfoCard
                                    label="Policy decision"
                                    value={transaction.policy_decision}
                                />
                                <InfoCard
                                    label="Budget evaluation"
                                    value={
                                        Number(transaction.catalog_price_usd) <=
                                            Number(transaction.budget_limit_usd)
                                            ? "Within recorded budget"
                                            : "Exceeds recorded budget"
                                    }
                                />
                            </div>
                            <p className="mt-4 text-sm text-slate-400">
                                This budget comparison is calculated from the stored
                                transaction values. It is not a substitute for a verified
                                payment or a historical policy-event log.
                            </p>
                        </section>

                        <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 md:p-8">
                            <h2 className="text-xl font-bold">
                                PayPal payment verification
                            </h2>

                            <div className="mt-5 grid gap-4 sm:grid-cols-2">
                                <InfoCard
                                    label="PayPal order ID"
                                    value={transaction.paypal_order_id}
                                />
                                <InfoCard
                                    label="PayPal capture ID"
                                    value={transaction.paypal_capture_id ?? "Not captured"}
                                />
                                <InfoCard
                                    label="Payment status"
                                    value={transaction.payment_status}
                                />
                                <InfoCard
                                    label="Verification indicator"
                                    value={
                                        completed
                                            ? "Capture recorded in database"
                                            : "Capture not recorded as completed"
                                    }
                                />
                            </div>

                            <p className="mt-4 text-sm text-slate-400">
                                This view displays the backend&apos;s stored verification
                                result. It does not independently query PayPal.
                            </p>
                        </section>

                        <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-6 md:p-8">
                            <h2 className="text-xl font-bold">Record timeline</h2>
                            <ol className="mt-5 space-y-5">
                                <li className="border-l-2 border-cyan-400/50 pl-4">
                                    <p className="font-medium">Order record created</p>
                                    <p className="mt-1 text-sm text-slate-400">
                                        {dateTime(transaction.created_at)}
                                    </p>
                                </li>
                                <li className="border-l-2 border-cyan-400/50 pl-4">
                                    <p className="font-medium">Record last updated</p>
                                    <p className="mt-1 text-sm text-slate-400">
                                        {dateTime(transaction.updated_at)}
                                    </p>
                                </li>
                            </ol>
                            <p className="mt-4 text-sm text-slate-500">
                                These are database timestamps, not a complete history
                                of every PayPal or policy event.
                            </p>
                        </section>
                    </div>
                )}
            </div>
        </main>
    );
}
