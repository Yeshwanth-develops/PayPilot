import base64
from decimal import Decimal, ROUND_HALF_UP
import os
import re
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Path, Query
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel, Field

from database import (
    initialize_database,
    record_order,
    mark_captured,
    list_transactions,
)

load_dotenv()

app = FastAPI(
    title="PayPilot API",
    description="AI-powered autonomous commerce",
    version="0.1.0",
)


@app.on_event("startup")
def startup_database():
    initialize_database()

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

# Demo product catalog in USD
DEMO_PRODUCTS = [
    {
        "id": "p001",
        "name": "Sony WH-1000XM5",
        "category": "Headphones",
        "merchant": "TechStore",
        "price": 299.99,
        "currency": "USD",
        "rating": 4.8,
        "description": "Wireless noise-cancelling headphones",
    },
    {
        "id": "p002",
        "name": "Apple AirPods Pro 2",
        "category": "Headphones",
        "merchant": "GadgetHub",
        "price": 249.99,
        "currency": "USD",
        "rating": 4.7,
        "description": "Wireless earbuds with active noise cancellation",
    },
    {
        "id": "p003",
        "name": "Bose QuietComfort Ultra",
        "category": "Headphones",
        "merchant": "AudioWorld",
        "price": 329.99,
        "currency": "USD",
        "rating": 4.6,
        "description": "Premium over-ear headphones",
    },
    {
        "id": "p004",
        "name": "Logitech MX Master 3S",
        "category": "Accessories",
        "merchant": "TechStore",
        "price": 99.99,
        "currency": "USD",
        "rating": 4.8,
        "description": "Wireless productivity mouse",
    },
    {
        "id": "p005",
        "name": "Keychron K2",
        "category": "Keyboards",
        "merchant": "GadgetHub",
        "price": 89.99,
        "currency": "USD",
        "rating": 4.5,
        "description": "Compact mechanical keyboard",
    },
    {
        "id": "p006",
        "name": "Samsung 990 EVO SSD",
        "category": "Storage",
        "merchant": "TechStore",
        "price": 119.99,
        "currency": "USD",
        "rating": 4.6,
        "description": "High-speed solid-state drive",
    },
    {
        "id": "p007",
        "name": "Logitech M185 Wireless Mouse",
        "category": "Accessories",
        "merchant": "GadgetHub",
        "price": 14.99,
        "currency": "USD",
        "rating": 4.2,
        "description": "Compact wireless mouse for everyday use",
    },
    {
        "id": "p008",
        "name": "Dell MS116 Wired Mouse",
        "category": "Accessories",
        "merchant": "TechStore",
        "price": 9.99,
        "currency": "USD",
        "rating": 4.0,
        "description": "Simple optical wired mouse",
    },
    {
        "id": "p009",
        "name": "Logitech K120 Keyboard",
        "category": "Keyboards",
        "merchant": "TechStore",
        "price": 14.99,
        "currency": "USD",
        "rating": 4.3,
        "description": "Full-size wired keyboard",
    },
    {
        "id": "p010",
        "name": "Dell KB216 Keyboard",
        "category": "Keyboards",
        "merchant": "GadgetHub",
        "price": 16.99,
        "currency": "USD",
        "rating": 4.1,
        "description": "Quiet, compact wired keyboard",
    },
]


# Schemas
class SpendingPolicy(BaseModel):
    max_budget_usd: Decimal = Field(gt=0, le=Decimal("1000000"))
    require_approval: bool = True


class PolicyEvaluationRequest(BaseModel):
    product_id: str
    policy: SpendingPolicy


class PurchaseRequest(BaseModel):
    request: str = Field(min_length=3, max_length=500)


class CheckoutRequest(BaseModel):
    product_id: str = Field(min_length=1, max_length=50)
    max_budget_usd: Decimal = Field(
        gt=0,
        le=Decimal("1000000"),
    )


class CaptureRequest(BaseModel):
    order_id: str = Field(
        min_length=1,
        max_length=100,
        pattern=r"^[A-Z0-9-]+$",
    )


# Helpers
async def get_paypal_access_token(client: httpx.AsyncClient) -> str:
    client_id = os.getenv("PAYPAL_CLIENT_ID", "").strip()
    client_secret = os.getenv("PAYPAL_CLIENT_SECRET", "").strip()
    base_url = os.getenv(
        "PAYPAL_BASE_URL",
        "https://api-m.sandbox.paypal.com",
    ).rstrip("/")

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=503,
            detail="PayPal credentials are not configured.",
        )

    response = await client.post(
        f"{base_url}/v1/oauth2/token",
        auth=(client_id, client_secret),
        data={"grant_type": "client_credentials"},
    )

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail="PayPal authentication failed.",
        )

    return response.json()["access_token"]


