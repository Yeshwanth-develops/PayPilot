
import os
import re
from pydantic import BaseModel, Field
from fastapi import Query
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from decimal import Decimal
from pydantic import BaseModel, Field

load_dotenv()

app = FastAPI(
    title="PayPilot API",
    description="AI-powered autonomous commerce",
    version="0.1.0",
)

frontend_origin = os.getenv(
    "FRONTEND_ORIGIN",
    "http://localhost:3000",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_origin],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/")
def root():
    return {
        "name": "PayPilot API",
        "message": "AI proposes. Policy protects. PayPal executes.",
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "service": "paypilot-backend",
        "version": "0.1.0",
    }

class SpendingPolicy(BaseModel):
    max_budget_inr: Decimal = Field(gt=0, le=Decimal("10000000"))
    require_approval: bool = True


class PolicyEvaluationRequest(BaseModel):
    product_id: str
    policy: SpendingPolicy


@app.post("/api/policies/evaluate")
def evaluate_policy(body: PolicyEvaluationRequest):
    product = next(
        (p for p in DEMO_PRODUCTS if p["id"] == body.product_id),
        None,
    )

    if product is None:
        return {
            "allowed": False,
            "decision": "REJECTED",
            "reason": "Product not found.",
            "requires_approval": True,
        }

    if product["currency"] != "INR":
        return {
            "allowed": False,
            "decision": "REJECTED",
            "reason": "Product currency must be INR.",
            "requires_approval": True,
        }

    price = Decimal(str(product["price"]))
    budget = body.policy.max_budget_inr

    if price > budget:
        return {
            "allowed": False,
            "decision": "REJECTED",
            "reason": "Product price exceeds your maximum budget.",
            "product": product,
            "requires_approval": True,
        }

    return {
        "allowed": True,
        "decision": "APPROVAL_REQUIRED"
        if body.policy.require_approval
        else "ELIGIBLE_FOR_USER_APPROVAL",
        "reason": "Product is within budget. User approval is still required before checkout.",
        "product": product,
        "requires_approval": True,
        "payment_authorized": False,
    }


# Temporary demo catalog. We'll connect a real product provider later.
DEMO_PRODUCTS = [
    {
        "id": "p001",
        "name": "Sony WH-1000XM5",
        "category": "Headphones",
        "merchant": "TechStore",
        "price": 24999,
        "currency": "INR",
        "rating": 4.8,
        "description": "Wireless noise-cancelling headphones",
    },
    {
        "id": "p002",
        "name": "Apple AirPods Pro 2",
        "category": "Headphones",
        "merchant": "GadgetHub",
        "price": 20999,
        "currency": "INR",
        "rating": 4.7,
        "description": "Wireless earbuds with active noise cancellation",
    },
    {
        "id": "p003",
        "name": "Bose QuietComfort Ultra",
        "category": "Headphones",
        "merchant": "AudioWorld",
        "price": 27999,
        "currency": "INR",
        "rating": 4.6,
        "description": "Premium over-ear headphones",
    },
    {
        "id": "p004",
        "name": "Logitech MX Master 3S",
        "category": "Accessories",
        "merchant": "TechStore",
        "price": 8995,
        "currency": "INR",
        "rating": 4.8,
        "description": "Wireless productivity mouse",
    },
    {
        "id": "p005",
        "name": "Keychron K2",
        "category": "Keyboards",        
        "merchant": "GadgetHub",
        "price": 7499,
        "currency": "INR",
        "rating": 4.5,
        "description": "Compact mechanical keyboard",
    },
    {
        "id": "p006",
        "name": "Samsung 990 EVO SSD",
        "category": "Storage",
        "merchant": "TechStore",
        "price": 9999,
        "currency": "INR",
        "rating": 4.6,
        "description": "High-speed solid-state drive",
    },
    
{
    "id": "p007",
    "name": "Logitech M185 Wireless Mouse",
    "category": "Accessories",
    "merchant": "GadgetHub",
    "price": 799,
    "currency": "INR",
    "rating": 4.2,
    "description": "Compact wireless mouse for everyday use",
},
{
    "id": "p008",
    "name": "Dell MS116 Wired Mouse",
    "category": "Accessories",
    "merchant": "TechStore",
    "price": 499,
    "currency": "INR",
    "rating": 4.0,
    "description": "Simple optical wired mouse",
},
{
    "id": "p009",
    "name": "Logitech K120 Keyboard",
    "category": "Keyboards",
    "merchant": "TechStore",
    "price": 899,
    "currency": "INR",
    "rating": 4.3,
    "description": "Full-size wired keyboard",
},
{
    "id": "p010",
    "name": "Dell KB216 Keyboard",
    "category": "Keyboards",
    "merchant": "GadgetHub",
    "price": 999,
    "currency": "INR",
    "rating": 4.1,
    "description": "Quiet, compact wired keyboard",
}
]


