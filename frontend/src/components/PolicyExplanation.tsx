"use client";

export type PolicyCheck = {
    name: string;
    passed: boolean;
    message: string;
};

export type PolicyEvaluation = {
    allowed: boolean;
    decision: string;
    reason: string;
    requires_approval?: boolean;
    payment_authorized: boolean;
    budget_analysis: {
        currency: string;
        product_price: string;
        budget_limit: string;
        remaining_budget: string;
        within_budget: boolean;
    } | null;
    checks: PolicyCheck[];
    product?: unknown;
};

function formatUSD(value?: string | number) {
    const num = typeof value === "number" ? value : Number(value || 0);
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
    }).format(Number.isFinite(num) ? num : 0);
}

export default function PolicyExplanation({
    policy,
}: {
    policy: PolicyEvaluation;
}) {
    const budget = policy.budget_analysis;

    return (
        <section className="rounded-2xl border border-cyan-500/20 bg-slate-900/90 p-6 md:p-8 shadow-[0_0_30px_rgba(34,211,238,0.06)] backdrop-blur-md">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-cyan-400 animate-pulse" />
                    <h2 className="text-base font-bold uppercase tracking-wider text-cyan-400">
                        Spending Policy Evaluation
                    </h2>
                </div>

                <span
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${policy.allowed
                        ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300"
                        : "border-red-400/30 bg-red-400/10 text-red-300"
                        }`}
                >
                    {(policy.decision || "PENDING").replaceAll("_", " ")}
                </span>
            </div>

            <p className="mt-4 text-sm leading-relaxed text-slate-300">
                {policy.reason}
            </p>

            {budget && (
                <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 transition hover:border-white/10">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Product Price
                        </p>
                        <p className="mt-2 text-xl font-bold text-white">
                            {formatUSD(budget.product_price)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Catalog price (USD)</p>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 transition hover:border-white/10">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Spending Limit
                        </p>
                        <p className="mt-2 text-xl font-bold text-cyan-300">
                            {formatUSD(budget.budget_limit)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Configured policy ceiling</p>
                    </div>

                    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-4 transition hover:border-white/10">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Remaining Budget
                        </p>
                        <p
                            className={`mt-2 text-xl font-bold ${budget.within_budget ? "text-emerald-300" : "text-red-400"
                                }`}
                        >
                            {formatUSD(budget.remaining_budget)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                            {budget.within_budget ? "Within safe margin" : "Budget deficit"}
                        </p>
                    </div>
                </div>
            )}

            <div className="mt-6">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Deterministic Policy Checks
                </p>

                <ul className="mt-3 space-y-2.5">
                    {(policy.checks ?? []).map((check) => (
                        <li
                            key={check.name}
                            className="flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 transition hover:bg-white/[0.04]"
                        >
                            <span
                                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${check.passed
                                    ? "bg-emerald-400/20 text-emerald-400"
                                    : "bg-red-400/20 text-red-400"
                                    }`}
                            >
                                {check.passed ? "✓" : "✕"}
                            </span>

                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold capitalize text-white">
                                    {(check.name || "").replaceAll("_", " ")}
                                </p>
                                <p className="mt-0.5 text-xs text-slate-400">
                                    {check.message}
                                </p>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>

            <div className="mt-6 flex items-start gap-2 border-t border-white/10 pt-4 text-xs text-slate-400">
                <span className="text-cyan-400">🛡️</span>
                <p>
                    <strong className="text-slate-300">Policy Shield Active:</strong> Eligibility evaluation does not authorize payment. Payment authorization remains locked until explicit human approval on PayPal Sandbox.
                </p>
            </div>
        </section>
    );
}