# Routes
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


@app.get("/api/paypal/status")
async def paypal_status():
    client_id = os.getenv("PAYPAL_CLIENT_ID", "").strip()
    client_secret = os.getenv("PAYPAL_CLIENT_SECRET", "").strip()
    base_url = os.getenv(
        "PAYPAL_BASE_URL",
        "https://api-m.sandbox.paypal.com",
    ).rstrip("/")

    if not client_id or not client_secret:
        raise HTTPException(
            status_code=503,
            detail="PayPal Sandbox credentials are not configured.",
        )

    credentials = base64.b64encode(
        f"{client_id}:{client_secret}".encode()
    ).decode()

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{base_url}/v1/oauth2/token",
                headers={
                    "Authorization": f"Basic {credentials}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                data={"grant_type": "client_credentials"},
            )

        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail="PayPal authentication failed. Check your Sandbox credentials.",
            )

        return {
            "connected": True,
            "environment": "sandbox",
            "message": "PayPal authentication successful.",
        }

    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Could not reach PayPal Sandbox.",
        )


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

    if product["currency"] != "USD":
        return {
            "allowed": False,
            "decision": "REJECTED",
            "reason": "Product currency must be USD.",
            "requires_approval": True,
        }

    price = Decimal(str(product["price"]))
    budget = body.policy.max_budget_usd

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


@app.post("/api/agent/propose")
def create_purchase_proposal(body: PurchaseRequest):
    """Turn a natural-language request into a structured demo proposal."""
    request_text = body.request.strip()
    normalized = request_text.lower()

    # Extract maximum budget, e.g. "under $300", "below 250", "max $500", "budget 100"
    budget_match = re.search(
        r"\b(?:under|below|less than|maximum|max)\s*"
        r"(?:a budget of\s*)?\$?\s*([\d,]+(?:\.\d+)?)",
        normalized,
    )

    if not budget_match:
        budget_match = re.search(
            r"\bbudget\s*(?:of\s*)?\$?\s*([\d,]+(?:\.\d+)?)",
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
            if product["currency"] == "USD"
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
            "max_budget_usd": max_budget,
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


@app.post("/api/checkout/create")
async def create_checkout_order(body: CheckoutRequest):
    product = next(
        (p for p in DEMO_PRODUCTS if p["id"] == body.product_id),
        None,
    )

    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")

    if product["currency"] != "USD":
        raise HTTPException(
            status_code=400,
            detail="Only USD catalog products are supported.",
        )

    price_usd = Decimal(str(product["price"])).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    if price_usd > body.max_budget_usd:
        raise HTTPException(
            status_code=409,
            detail="Purchase rejected: product exceeds the spending limit.",
        )

    base_url = os.getenv(
        "PAYPAL_BASE_URL",
        "https://api-m.sandbox.paypal.com",
    ).rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            token = await get_paypal_access_token(client)

            response = await client.post(
                f"{base_url}/v2/checkout/orders",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "PayPal-Request-Id": uuid.uuid4().hex,
                },
                json={
                    "intent": "CAPTURE",
                    "purchase_units": [
                        {
                            "description": product["name"],
                            "custom_id": product["id"],
                            "amount": {
                                "currency_code": "USD",
                                "value": str(price_usd),
                            },
                        }
                    ],
                    "application_context": {
                        "brand_name": "PayPilot Demo",
                        "user_action": "PAY_NOW",
                        "return_url": "http://localhost:3000/checkout/return",
                        "cancel_url": "http://localhost:3000/checkout/cancel",
                    },
                },
            )
    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Could not reach PayPal Sandbox.",
        )

    if response.status_code not in (200, 201):
        raise HTTPException(
            status_code=502,
            detail="PayPal could not create the order.",
        )

    order = response.json()
    approval_url = next(
        (
            link["href"]
            for link in order.get("links", [])
            if link.get("rel") == "approve"
        ),
        None,
    )

    if not approval_url:
        raise HTTPException(
            status_code=502,
            detail="PayPal did not return an approval link.",
        )

    try:
        record_order(
            order_id=order["id"],
            product_id=product["id"],
            product_name=product["name"],
            price_usd=str(price_usd),
            budget_usd=str(body.max_budget_usd),
            checkout_amount=str(price_usd),
        )
    except Exception as err:
        print(f"Warning: Failed to record order transaction: {err}")

    return {
        "order_id": order["id"],
        "status": order["status"],
        "approval_url": approval_url,
        "product": {
            "id": product["id"],
            "name": product["name"],
            "price": str(price_usd),
            "currency": "USD",
        },
        "checkout": {
            "currency": "USD",
            "amount": str(price_usd),
        },
        "message": (
            "Sandbox order created. The buyer must approve it in PayPal. "
            "No payment has been captured yet."
        ),
    }


