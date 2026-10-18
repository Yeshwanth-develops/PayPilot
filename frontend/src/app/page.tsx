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

  // Policy Evaluation
  const [maxBudget, setMaxBudget] = useState("300");
  const [selectedProductId, setSelectedProductId] = useState("p007");
  const [policyResult, setPolicyResult] =
    useState<PolicyEvaluation | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyError, setPolicyError] = useState("");

  // Checkout

  const [checkoutProductId, setCheckoutProductId] = useState("p007");
  const [checkoutBudget, setCheckoutBudget] = useState("300");
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

  async function submitAgentRequest(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    if (!agentRequest.trim()) return;

    setAgentLoading(true);
    setAgentError("");
    setProposal(null);

    try {
      const response = await fetch(`${API}/api/agent/propose`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request: agentRequest.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Could not create proposal.");
      }

      setProposal(data as Proposal);
      if (data.products && data.products.length > 0) {
        setProducts(data.products);
      }
    } catch (err) {
      setAgentError(
        err instanceof Error ? err.message : "Purchase agent request failed."
      );
    } finally {
      setAgentLoading(false);
    }
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
    const budget = Number(maxBudget);

    if (!Number.isFinite(budget) || budget <= 0) {
      setPolicyError("Enter a valid budget greater than $0.");
      setPolicyResult(null);
      return;
    }

    if (!selectedProductId) {
      setPolicyError("Select a product first.");
      setPolicyResult(null);
      return;
    }

    setPolicyLoading(true);
    setPolicyError("");
    setPolicyResult(null);

    try {
      const response = await fetch(`${API}/api/policies/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product_id: selectedProductId,
          policy: {
            max_budget_usd: budget,
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
    const budget = Number(checkoutBudget);

    if (!Number.isFinite(budget) || budget <= 0) {
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
          product_id: checkoutProductId,
          max_budget_usd: budget,
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

      // Let the user inspect the order amount before opening PayPal.
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

      <section className="mx-auto max-w-6xl px-6 py-14 md:py-20">
        <p className="mb-4 text-sm font-semibold uppercase tracking-widest text-cyan-400">
          Your personal AI commerce agent
        </p>

        <h1 className="max-w-3xl text-4xl font-bold leading-tight md:text-6xl">
          Find the right product.
          <span className="block text-cyan-400">Let PayPilot compare.</span>
        </h1>

        <p className="mt-5 max-w-2xl leading-7 text-slate-400">
          Search products, compare merchant prices, and prepare smarter
          purchases with spending policies that keep you in control.
        </p>

        {/* AI Agent Purchase Proposal Input */}
        <div className="mt-10 rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/40 to-slate-900/60 p-6 md:p-8 shadow-[0_0_25px_rgba(34,211,238,0.1)]">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-cyan-400">
              AI Purchase Proposal Agent
            </h2>
          </div>
          <p className="mt-2 text-sm text-slate-300">
            Tell the AI agent what you want in plain English (e.g. budget, category, min rating):
          </p>

          <form
            onSubmit={submitAgentRequest}
            className="mt-4 flex flex-col gap-3 sm:flex-row"
          >
            <input
              value={agentRequest}
              onChange={(e) => setAgentRequest(e.target.value)}
              placeholder="e.g. I want headphones under $250 rated above 4.7"
              className="min-w-0 flex-1 rounded-xl border border-cyan-400/20 bg-slate-900/80 px-5 py-4 text-white outline-none placeholder:text-slate-500 focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={agentLoading}
              className="rounded-xl bg-cyan-400 px-6 py-4 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
            >
              {agentLoading ? "Evaluating..." : "Generate AI Proposal"}
            </button>
          </form>

          {agentError && (
            <p role="alert" className="mt-4 rounded-xl border border-red-400/30 p-3 text-sm text-red-300">
              {agentError}
            </p>
          )}

          {/* Active Proposal Result Banner */}
          {proposal && (
            <div className="mt-6 rounded-xl border border-cyan-500/30 bg-slate-900/90 p-5 shadow-[0_0_20px_rgba(34,211,238,0.08)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-cyan-400/20 px-3 py-1 text-xs font-semibold text-cyan-300">
                      Proposal {proposal.proposal_id} · {proposal.status}
                    </span>
                    {proposal.engine && (
                      <span className="rounded-full border border-purple-400/30 bg-purple-400/10 px-2.5 py-0.5 text-xs font-semibold text-purple-300">
                        ⚡ {proposal.engine}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-300">
                    Request: &ldquo;{proposal.user_request}&rdquo;
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setProposal(null)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Dismiss Proposal ✕
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <p className="text-xs text-slate-400">Target Category</p>
                  <p className="font-semibold text-white capitalize">
                    {proposal.criteria.category ?? "Any"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <p className="text-xs text-slate-400">Budget Limit</p>
                  <p className="font-semibold text-cyan-300">
                    {proposal.criteria.max_budget_usd
                      ? `$${proposal.criteria.max_budget_usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "Unrestricted"}
                  </p>
                </div>
                <div className="rounded-lg border border-white/5 bg-white/[0.03] p-3">
                  <p className="text-xs text-slate-400">Min Rating</p>
                  <p className="font-semibold text-amber-300">
                    {proposal.criteria.minimum_rating
                      ? `★ ${proposal.criteria.minimum_rating.toFixed(1)}`
                      : "Any"}
                  </p>
                </div>
              </div>

              {proposal.reasoning && (
                <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-950/30 p-3.5 text-xs leading-relaxed text-cyan-200">
                  <span className="font-bold uppercase tracking-wider text-cyan-400">
                    Agent Synthesis:{" "}
                  </span>
                  {proposal.reasoning}
                </div>
              )}

              <p className="mt-4 text-sm text-slate-300">
                {proposal.message}
              </p>
            </div>
          )}
        </div>

        {/* Spending Controls */}
        <section id="spending-controls" className="mt-12 rounded-2xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <p className="text-sm font-semibold tracking-widest text-cyan-400">
            SPENDING CONTROLS
          </p>
          <h2 className="mt-3 text-2xl font-bold">
            Your money. Your rules.
          </h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Set your maximum purchase budget and check whether a product
            satisfies your spending policy.
          </p>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <label
                htmlFor="policy-budget"
                className="mb-2 block text-sm text-slate-300"
              >
                Maximum budget (USD)
              </label>
              <input
                id="policy-budget"
                type="number"
                min="1"
                max="1000000"
                step="1"
                value={maxBudget}
                onChange={(event) => setMaxBudget(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label
                htmlFor="policy-product"
                className="mb-2 block text-sm text-slate-300"
              >
                Product to evaluate
              </label>
              <select
                id="policy-product"
                value={selectedProductId}
                onChange={(event) => {
                  setSelectedProductId(event.target.value);
                  setPolicyResult(null);
                  setPolicyError("");
                }}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400"
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} — ${product.price.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void evaluateSpendingPolicy()}
            disabled={policyLoading || products.length === 0}
            className="mt-6 rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
          >
            {policyLoading ? "Evaluating..." : "Evaluate spending policy"}
          </button>

          {policyError && (
            <p role="alert" className="mt-4 text-sm text-red-300">
              {policyError}
            </p>
          )}

          {policyResult && (
            <div className="mt-6">
              <PolicyExplanation policy={policyResult} />
            </div>
          )}
        </section>

        {/* PayPal Sandbox Checkout */}
        <section className="mt-12 rounded-2xl border border-white/10 bg-white/[0.035] p-6 md:p-8">
          <p className="text-sm font-semibold tracking-widest text-cyan-400">
            PAYPAL SANDBOX CHECKOUT
          </p>
          <h2 className="mt-3 text-2xl font-bold">Ready to purchase?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Validate your budget, review the order details, and continue to
            PayPal Sandbox for buyer approval.
          </p>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <div>
              <label htmlFor="checkout-product" className="mb-2 block text-sm text-slate-300">
                Product
              </label>
              <select
                id="checkout-product"
                value={checkoutProductId}
                onChange={(event) => {
                  setCheckoutProductId(event.target.value);
                  setCheckoutOrder(null);
                  setCheckoutError("");
                }}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400"
              >
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} — ${product.price.toFixed(2)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="checkout-budget" className="mb-2 block text-sm text-slate-300">
                Maximum budget (USD)
              </label>
              <input
                id="checkout-budget"
                type="number"
                min="1"
                max="1000000"
                step="1"
                value={checkoutBudget}
                onChange={(event) => {
                  setCheckoutBudget(event.target.value);
                  setCheckoutOrder(null);
                }}
                className="w-full rounded-xl border border-white/10 bg-slate-900 px-4 py-3 text-white outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => void startCheckout()}
            disabled={checkoutLoading || products.length === 0}
            className="mt-6 rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:opacity-50"
          >
            {checkoutLoading ? "Creating order..." : "Create Sandbox order"}
          </button>

          {checkoutError && (
            <p role="alert" className="mt-4 text-sm text-red-300">
              {checkoutError}
            </p>
          )}

          {checkoutOrder && (
            <div className="mt-6 rounded-xl border border-white/10 bg-slate-900/80 p-5">
              <p className="text-xs uppercase tracking-wider text-cyan-300">
                Order created · {checkoutOrder.status}
              </p>
              <h3 className="mt-3 text-lg font-semibold">
                {checkoutOrder.product.name}
              </h3>
              <p className="mt-2 text-sm text-slate-400">
                Catalog price: ${Number(checkoutOrder.product.price).toFixed(2)} USD
              </p>
              <p className="mt-2 text-2xl font-bold text-cyan-300">
                ${Number(checkoutOrder.checkout.amount).toFixed(2)} {checkoutOrder.checkout.currency}
              </p>
              <p className="mt-3 text-sm text-slate-400">
                {checkoutOrder.message}
              </p>

              <button
                type="button"
                onClick={openPayPalApproval}
                className="mt-5 rounded-xl bg-cyan-400 px-6 py-3 font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Continue to PayPal Sandbox
              </button>
            </div>
          )}
        </section>

        {/* Manual Catalog Search Bar */}
        <div className="mt-14">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            Or search catalog directly
          </p>
          <form
            onSubmit={handleSearchSubmit}
            className="mt-3 flex max-w-3xl flex-col gap-3 sm:flex-row"
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Try headphones, mouse, or keyboard..."
              aria-label="Search products"
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/5 px-5 py-4 outline-none placeholder:text-slate-500 focus:border-cyan-400"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl border border-cyan-400/40 bg-cyan-400/10 px-7 py-4 font-semibold text-cyan-300 transition hover:bg-cyan-400 hover:text-slate-950 disabled:opacity-50"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </form>
        </div>

        {/* Category Pills with 'All' */}
        <div className="mt-5 flex flex-wrap gap-2">
          {CATEGORIES.map((term) => {
            const isActive = activeCategory === term;
            return (
              <button
                key={term}
                onClick={() => handleCategoryClick(term)}
                className={`rounded-full border px-4 py-2 text-sm font-medium transition ${isActive
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
        <div className="mt-14 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">PRODUCT DISCOVERY</p>
            <h2 className="mt-2 text-2xl font-semibold">Explore products</h2>
          </div>
          <p className="text-sm text-slate-400">
            {products.length} result{products.length === 1 ? "" : "s"}
          </p>
        </div>

        {error && (
          <p role="alert" className="mt-6 rounded-xl border border-red-400/30 p-4 text-red-300">
            {error}
          </p>
        )}

        {!error && !loading && searched && products.length === 0 && (
          <p className="mt-6 rounded-xl border border-white/10 p-6 text-slate-400">
            No matching products found. Try a different search.
          </p>
        )}

        {/* Product Cards Grid */}
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <article
              key={product.id}
              className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-6 transition hover:border-cyan-400/40"
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
                <p className="mt-1 text-sm text-slate-500">
                  Demo merchant: {product.merchant}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedProductId(product.id);
                    setCheckoutProductId(product.id);
                    setPolicyResult(null);
                    setPolicyError("");
                    setCheckoutOrder(null);
                    setCheckoutError("");
                    document.getElementById("spending-controls")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="mt-5 w-full rounded-xl border border-cyan-400/40 px-4 py-3 text-sm font-semibold text-cyan-300 transition hover:bg-cyan-400/10"
                >
                  Select product
                </button>
              </div>
            </article>
          ))}
        </div>

        <p className="mt-12 border-t border-white/10 pt-6 text-xs leading-5 text-slate-500">
          Demo catalog only. Products, prices, ratings, and merchants are
          sample data, not live offers. No payment is made in this step.
          <br />
          AI proposes. Policy protects. PayPal executes.
        </p>
      </section>
    </main>
  );
}
