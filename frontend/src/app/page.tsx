"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PolicyExplanation, {
  type PolicyEvaluation,
} from "@/components/PolicyExplanation";

type Product = {
  id: string;
  name: string;
  category: string;
  merchant: string;
  price: number;
  currency: string;
  rating: number;
  description: string;
};

type Proposal = {
  proposal_id: string;
  status: string;
  user_request: string;
  criteria: {
    category: string | null;
    max_budget_usd: number | null;
    minimum_rating: number | null;
  };
  count: number;
  products: Product[];
  policy_checks: {
    budget_specified?: boolean;
    budget_filter_applied?: boolean;
    rating_filter_applied?: boolean;
    payment_authorized: boolean;
  };
  message: string;
  engine?: string;
  reasoning?: string;
};

type CheckoutOrder = {
  order_id: string;
  status: string;
  approval_url: string;
  product: {
    id: string;
    name: string;
    price: string;
    currency: string;
  };
  checkout: {
    currency: string;
    amount: string;
  };
  message: string;
};

const API = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

const CATEGORIES = ["All", "Headphones", "Keyboard", "Mouse", "Storage"];

const PROMPT_CHIPS = [
  {
    label: "🎧 Headphones under $260",
    query: "I want noise-cancelling headphones under $260 rated above 4.5",
  },
  {
    label: "⌨️ Mechanical keyboard under $100",
    query: "Compact mechanical keyboard under $100",
  },
  {
    label: "🖱️ Budget mouse under $15",
    query: "Budget wired ergonomic mouse under $15",
  },
  {
    label: "💾 SSD storage under $150",
    query: "Fast NVMe SSD storage under $150",
  },
  {
    label: "🚨 Attack Demo ($50 on Bose)",
    query: "I want Bose QuietComfort headphones with a $50 maximum budget",
  },
];

const BUDGET_PRESETS = [50, 150, 260, 300, 500];