@app.post("/api/checkout/capture")
async def capture_checkout_order(body: CaptureRequest):
    base_url = os.getenv(
        "PAYPAL_BASE_URL",
        "https://api-m.sandbox.paypal.com",
    ).rstrip("/")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            token = await get_paypal_access_token(client)
            headers = {"Authorization": f"Bearer {token}"}

            order_response = await client.get(
                f"{base_url}/v2/checkout/orders/{body.order_id}",
                headers=headers,
            )

            if order_response.status_code != 200:
                raise HTTPException(
                    status_code=404,
                    detail="PayPal order not found.",
                )

            order = order_response.json()
            units = order.get("purchase_units", [])

            if len(units) != 1:
                raise HTTPException(
                    status_code=400,
                    detail="Unexpected order structure.",
                )

            unit = units[0]
            product_id = unit.get("custom_id")
            product = next(
                (p for p in DEMO_PRODUCTS if p["id"] == product_id),
                None,
            )

            if not product or product.get("currency") != "USD":
                raise HTTPException(
                    status_code=400,
                    detail="Order does not match a supported catalog product.",
                )

            price_usd = Decimal(str(product["price"])).quantize(
                Decimal("0.01"),
                rounding=ROUND_HALF_UP,
            )

            order_amount = unit.get("amount", {})

            if (
                order_amount.get("currency_code") != "USD"
                or order_amount.get("value") != str(price_usd)
            ):
                raise HTTPException(
                    status_code=400,
                    detail="PayPal order amount does not match the catalog amount.",
                )

            if order.get("status") == "COMPLETED":
                return {
                    "order_id": body.order_id,
                    "status": "COMPLETED",
                    "message": "This order has already been captured.",
                    "payment_authorized": True,
                    "product": product["name"],
                    "amount": str(price_usd),
                    "currency": "USD",
                }

            if order.get("status") != "APPROVED":
                raise HTTPException(
                    status_code=409,
                    detail="The buyer must approve this order before capture.",
                )

            capture_response = await client.post(
                f"{base_url}/v2/checkout/orders/{body.order_id}/capture",
                headers={
                    **headers,
                    "Content-Type": "application/json",
                    "PayPal-Request-Id": f"capture-{body.order_id}",
                },
                json={},
            )

            if capture_response.status_code not in (200, 201):
                raise HTTPException(
                    status_code=502,
                    detail="PayPal capture failed. Check the order status before retrying.",
                )

            captured_order = capture_response.json()

    except httpx.RequestError:
        raise HTTPException(
            status_code=502,
            detail="Could not reach PayPal. Verify the order status before retrying.",
        )

    captured_units = captured_order.get("purchase_units", [])
    captures = (
        captured_units[0].get("payments", {}).get("captures", [])
        if captured_units else []
    )

    verified_capture = next(
        (
            capture for capture in captures
            if capture.get("status") == "COMPLETED"
            and capture.get("amount", {}).get("currency_code") == "USD"
            and capture.get("amount", {}).get("value") == str(price_usd)
        ),
        None,
    )

    if captured_order.get("status") != "COMPLETED" or not verified_capture:
        raise HTTPException(
            status_code=502,
            detail="Capture returned, but completed payment could not be verified.",
        )
    updated_rows = mark_captured(
        order_id=body.order_id,
        capture_id=verified_capture["id"],
    )

    if updated_rows == 0:
        try:
            record_order(
                order_id=body.order_id,
                product_id=product["id"],
                product_name=product["name"],
                price_usd=str(price_usd),
                budget_usd=str(price_usd),
                checkout_amount=str(price_usd),
            )
            updated_rows = mark_captured(
                order_id=body.order_id,
                capture_id=verified_capture["id"],
            )
        except Exception:
            pass

    if updated_rows == 0:
        raise HTTPException(
            status_code=409,
            detail=(
                "Payment is verified, but the transaction record "
                "was not updated. Reconcile the order before retrying."
            ),
        )

    return {
        "order_id": body.order_id,
        "capture_id": verified_capture["id"],
        "status": "COMPLETED",
        "product": product["name"],
        "amount": str(price_usd),
        "currency": "USD",
        "payment_authorized": True,
        "message": "PayPal Sandbox capture verified successfully.",
    }


@app.get("/api/transactions")
def get_transactions(limit: int = Query(default=50, ge=1, le=100)):
    """List recent PayPilot transactions from the SQLite database."""
    items = list_transactions(limit=limit)
    return {
        "count": len(items),
        "transactions": items,
    }
