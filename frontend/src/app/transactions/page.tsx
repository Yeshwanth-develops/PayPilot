"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const API = (
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

type Transaction = {
    id: number;
    paypal_order_id: string;
    paypal_capture_id: string | null;
    product_id: string;
    product_name: string;
    catalog_price_usd?: string;
    budget_limit_usd?: string;
    checkout_amount: string;
    checkout_currency: string;
    policy_decision: string;
    payment_status: string;
    created_at: string;
    updated_at: string;
};

type StatusFilter = "ALL" | "COMPLETED" | "CREATED" | "APPROVED";

const usd = (value: string | number | undefined | null) =>
    new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
    }).format(Number(value || 0));

function shortId(value: string | null) {
    if (!value) return "—";
    return value.length > 20
        ? `${value.slice(0, 10)}…${value.slice(-6)}`
        : value;
}

function formatDate(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
    });
}

function StatusBadge({ status }: { status: string }) {
    const normalized = status.toUpperCase();

    const styles: Record<string, string> = {
        COMPLETED: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
        CREATED: "border-amber-400/30 bg-amber-400/10 text-amber-300",
        APPROVED: "border-cyan-400/30 bg-cyan-400/10 text-cyan-300",
        FAILED: "border-red-400/30 bg-red-400/10 text-red-300",
        REJECTED: "border-red-400/30 bg-red-400/10 text-red-300",
    };

    return (
        <span
            className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${styles[normalized] ??
                "border-white/10 bg-white/5 text-slate-300"
                }`}
        >
            {normalized}
        </span>
    );
}

function MetricCard({
    label,
    value,
    hint,
    accent,
}: {
    label: string;
    value: string;
    hint: string;
    accent: string;
}) {
    return (
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5">
            <p className="text-sm text-slate-400">{label}</p>
            <p className={`mt-3 break-words text-2xl font-bold ${accent}`}>
                {value}
            </p>
            <p className="mt-2 text-xs text-slate-500">{hint}</p>
        </div>
    );
}

export default function TransactionsPage() {
    const [transactions, setTransactions] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

    useEffect(() => {
        let ignore = false;

        async function fetchInitial() {
            try {
                const response = await fetch(`${API}/api/transactions`, {
                    cache: "no-store",
                });

                if (!response.ok) {
                    throw new Error(`Could not load transactions (HTTP ${response.status}).`);
                }

                const data = await response.json();

                if (!ignore && Array.isArray(data.transactions)) {
                    setTransactions(data.transactions);
                }
            } catch (err) {
                if (!ignore) {
                    setError(
                        err instanceof Error
                            ? err.message
                            : "Unable to load transaction history."
                    );
                }
            } finally {
                if (!ignore) {
                    setLoading(false);
                }
            }
        }

        void fetchInitial();

        return () => {
            ignore = true;
        };
    }, []);

    async function refreshTransactions() {
        setLoading(true);
        setError("");

        try {
            const response = await fetch(`${API}/api/transactions`, {
                cache: "no-store",
            });

            if (!response.ok) {
                throw new Error(`Could not load transactions (HTTP ${response.status}).`);
            }

            const data = await response.json();

            if (!Array.isArray(data.transactions)) {
                throw new Error("Unexpected transaction API response.");
            }

            setTransactions(data.transactions);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : "Unable to load transaction history."
            );
        } finally {
            setLoading(false);
        }
    }

    const completed = useMemo(
        () =>
            transactions.filter(
                (transaction) =>
                    transaction.payment_status.toUpperCase() === "COMPLETED"
            ),
        [transactions]
    );

    const totalCatalogSpend = completed.reduce(
        (sum, transaction) =>
            sum +
            Number(
                transaction.catalog_price_usd ?? 0
            ),
        0
    );

    const pendingCount = transactions.filter((transaction) =>
        ["CREATED", "APPROVED"].includes(
            transaction.payment_status.toUpperCase()
        )
    ).length;

    const visibleTransactions = useMemo(() => {
        const term = search.trim().toLowerCase();

        return transactions.filter((transaction) => {
            const matchesStatus =
                statusFilter === "ALL" ||
                transaction.payment_status.toUpperCase() === statusFilter;

            const searchable = [
                transaction.product_name,
                transaction.product_id,
                transaction.paypal_order_id,
                transaction.paypal_capture_id ?? "",
                transaction.payment_status,
            ]
                .join(" ")
                .toLowerCase();

            return matchesStatus && searchable.includes(term);
        });
    }, [transactions, search, statusFilter]);

    return (
        <main className="min-h-screen bg-[#050817] px-4 py-8 text-white sm:px-6 lg:px-10">
            <div className="mx-auto max-w-7xl">
                <header className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <Link href="/" className="text-2xl font-extrabold tracking-tight">
                            PayPilot<span className="text-cyan-400">.</span>
                        </Link>
                        <p className="mt-5 text-xs font-bold tracking-[0.22em] text-cyan-400">
                            TRANSACTION INTELLIGENCE
                        </p>
                        <h1 className="mt-2 text-3xl font-bold sm:text-4xl">
                            Transaction dashboard
                        </h1>
                        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                            Review purchase decisions, catalog spending, and PayPal Sandbox
                            payment records in one place.
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <Link
                            href="/"
                            className="rounded-xl border border-white/10 px-4 py-3 text-sm font-medium hover:bg-white/5"
                        >
                            Back to PayPilot
                        </Link>
                        <button
                            onClick={() => void refreshTransactions()}
                            disabled={loading}
                            className="rounded-xl bg-cyan-400 px-5 py-3 text-sm font-bold text-slate-950 hover:bg-cyan-300 disabled:opacity-50"
                        >
                            {loading ? "Refreshing..." : "↻ Refresh"}
                        </button>
                    </div>
                </header>

                <section className="mt-9 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <MetricCard
                        label="Verified catalog spend"
                        value={usd(totalCatalogSpend)}
                        hint="USD catalog prices of completed records"
                        accent="text-cyan-300"
                    />
                    <MetricCard
                        label="Completed payments"
                        value={String(completed.length)}
                        hint="Records marked COMPLETED"
                        accent="text-emerald-300"
                    />
                    <MetricCard
                        label="Pending orders"
                        value={String(pendingCount)}
                        hint="Created or approved, not completed"
                        accent="text-amber-300"
                    />
                    <MetricCard
                        label="Policy-approved records"
                        value={String(
                            transactions.filter(
                                (transaction) =>
                                    transaction.policy_decision.toUpperCase() === "APPROVED"
                            ).length
                        )}
                        hint="Based on the recorded policy decision"
                        accent="text-violet-300"
                    />
                </section>

                <section className="mt-8 rounded-2xl border border-white/10 bg-[#0b1122] p-5 sm:p-6">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div>
                            <h2 className="text-xl font-bold">Transaction history</h2>
                            <p className="mt-1 text-sm text-slate-400">
                                {visibleTransactions.length} of {transactions.length} records
                                displayed
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <div>
                                <label
                                    htmlFor="transaction-search"
                                    className="mb-2 block text-xs text-slate-400"
                                >
                                    Search transactions
                                </label>
                                <input
                                    id="transaction-search"
                                    value={search}
                                    onChange={(event) => setSearch(event.target.value)}
                                    placeholder="Product, order or capture ID"
                                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                                />
                            </div>

                            <div>
                                <label
                                    htmlFor="transaction-status"
                                    className="mb-2 block text-xs text-slate-400"
                                >
                                    Payment status
                                </label>
                                <select
                                    id="transaction-status"
                                    value={statusFilter}
                                    onChange={(event) =>
                                        setStatusFilter(event.target.value as StatusFilter)
                                    }
                                    className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm outline-none focus:border-cyan-400"
                                >
                                    <option value="ALL">All statuses</option>
                                    <option value="COMPLETED">Completed</option>
                                    <option value="CREATED">Created</option>
                                    <option value="APPROVED">Approved</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div
                            role="alert"
                            className="mt-6 rounded-xl border border-red-400/30 bg-red-400/5 p-4"
                        >
                            <p className="font-semibold text-red-300">
                                Could not load transaction history
                            </p>
                            <p className="mt-1 text-sm text-slate-300">{error}</p>
                            <p className="mt-2 text-xs text-slate-500">
                                Check that FastAPI is running and that the API URL and CORS
                                settings are correct.
                            </p>
                            <button
                                onClick={() => void refreshTransactions()}
                                className="mt-3 text-sm font-semibold text-cyan-300"
                            >
                                Try again
                            </button>
                        </div>
                    )}

                    {loading && transactions.length === 0 && !error ? (
                        <div className="py-16 text-center text-slate-400">
                            Loading transaction records...
                        </div>
                    ) : !loading && !error && visibleTransactions.length === 0 ? (
                        <div className="py-16 text-center">
                            <p className="text-lg font-semibold">No transactions found</p>
                            <p className="mt-2 text-sm text-slate-400">
                                Complete a new Sandbox checkout or change your search filters.
                            </p>
                        </div>
                    ) : (
                        <div className="mt-6 overflow-x-auto">
                            <table className="w-full min-w-[1050px] border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-500">
                                        <th className="px-4 py-4 font-medium">Product</th>
                                        <th className="px-4 py-4 font-medium">Catalog price</th>
                                        <th className="px-4 py-4 font-medium">Checkout amount</th>
                                        <th className="px-4 py-4 font-medium">Policy</th>
                                        <th className="px-4 py-4 font-medium">Payment status</th>
                                        <th className="px-4 py-4 font-medium">PayPal order</th>
                                        <th className="px-4 py-4 font-medium">Capture ID</th>
                                        <th className="px-4 py-4 font-medium">Created</th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {visibleTransactions.map((transaction) => (
                                        <tr
                                            key={transaction.paypal_order_id}
                                            className="border-b border-white/5 transition hover:bg-white/[0.025]"
                                        >
                                            <td className="px-4 py-5">
                                                <Link
                                                    href={`/transactions/${encodeURIComponent(transaction.paypal_order_id)}`}
                                                    className="font-semibold text-white transition hover:text-cyan-300"
                                                >
                                                    {transaction.product_name}
                                                </Link>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {transaction.product_id}
                                                </p>
                                            </td>
                                            <td className="px-4 py-5 font-medium text-slate-200">
                                                {usd(transaction.catalog_price_usd)}
                                            </td>
                                            <td className="px-4 py-5">
                                                <p className="font-semibold text-cyan-300">
                                                    {usd(transaction.checkout_amount)}
                                                </p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    Budget: {usd(transaction.budget_limit_usd)}
                                                </p>
                                            </td>
                                            <td className="px-4 py-5">
                                                <StatusBadge status={transaction.policy_decision} />
                                            </td>
                                            <td className="px-4 py-5">
                                                <StatusBadge status={transaction.payment_status} />
                                            </td>
                                            <td
                                                className="px-4 py-5 font-mono text-xs text-slate-300"
                                                title={transaction.paypal_order_id}
                                            >
                                                {shortId(transaction.paypal_order_id)}
                                            </td>
                                            <td
                                                className="px-4 py-5 font-mono text-xs text-slate-300"
                                                title={transaction.paypal_capture_id ?? ""}
                                            >
                                                {shortId(transaction.paypal_capture_id)}
                                            </td>
                                            <td className="px-4 py-5 text-xs text-slate-400">
                                                {formatDate(transaction.created_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4 text-xs text-slate-500">
                        <span>PayPal Sandbox · USD checkout</span>
                        <span>Showing up to 50 records returned by the API</span>
                    </div>
                </section>
            </div>
        </main>
    );
}