export default function Home() {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  // AI Agent proposal state
  const [agentRequest, setAgentRequest] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError] = useState("");

  // Unified Commerce Pipeline State
  const [activeProductId, setActiveProductId] = useState("p007");
  const [budget, setBudget] = useState("300");

  // Step 2: Policy Shield Evaluation
  const [policyResult, setPolicyResult] = useState<PolicyEvaluation | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState("");

  // Step 3: PayPal Sandbox Execution
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutOrder, setCheckoutOrder] = useState<CheckoutOrder | null>(null);

  // Initial load
  useEffect(() => {
    let ignore = false;

    async function loadInitialProducts() {
      try {
        const response = await fetch(`${API}/api/products/search?q=`);
        if (!response.ok) {
          throw new Error("Failed to fetch initial products");
        }
        const data: { products: Product[] } = await response.json();
        if (!ignore) {
          setProducts(data.products);
          setSearched(true);
        }
      } catch {
        if (!ignore) {
          setError("Couldn't load products. Check that the backend is running.");
        }
      }
    }

    void loadInitialProducts();

    return () => {
      ignore = true;
    };
  }, []);

  function handleSelectProduct(productId: string) {
    setActiveProductId(productId);
    setPolicyResult(null);
    setPolicyError("");
    setCheckoutOrder(null);
    setCheckoutError("");
  }

  function handleSetBudget(newBudget: string) {
    setBudget(newBudget);
    setPolicyResult(null);
    setPolicyError("");
    setCheckoutOrder(null);
    setCheckoutError("");
  }

  async function searchProducts(searchQuery = "") {
    setLoading(true);
    setError("");
    setSearched(true);

    try {
      const response = await fetch(
        `${API}/api/products/search?q=${encodeURIComponent(searchQuery)}`
      );

      if (!response.ok) {
        throw new Error("Product search failed.");
      }

      const data: { products: Product[] } = await response.json();
      setProducts(data.products);
    } catch {
      setError("Couldn't load products. Check that the backend is running.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  async function executeAgentProposal(requestText: string) {
    const trimmed = requestText.trim();
    if (!trimmed) return;

    setAgentLoading(true);
    setAgentError("");
    setProposal(null);
    setPolicyResult(null);
    setPolicyError("");
    setCheckoutOrder(null);
    setCheckoutError("");

    try {
      const response = await fetch(`${API}/api/agent/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: trimmed }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorDetail = (data as { detail?: unknown })?.detail;
        const msg =
          typeof errorDetail === "object" && errorDetail !== null && "message" in errorDetail
            ? String((errorDetail as { message: unknown }).message)
            : typeof errorDetail === "string"
              ? errorDetail
              : "Could not create proposal.";
        throw new Error(msg);
      }

      const proposalData = data as Proposal;
      setProposal(proposalData);

      if (proposalData.products && proposalData.products.length > 0) {
        setProducts(proposalData.products);
        // Automatically set the top recommended product into the pipeline
        setActiveProductId(proposalData.products[0].id);
      }

      // If budget was parsed by Gemini, automatically populate Step 2 budget
      if (proposalData.criteria.max_budget_usd) {
        setBudget(String(proposalData.criteria.max_budget_usd));
      }
    } catch (err) {
      setAgentError(
        err instanceof Error ? err.message : "Purchase agent request failed."
      );
    } finally {
      setAgentLoading(false);
    }
  }

  function handleAgentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void executeAgentProposal(agentRequest);
  }

  function handleChipClick(queryText: string) {
    setAgentRequest(queryText);
    void executeAgentProposal(queryText);
    document.getElementById("commerce-pipeline")?.scrollIntoView({ behavior: "smooth" });
  }

  function handleSearchSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void searchProducts(query);
  }

  function handleCategoryClick(term: string) {
    const nextQuery = term === "All" ? "" : term;
    setQuery(nextQuery);
    void searchProducts(nextQuery);
  }

  async function evaluateSpendingPolicy() {
    const budgetNum = Number(budget);

    if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
      setPolicyError("Enter a valid budget greater than $0.");
      setPolicyResult(null);
      return;
    }

    if (!activeProductId) {
      setPolicyError("Select a candidate product in Step 1 first.");
      setPolicyResult(null);
      return;
    }

    setPolicyLoading(true);
    setPolicyError("");
    setPolicyResult(null);
    setCheckoutOrder(null);
    setCheckoutError("");

    try {
      const response = await fetch(`${API}/api/policies/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: activeProductId,
          policy: {
            max_budget_usd: budgetNum,
            require_approval: true,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorDetail = (data as { detail?: unknown })?.detail;
        const errorMsg =
          typeof errorDetail === "object" && errorDetail !== null && "message" in errorDetail
            ? String((errorDetail as { message: unknown }).message)
            : typeof errorDetail === "string"
              ? errorDetail
              : Array.isArray(errorDetail) && errorDetail[0]?.msg
                ? String(errorDetail[0].msg)
                : "Policy evaluation failed.";
        throw new Error(errorMsg);
      }

      setPolicyResult(data as PolicyEvaluation);
    } catch (err) {
      setPolicyError(
        err instanceof Error ? err.message : "Could not evaluate policy."
      );
    } finally {
      setPolicyLoading(false);
    }
  }

  async function startCheckout() {
    const budgetNum = Number(budget);

    if (!Number.isFinite(budgetNum) || budgetNum <= 0) {
      setCheckoutError("Enter a valid budget greater than $0.");
      return;
    }

    setCheckoutLoading(true);
    setCheckoutError("");
    setCheckoutOrder(null);

    try {
      const response = await fetch(`${API}/api/checkout/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: activeProductId,
          max_budget_usd: budgetNum,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg =
          typeof data.detail === "object" && data.detail !== null && "message" in data.detail
            ? String(data.detail.message)
            : typeof data.detail === "string"
              ? data.detail
              : "Could not create checkout order.";
        throw new Error(errorMsg);
      }

      const order = data as CheckoutOrder;
      setCheckoutOrder(order);
    } catch (err) {
      setCheckoutError(
        err instanceof Error ? err.message : "Checkout creation failed."
      );
    } finally {
      setCheckoutLoading(false);
    }
  }

  function openPayPalApproval() {
    if (!checkoutOrder?.approval_url) return;
    window.location.assign(checkoutOrder.approval_url);
  }

  const activeCategory =
    CATEGORIES.find((cat) => cat.toLowerCase() === query.trim().toLowerCase()) ??
    (query.trim() === "" ? "All" : null);

  const activeProduct = products.find((p) => p.id === activeProductId) ?? products[0];

  const parsedBudget = Number(budget);
  const activePrice = activeProduct?.price ?? 0;
  const isBudgetValid = Number.isFinite(parsedBudget) && parsedBudget > 0;
  const isOverBudget = isBudgetValid && activePrice > parsedBudget;
  const budgetDelta = Math.abs(parsedBudget - activePrice);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      {/* Navigation */}
      <nav className="flex items-center justify-between border-b border-white/10 px-6 py-5 md:px-12">
        <Link href="/" className="text-xl font-bold tracking-tight">
          PayPilot<span className="text-cyan-400">.</span>
        </Link>
        <div className="flex items-center gap-3">
          <Link
            href="/transactions"
            className="rounded-xl border border-cyan-400/30 px-4 py-2 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-400/10"
          >
            Transaction Dashboard
          </Link>
          <span className="rounded-full border border-emerald-400/30 px-3 py-1 text-xs text-emerald-300">
            Sandbox mode
          </span>
        </div>
      </nav>

      <section className="mx-auto max-w-6xl px-6 py-12 md:py-16">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
            Autonomous Commerce Intelligence
          </p>
        </div>

        <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
          AI proposes. Policy protects.
          <span className="block text-cyan-400">PayPal executes.</span>
        </h1>

        <p className="mt-4 max-w-2xl leading-7 text-slate-400">
          Autonomous agents shouldn&apos;t have unlimited payment authority. PayPilot
          bridges Gemini AI natural discovery with strict policy-as-code shields
          and PayPal sandbox execution.
        </p>

        {/* =========================================================================
            UNIFIED 3-STEP COMMERCE PIPELINE COMMAND CENTER
           ========================================================================= */}
        <section
          id="commerce-pipeline"
          className="mt-12 rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-slate-900/95 via-slate-900/80 to-slate-950/95 p-6 md:p-10 shadow-[0_0_50px_rgba(34,211,238,0.08)] backdrop-blur-xl"
        >
          {/* Executive Stepper Header */}
          <div className="border-b border-white/10 pb-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-cyan-400">
                  Autonomous Commerce Pipeline
                </span>
                <h2 className="mt-1 text-2xl font-bold text-white md:text-3xl">
                  Unified Agent Command Center
                </h2>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span className="rounded-full bg-cyan-400/10 px-3 py-1 font-semibold text-cyan-300 border border-cyan-400/20">
                  Zero-Trust Enforced
                </span>
              </div>
            </div>

            {/* Stepper Progress Bar */}
            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {/* Step 1 Indicator */}
              <div
                className={`flex items-center gap-3 rounded-xl border p-3 transition ${activeProduct
                    ? "border-cyan-400/40 bg-cyan-950/30"
                    : "border-white/10 bg-white/[0.02]"
                  }`}
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400 font-bold text-xs text-slate-950">
                  1
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">AI Proposes</p>
                  <p className="text-[11px] text-slate-400">
                    {proposal ? `Proposal · ${proposal.status}` : "Discovery & Selection"}
                  </p>
                </div>
              </div>

              {/* Step 2 Indicator */}
              <div
                className={`flex items-center gap-3 rounded-xl border p-3 transition ${policyResult
                    ? policyResult.allowed
                      ? "border-emerald-400/40 bg-emerald-950/30"
                      : "border-red-400/40 bg-red-950/30"
                    : "border-white/10 bg-white/[0.02]"
                  }`}
              >
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full font-bold text-xs ${policyResult
                      ? policyResult.allowed
                        ? "bg-emerald-400 text-slate-950"
                        : "bg-red-400 text-slate-950"
                      : "bg-slate-800 text-slate-400 border border-white/20"
                    }`}
                >
                  2
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">Policy Protects</p>
                  <p className="text-[11px] text-slate-400">
                    {policyResult
                      ? policyResult.allowed
                        ? "Shield Verified ✓"
                        : "Policy Blocked ✕"
                      : "Limit Verification"}
                  </p>
                </div>
              </div>

              {/* Step 3 Indicator */}
              <div
                className={`flex items-center gap-3 rounded-xl border p-3 transition ${checkoutOrder
                    ? "border-emerald-400/40 bg-emerald-950/30"
                    : policyResult?.allowed
                      ? "border-cyan-400/40 bg-cyan-950/30"
                      : "border-white/10 bg-white/[0.02]"
                  }`}
              >
                <div
                  className={`flex h-7 w-7 items-center justify-center rounded-full font-bold text-xs ${checkoutOrder
                      ? "bg-emerald-400 text-slate-950"
                      : policyResult?.allowed
                        ? "bg-cyan-400 text-slate-950"
                        : "bg-slate-800 text-slate-400 border border-white/20"
                    }`}
                >
                  3
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">PayPal Executes</p>
                  <p className="text-[11px] text-slate-400">
                    {checkoutOrder
                      ? "Order Drafted ↗"
                      : policyResult?.allowed
                        ? "Ready to Execute"
                        : "Gated by Step 2"}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* =====================================================================
              STEP 1: AI PROPOSES (Natural Language Intent & Product Candidate)
             ===================================================================== */}
          <div className="mt-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400 text-xs font-bold text-slate-950">
                  1
                </span>
                <h3 className="text-lg font-bold text-white">
                  AI Proposes: Natural Discovery &amp; Candidate Selection
                </h3>
              </div>
              <span className="text-xs text-slate-400">Step 1 of 3</span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Prompt the Gemini AI engine to discover items, or click a quick demo prompt chip:
            </p>

            {/* Quick Prompt Chips */}
            <div className="mt-3 flex flex-wrap gap-2">
              {PROMPT_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => handleChipClick(chip.query)}
                  className="rounded-full border border-cyan-400/30 bg-cyan-950/40 px-3.5 py-1.5 text-xs font-medium text-cyan-200 transition hover:border-cyan-300 hover:bg-cyan-900/60"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* AI Agent Input Form */}
            <form
              onSubmit={handleAgentSubmit}
              className="mt-4 flex flex-col gap-3 sm:flex-row"
            >
              <input
                value={agentRequest}
                onChange={(e) => setAgentRequest(e.target.value)}
                placeholder="e.g. I want headphones under $260 rated above 4.5"
                className="min-w-0 flex-1 rounded-xl border border-cyan-400/20 bg-slate-900/90 px-5 py-3.5 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
              />
              <button
                type="submit"
                disabled={agentLoading}
                className="rounded-xl bg-cyan-400 px-6 py-3.5 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
              >
                {agentLoading ? "Consulting AI..." : "Propose with AI"}
              </button>
            </form>

            {agentError && (
              <p role="alert" className="mt-3 rounded-xl border border-red-400/30 p-3 text-sm text-red-300">
                {agentError}
              </p>
            )}

            {/* AI Proposal Breakdown Banner */}
            {proposal && (
              <div className="mt-4 rounded-xl border border-cyan-500/30 bg-slate-900/90 p-4 shadow-[0_0_20px_rgba(34,211,238,0.08)]">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-cyan-400/20 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
                      Proposal #{proposal.proposal_id.slice(0, 8)} · {proposal.status}
                    </span>
                    {proposal.engine && (
                      <span className="rounded-full border border-purple-400/30 bg-purple-400/10 px-2.5 py-0.5 text-xs font-semibold text-purple-300">
                        ⚡ {proposal.engine}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setProposal(null)}
                    className="text-xs text-slate-400 hover:text-white"
                  >
                    Dismiss ✕
                  </button>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
                    <p className="text-[11px] text-slate-400">Target Category</p>
                    <p className="font-semibold text-white capitalize text-sm">
                      {proposal.criteria.category ?? "Any"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
                    <p className="text-[11px] text-slate-400">Parsed Budget</p>
                    <p className="font-semibold text-cyan-300 text-sm">
                      {proposal.criteria.max_budget_usd
                        ? `$${proposal.criteria.max_budget_usd.toFixed(2)} USD`
                        : "Unrestricted"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-white/5 bg-white/[0.03] p-2.5">
                    <p className="text-[11px] text-slate-400">Min Rating</p>
                    <p className="font-semibold text-amber-300 text-sm">
                      {proposal.criteria.minimum_rating
                        ? `★ ${proposal.criteria.minimum_rating.toFixed(1)}`
                        : "Any"}
                    </p>
                  </div>
                </div>

                {proposal.reasoning && (
                  <div className="mt-3 rounded-lg border border-cyan-500/20 bg-cyan-950/30 p-3 text-xs leading-relaxed text-cyan-200">
                    <span className="font-bold uppercase tracking-wider text-cyan-400">
                      Gemini Agent Reasoning:{" "}
                    </span>
                    {proposal.reasoning}
                  </div>
                )}
              </div>
            )}

            {/* Active Candidate Product Card */}
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Currently Selected Candidate Product
                  </span>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <h4 className="text-xl font-bold text-white">
                      {activeProduct ? activeProduct.name : "No product selected"}
                    </h4>
                    {activeProduct && (
                      <span className="rounded-full bg-cyan-400/10 px-2.5 py-0.5 text-xs font-semibold text-cyan-300">
                        {activeProduct.category}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    Demo merchant: <span className="text-slate-300">{activeProduct?.merchant}</span> ·
                    Rating: <span className="text-amber-300 font-semibold">★ {activeProduct?.rating.toFixed(1)}</span>
                  </p>
                </div>

                <div className="flex flex-col sm:items-end">
                  <span className="text-xs text-slate-400">Catalog Price</span>
                  <p className="text-2xl font-black text-white">
                    ${activeProduct?.price.toFixed(2)} <span className="text-xs font-normal text-slate-400">USD</span>
                  </p>
                </div>
              </div>

              {/* Switch candidate product dropdown */}
              <div className="mt-4 border-t border-white/10 pt-4">
                <label htmlFor="pipeline-product-select" className="block text-xs text-slate-400 mb-1.5">
                  Switch candidate product or select from catalog:
                </label>
                <select
                  id="pipeline-product-select"
                  value={activeProductId}
                  onChange={(e) => handleSelectProduct(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-2.5 text-sm text-white outline-none focus:border-cyan-400"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ${p.price.toFixed(2)} USD ({p.merchant})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* =====================================================================
              STEP 2: POLICY PROTECTS (Policy-as-Code Shield Guardrail)
             ===================================================================== */}
          <div className="mt-10 border-t border-white/10 pt-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400 text-xs font-bold text-slate-950">
                  2
                </span>
                <h3 className="text-lg font-bold text-white">
                  Policy Protects: Autonomous Spending Shield
                </h3>
              </div>
              <span className="text-xs text-slate-400">Step 2 of 3</span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Configure your policy ceiling. The autonomous shield guarantees no transaction can exceed your authorization threshold.
            </p>

            <div className="mt-5 grid gap-5 md:grid-cols-2">
              {/* Budget Configuration */}
              <div>
                <label htmlFor="pipeline-budget" className="block text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Authorized Spending Limit (USD)
                </label>
                <div className="relative mt-2">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold">$</span>
                  <input
                    id="pipeline-budget"
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    value={budget}
                    onChange={(e) => handleSetBudget(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-slate-900 pl-8 pr-4 py-3 text-white outline-none focus:border-cyan-400"
                  />
                </div>

                {/* Preset Budget Chips */}
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-slate-500 mr-1">Presets:</span>
                  {BUDGET_PRESETS.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => handleSetBudget(String(amt))}
                      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${budget === String(amt)
                          ? "border-cyan-400 bg-cyan-400/20 text-cyan-300"
                          : "border-white/10 bg-white/[0.02] text-slate-400 hover:text-white"
                        }`}
                    >
                      ${amt}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Shield Comparison Readout */}
              <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Policy-vs-Price Live Telemetry
                </p>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-xs text-slate-400">Candidate Item:</span>
                  <span className="font-semibold text-white">${activePrice.toFixed(2)} USD</span>
                </div>
                <div className="mt-1.5 flex items-baseline justify-between">
                  <span className="text-xs text-slate-400">Authorized Limit:</span>
                  <span className="font-semibold text-cyan-300">
                    {isBudgetValid ? `$${parsedBudget.toFixed(2)} USD` : "Invalid budget"}
                  </span>
                </div>
                <div className="mt-3 border-t border-white/10 pt-2.5 flex items-baseline justify-between">
                  <span className="text-xs font-semibold text-slate-300">Variance:</span>
                  <span
                    className={`text-sm font-bold ${isOverBudget ? "text-red-400" : "text-emerald-400"
                      }`}
                  >
                    {isOverBudget
                      ? `+$${budgetDelta.toFixed(2)} DEFICIT (Over Limit)`
                      : `-$${budgetDelta.toFixed(2)} SURPLUS (Safe)`}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void evaluateSpendingPolicy()}
                disabled={policyLoading || !activeProduct}
                className="rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
              >
                {policyLoading ? "Evaluating Policy..." : "Shield Check: Evaluate Spending Policy"}
              </button>

              {policyResult && (
                <span
                  className={`rounded-xl border px-4 py-2.5 text-xs font-bold uppercase tracking-wider ${policyResult.allowed
                      ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300"
                      : "border-red-400/40 bg-red-400/10 text-red-300"
                    }`}
                >
                  {policyResult.allowed ? "✓ Policy Approved · Step 3 Unlocked" : "✕ Policy Blocked · Step 3 Gated"}
                </span>
              )}
            </div>

            {policyError && (
              <p role="alert" className="mt-4 rounded-xl border border-red-400/30 p-3 text-sm text-red-300">
                {policyError}
              </p>
            )}

            {/* Policy Evaluation Details */}
            {policyResult && (
              <div className="mt-6">
                <PolicyExplanation policy={policyResult} />
              </div>
            )}
          </div>

          {/* =====================================================================
              STEP 3: PAYPAL EXECUTES (Sandbox Order Creation & Authorization)
             ===================================================================== */}
          <div className="mt-10 border-t border-white/10 pt-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-cyan-400 text-xs font-bold text-slate-950">
                  3
                </span>
                <h3 className="text-lg font-bold text-white">
                  PayPal Executes: Sandbox Execution Guardrail
                </h3>
              </div>
              <span className="text-xs text-slate-400">Step 3 of 3</span>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              Only transactions verified by the Step 2 Policy Shield are allowed to initiate PayPal payment sessions.
            </p>

            {/* Gating Logic Visual States */}
            {!policyResult ? (
              <div className="mt-5 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-400">
                  🔒
                </div>
                <h4 className="mt-3 text-base font-semibold text-slate-300">
                  Step 3 Gated by Policy Shield
                </h4>
                <p className="mt-1 max-w-md mx-auto text-xs text-slate-400">
                  Run the &ldquo;Shield Check: Evaluate Spending Policy&rdquo; in Step 2 above to verify that this item complies with your spending rules before initiating a PayPal Sandbox order.
                </p>
                <button
                  type="button"
                  onClick={() => void evaluateSpendingPolicy()}
                  className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-5 py-2.5 text-xs font-semibold text-cyan-300 transition hover:bg-cyan-400/20"
                >
                  Run Step 2 Policy Check First ↑
                </button>
              </div>
            ) : !policyResult.allowed ? (
              <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-950/20 p-6">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-500/20 text-red-400 font-bold">
                    🛡️
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-red-300">
                      PayPal Order Creation Blocked by Policy Shield
                    </h4>
                    <p className="mt-1 text-xs text-red-200/80">
                      PayPilot policy rules prevented an unauthorized checkout attempt:
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      &ldquo;{policyResult.reason}&rdquo;
                    </p>
                    <p className="mt-3 text-xs text-slate-400">
                      Remediation: To execute this transaction, increase your policy limit in Step 2 above to at least ${activePrice.toFixed(2)} USD, or select an affordable candidate in Step 1.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Policy Allowed - Execution Unlocked */
              <div className="mt-5 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-sm font-bold text-emerald-300">
                      Policy Authorization Verified · Ready for Sandbox Execution
                    </span>
                  </div>
                  <span className="rounded-full bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-300">
                    Safe to Purchase
                  </span>
                </div>

                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-lg font-bold text-white">{activeProduct.name}</h4>
                    <p className="text-xs text-slate-400">
                      Merchant: {activeProduct.merchant} · Price: ${activePrice.toFixed(2)} USD
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => void startCheckout()}
                    disabled={checkoutLoading}
                    className="rounded-xl bg-cyan-400 px-7 py-3.5 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50 shadow-[0_0_20px_rgba(34,211,238,0.2)]"
                  >
                    {checkoutLoading ? "Creating PayPal Order..." : "Create PayPal Sandbox Order"}
                  </button>
                </div>

                {checkoutError && (
                  <p role="alert" className="mt-4 rounded-xl border border-red-400/30 p-3 text-sm text-red-300">
                    {checkoutError}
                  </p>
                )}

                {/* Drafted Order Details & PayPal Redirection CTA */}
                {checkoutOrder && (
                  <div className="mt-6 rounded-xl border border-cyan-400/40 bg-slate-900/90 p-5 shadow-[0_0_25px_rgba(34,211,238,0.15)]">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                      <div>
                        <span className="rounded-full bg-cyan-400/20 px-3 py-1 text-xs font-bold text-cyan-300">
                          PayPal Order ID: {checkoutOrder.order_id}
                        </span>
                        <span className="ml-2 text-xs text-slate-400">Status: {checkoutOrder.status}</span>
                      </div>
                      <span className="text-xs text-emerald-400 font-semibold">Policy Guardrail Bound ✓</span>
                    </div>

                    <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-xs text-slate-400">Order Total Amount</p>
                        <p className="text-3xl font-black text-cyan-300">
                          ${Number(checkoutOrder.checkout.amount).toFixed(2)}{" "}
                          <span className="text-sm font-normal text-slate-400">{checkoutOrder.checkout.currency}</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-400">{checkoutOrder.message}</p>
                      </div>

                      <button
                        type="button"
                        onClick={openPayPalApproval}
                        className="rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 px-8 py-4 font-bold text-slate-950 transition hover:brightness-110 shadow-[0_0_25px_rgba(34,211,238,0.3)]"
                      >
                        Continue to PayPal Sandbox ↗
                      </button>
                    </div>

                    <p className="mt-3 text-[11px] text-slate-500">
                      Redirects to PayPal Sandbox buyer portal for authorization. PayPilot captures payment upon return with dual-layer server policy validation.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* =========================================================================
            MANUAL CATALOG SEARCH & BROWSER SECTION
           ========================================================================= */}
        <div className="mt-16">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-cyan-400" />
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Direct Catalog Lookup
            </p>
          </div>
          <form
            onSubmit={handleSearchSubmit}
            className="mt-3 flex max-w-3xl flex-col gap-3 sm:flex-row"
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by keyword (e.g. noise, mechanical, mouse)..."
              aria-label="Search products"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-5 py-3.5 outline-none placeholder:text-slate-500 focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-7 py-3.5 font-semibold text-cyan-300 transition hover:bg-cyan-400 hover:text-slate-950 disabled:opacity-50"
            >
              {loading ? "Searching..." : "Filter Catalog"}
            </button>
          </form>
        </div>

        {/* Category Pills */}
        <div className="mt-4 flex flex-wrap gap-2">
          {CATEGORIES.map((term) => {
            const isActive = activeCategory === term;
            return (
              <button
                key={term}
                onClick={() => handleCategoryClick(term)}
                className={`rounded-full border px-4 py-1.5 text-xs font-medium transition ${isActive
                    ? "border-cyan-400 bg-cyan-400/20 text-cyan-300"
                    : "border-white/10 text-slate-300 hover:border-cyan-400/50 hover:text-cyan-300"
                  }`}
              >
                {term}
              </button>
            );
          })}
        </div>

        {/* Product Catalog Grid Header */}
        <div className="mt-12 flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">Demo Merchant Inventory</p>
            <h2 className="mt-1 text-2xl font-bold">Catalog Products</h2>
          </div>
          <p className="text-xs text-slate-400">
            {products.length} product{products.length === 1 ? "" : "s"} listed
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-6 rounded-xl border border-red-400/30 p-4 text-red-300">
            {error}
          </p>
        )}

        {!error && !loading && searched && products.length === 0 && (
          <p className="mt-6 rounded-xl border border-white/10 p-6 text-slate-400">
            No matching products found. Try a different search term.
          </p>
        )}

        {/* Product Cards Grid */}
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => {
            const isSelected = activeProductId === product.id;
            return (
              <article
                key={product.id}
                className={`flex flex-col rounded-2xl border p-6 transition ${isSelected
                    ? "border-cyan-400/60 bg-cyan-950/20 shadow-[0_0_20px_rgba(34,211,238,0.1)]"
                    : "border-white/10 bg-white/[0.035] hover:border-cyan-400/30"
                  }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs text-cyan-300">
                    {product.category}
                  </span>
                  <span className="text-sm text-amber-300">
                    ★ {product.rating.toFixed(1)}
                  </span>
                </div>

                <h3 className="mt-5 text-lg font-semibold">{product.name}</h3>
                <p className="mt-2 flex-1 text-sm leading-6 text-slate-400">
                  {product.description}
                </p>

                <div className="mt-6 border-t border-white/10 pt-4">
                  <p className="text-2xl font-bold">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                    }).format(product.price)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    Demo merchant: {product.merchant}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      handleSelectProduct(product.id);
                      document.getElementById("commerce-pipeline")?.scrollIntoView({ behavior: "smooth" });
                    }}
                    className={`mt-4 w-full rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${isSelected
                        ? "border-cyan-400 bg-cyan-400/20 text-cyan-200"
                        : "border-cyan-400/40 text-cyan-300 hover:bg-cyan-400/10"
                      }`}
                  >
                    {isSelected ? "Selected Candidate ✓" : "Select the product →"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <footer className="mt-16 border-t border-white/10 pt-6 text-center text-xs leading-5 text-slate-500">
          <p>
            PayPilot Autonomous Commerce Demo · Built for the PayPal Hackathon
          </p>
          <p className="mt-1 text-slate-600">
            AI proposes. Policy protects. PayPal executes. All payments processed via PayPal Sandbox APIs.
          </p>
        </footer>
      </section>
    </main>
  );
}