@app.get("/api/products/search")
def search_products(
    q: str = Query(default="", max_length=100),
):
    """Search the demo product catalog."""
    query = q.strip().lower()

    if not query:
        return {
            "query": q,
            "count": len(DEMO_PRODUCTS),
            "products": DEMO_PRODUCTS,
        }

    results = [
        product
        for product in DEMO_PRODUCTS
        if query in product["name"].lower()
        or query in product["category"].lower()
        or query in product["merchant"].lower()
        or query in product["description"].lower()
    ]

    return {
        "query": q,
        "count": len(results),
        "products": results,
    }



class PurchaseRequest(BaseModel):
    request: str = Field(min_length=3, max_length=500)


@app.post("/api/agent/propose")
def create_purchase_proposal(body: PurchaseRequest):
    """Turn a natural-language request into a structured demo proposal."""
    request_text = body.request.strip()
    normalized = request_text.lower()

    # Extract a maximum budget, e.g. "under ₹25,000".
    budget_match = re.search(
        r"\b(?:under|below|less than|maximum|max)\s*"
        r"(?:a budget of\s*)?(?:₹|rs\.?\s*)?([\d,]+)",
        normalized,
    )

    # Also support requests like "budget ₹25000".
    if not budget_match:
        budget_match = re.search(
            r"\bbudget\s*(?:of\s*)?(?:₹|rs\.?\s*)?([\d,]+)",
            normalized,
        )

    max_budget = (
        float(budget_match.group(1).replace(",", ""))
        if budget_match
        else None
    )

    # Extract a minimum rating, e.g. "rating above 4.5".
    rating_match = re.search(
        r"(?:rating|rated)\s*(?:above|over|at least|of)?\s*"
        r"([1-5](?:\.\d+)?)",
        normalized,
    )
    min_rating = float(rating_match.group(1)) if rating_match else None

    # Identify the requested product category.
    categories = {
        "headphones": ["headphones", "headphone", "earbuds", "airpods"],
        "accessories": ["mouse", "accessories"],
        "keyboards": ["keyboard", "keyboards"],
        "storage": ["ssd", "storage", "drive"],
    }

    selected_category = next(
        (
            category
            for category, keywords in categories.items()
            if any(keyword in normalized for keyword in keywords)
        ),
        None,
    )

    candidates = DEMO_PRODUCTS

    if selected_category:
        candidates = [
            product
            for product in candidates
            if product["category"].lower() == selected_category
        ]

    if max_budget is not None:
        candidates = [
            product for product in candidates
            if product["currency"] == "INR"
            and product["price"] <= max_budget
        ]

    if min_rating is not None:
        candidates = [
            product for product in candidates
            if product["rating"] >= min_rating
        ]

    candidates = sorted(
        candidates,
        key=lambda product: (-product["rating"], product["price"]),
    )

    return {
        "proposal_id": "demo-proposal-001",
        "status": "PROPOSED",
        "user_request": request_text,
        "criteria": {
            "category": selected_category,
            "max_budget_inr": max_budget,
            "minimum_rating": min_rating,
        },
        "count": len(candidates),
        "products": candidates,
        "policy_checks": {
            "budget_specified": max_budget is not None,
            "budget_filter_applied": max_budget is not None,
            "rating_filter_applied": min_rating is not None,
            "payment_authorized": False,
        },
        "message": (
            f"Found {len(candidates)} matching product(s)."
            if candidates
            else "No products match all your criteria. Try changing your budget or rating."
        ),
    }

