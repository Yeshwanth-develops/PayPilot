import base64
from decimal import Decimal, ROUND_HALF_UP
import json
import os
import re
from typing import Any, Dict, List, Optional
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx
from pydantic import BaseModel, Field

from database import (
    initialize_database,
    record_order,
    mark_captured,
    list_transactions,
    get_transaction,
    log_transaction_event,
    list_transaction_events,
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

frontend_origin_raw = os.getenv(
    "FRONTEND_ORIGIN",
    "http://localhost:3000",
)
frontend_origins = [o.strip() for o in frontend_origin_raw.split(",") if o.strip()]
if "http://localhost:3000" not in frontend_origins:
    frontend_origins.append("http://localhost:3000")
frontend_origin = frontend_origins[0]

app.add_middleware(
    CORSMiddleware,
    allow_origins=frontend_origins,
    allow_origin_regex=r"https://.*\.vercel\.app|https://.*\.onrender\.com|http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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


def evaluate_purchase_policy(
    product: dict,
    budget_usd: Decimal,
    require_approval: bool = True,
) -> dict:
    """Evaluate a product against PayPilot's existing spending policy."""

    price = Decimal(str(product["price"])).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )
    budget = Decimal(str(budget_usd)).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    checks = [
        {
            "name": "product_exists",
            "passed": True,
            "message": "Product exists in the PayPilot catalog.",
        },
        {
            "name": "currency",
            "passed": product.get("currency") == "USD",
            "message": "Product currency must be USD.",
        },
        {
            "name": "budget",
            "passed": price <= budget,
            "message": (
                "Product price is within your spending limit."
                if price <= budget
                else "Product price exceeds your maximum budget."
            ),
        },
    ]

    allowed = all(check["passed"] for check in checks)

    if not allowed:
        decision = "REJECTED"
        reason = next(
            check["message"]
            for check in checks
            if not check["passed"]
        )
    elif require_approval:
        decision = "APPROVAL_REQUIRED"
        reason = (
            "Product is within budget. User approval is still "
            "required before checkout."
        )
    else:
        decision = "ELIGIBLE_FOR_USER_APPROVAL"
        reason = (
            "Product is within budget. User approval is still "
            "required before payment."
        )

    return {
        "allowed": allowed,
        "decision": decision,
        "reason": reason,
        "requires_approval": True,
        "payment_authorized": False,
        "budget_analysis": {
            "currency": "USD",
            "product_price": str(price),
            "budget_limit": str(budget),
            "remaining_budget": str(budget - price),
            "within_budget": price <= budget,
        },
        "checks": checks,
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
            "payment_authorized": False,
            "budget_analysis": None,
            "checks": [
                {
                    "name": "product_exists",
                    "passed": False,
                    "message": "Product was not found in the catalog.",
                }
            ],
        }

    result = evaluate_purchase_policy(
        product=product,
        budget_usd=body.policy.max_budget_usd,
        require_approval=body.policy.require_approval,
    )

    return {
        **result,
        "product": product,
    }


async def parse_intent_with_gemini(request_text: str, api_key: str) -> Optional[dict]:
    """Extract shopping criteria using Google Gemini Flash models."""
    candidate_models = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-2.5-flash", "gemini-1.5-flash"]
    prompt = f"""You are PayPilot's Autonomous Commerce Agent.
Analyze the user's shopping request and extract search intent to match our catalog.
Available catalog categories: "Headphones", "Keyboards", "Accessories", "Storage".

User request: "{request_text}"

Respond with ONLY a JSON object:
{{
  "category": "Headphones" | "Keyboards" | "Accessories" | "Storage" | null,
  "max_budget_usd": number or null,
  "minimum_rating": number or null,
  "keywords": ["list", "of", "features"],
  "reasoning": "A concise 1-2 sentence explanation of why you selected these criteria."
}}
"""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            for model in candidate_models:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                resp = await client.post(
                    url,
                    headers={"Content-Type": "application/json"},
                    json={
                        "contents": [{"parts": [{"text": prompt}]}],
                        "generationConfig": {"response_mime_type": "application/json"},
                    },
                )
                if resp.status_code == 200:
                    raw_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                    data = json.loads(raw_text)
                    return {
                        "category": data.get("category"),
                        "max_budget_usd": float(data["max_budget_usd"]) if data.get("max_budget_usd") is not None else None,
                        "minimum_rating": float(data["minimum_rating"]) if data.get("minimum_rating") is not None else None,
                        "keywords": [str(k) for k in data.get("keywords", [])],
                        "reasoning": str(data.get("reasoning", "")),
                        "_model": model,
                    }
    except Exception as err:
        print(f"Gemini intent parsing note: {err}")
    return None


async def parse_intent_with_openai(request_text: str, api_key: str) -> Optional[dict]:
    """Extract shopping criteria using OpenAI."""
    url = "https://api.openai.com/v1/chat/completions"
    prompt = f"""You are PayPilot's Autonomous Commerce Agent.
Analyze the user's shopping request and extract search intent to match our catalog.
Available catalog categories: "Headphones", "Keyboards", "Accessories", "Storage".

User request: "{request_text}"

Respond with ONLY a JSON object:
{{
  "category": "Headphones" | "Keyboards" | "Accessories" | "Storage" | null,
  "max_budget_usd": number or null,
  "minimum_rating": number or null,
  "keywords": ["list", "of", "features"],
  "reasoning": "A concise 1-2 sentence explanation of why you selected these criteria."
}}
"""
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "gpt-4o-mini",
                    "messages": [
                        {"role": "system", "content": "You are a helpful commerce intent parser. Return valid JSON only."},
                        {"role": "user", "content": prompt},
                    ],
                    "response_format": {"type": "json_object"},
                },
            )
            if resp.status_code == 200:
                raw_text = resp.json()["choices"][0]["message"]["content"]
                data = json.loads(raw_text)
                return {
                    "category": data.get("category"),
                    "max_budget_usd": float(data["max_budget_usd"]) if data.get("max_budget_usd") is not None else None,
                    "minimum_rating": float(data["minimum_rating"]) if data.get("minimum_rating") is not None else None,
                    "keywords": [str(k) for k in data.get("keywords", [])],
                    "reasoning": str(data.get("reasoning", "")),
                }
    except Exception as err:
        print(f"OpenAI intent parsing note: {err}")
    return None


def parse_intent_with_rules(request_text: str) -> dict:
    """Robust deterministic parser when external LLM is not configured."""
    normalized = request_text.lower()

    budget_match = re.search(
        r"\b(?:under|below|less than|maximum|max|up to)\s*"
        r"(?:a budget of\s*)?\$?\s*([\d,]+(?:\.\d+)?)",
        normalized,
    )
    if not budget_match:
        budget_match = re.search(
            r"\bbudget\s*(?:of\s*)?\$?\s*([\d,]+(?:\.\d+)?)",
            normalized,
        )
    if not budget_match:
        budget_match = re.search(
            r"\$([0-9]+(?:\.[0-9]+)?)|\b([0-9]+(?:\.[0-9]+)?)\s*(?:dollars|usd|bucks)",
            normalized,
        )

    max_budget = None
    if budget_match:
        val = budget_match.group(1) or (budget_match.group(2) if len(budget_match.groups()) > 1 else None)
        if val:
            try:
                max_budget = float(val.replace(",", ""))
            except ValueError:
                pass

    rating_match = re.search(
        r"(?:rating|rated|stars)\s*(?:above|over|at least|of|\>=?)?\s*"
        r"([1-5](?:\.\d+)?)",
        normalized,
    )
    min_rating = float(rating_match.group(1)) if rating_match else None

    categories = {
        "Headphones": ["headphones", "headphone", "earbuds", "airpods", "earphones", "audio", "sound"],
        "Accessories": ["mouse", "mice", "accessories", "accessory", "trackpad"],
        "Keyboards": ["keyboard", "keyboards", "typing", "mechanical"],
        "Storage": ["ssd", "storage", "drive", "disk", "nvme", "solid state"],
    }

    selected_category = next(
        (
            cat
            for cat, keywords in categories.items()
            if any(keyword in normalized for keyword in keywords)
        ),
        None,
    )

    feature_words = [
        "wireless", "wired", "bluetooth", "noise-cancelling", "noise cancelling",
        "compact", "gaming", "quiet", "ergonomic", "mechanical", "fast"
    ]
    extracted_keywords = [word for word in feature_words if word in normalized]

    reasoning_parts = []
    if selected_category:
        reasoning_parts.append(f"targeted {selected_category}")
    if max_budget is not None:
        reasoning_parts.append(f"enforced a strict ${max_budget:.2f} ceiling")
    if min_rating is not None:
        reasoning_parts.append(f"required customer rating >= {min_rating:.1f}")
    if extracted_keywords:
        reasoning_parts.append(f"prioritized '{', '.join(extracted_keywords)}' features")

    reasoning = (
        f"Autonomous agent {' and '.join(reasoning_parts)} to match your intent."
        if reasoning_parts
        else "Analyzed your request against catalog specifications to find optimal value matches."
    )

    return {
        "category": selected_category,
        "max_budget_usd": max_budget,
        "minimum_rating": min_rating,
        "keywords": extracted_keywords,
        "reasoning": reasoning,
    }


@app.post("/api/agent/propose")
async def create_purchase_proposal(body: PurchaseRequest):
    """Turn a natural-language request into a structured AI purchase proposal."""
    request_text = body.request.strip()

    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    openai_key = os.getenv("OPENAI_API_KEY", "").strip()

    criteria = None
    engine = "PayPilot Autonomous Rules Engine"

    if gemini_key:
        criteria = await parse_intent_with_gemini(request_text, gemini_key)
        if criteria:
            model_name = criteria.pop("_model", "gemini-3.8-flash")
            engine = f"Google {model_name} (AI Agent)"

    if not criteria and openai_key:
        criteria = await parse_intent_with_openai(request_text, openai_key)
        if criteria:
            engine = "OpenAI GPT-4o-mini (AI Agent)"

    if not criteria:
        criteria = parse_intent_with_rules(request_text)
        engine = "PayPilot Autonomous Rules Engine"

    selected_category = criteria.get("category")
    max_budget = criteria.get("max_budget_usd")
    min_rating = criteria.get("minimum_rating")
    keywords = [k.lower() for k in criteria.get("keywords") or []]
    reasoning = criteria.get("reasoning") or "Matched criteria against catalog."

    candidates = list(DEMO_PRODUCTS)

    if selected_category:
        cat_lower = selected_category.lower()
        candidates = [
            p for p in candidates
            if p["category"].lower() == cat_lower
        ]

    if max_budget is not None:
        candidates = [
            p for p in candidates
            if p["currency"] == "USD" and p["price"] <= max_budget
        ]

    if min_rating is not None:
        candidates = [
            p for p in candidates
            if p["rating"] >= min_rating
        ]

    def relevance_score(product: dict) -> int:
        score = 0
        text = f"{product['name']} {product['description']} {product['category']}".lower()
        for kw in keywords:
            if kw in text:
                score += 10
        return score

    candidates = sorted(
        candidates,
        key=lambda p: (-relevance_score(p), -p["rating"], p["price"]),
    )

    proposal_id = f"prop-{uuid.uuid4().hex[:8]}"

    return {
        "proposal_id": proposal_id,
        "status": "PROPOSED",
        "user_request": request_text,
        "engine": engine,
        "reasoning": reasoning,
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
async def create_checkout_order(body: CheckoutRequest, request: Request):
    product = next(
        (p for p in DEMO_PRODUCTS if p["id"] == body.product_id),
        None,
    )

    if product is None:
        raise HTTPException(status_code=404, detail="Product not found.")

    price_usd = Decimal(str(product["price"])).quantize(
        Decimal("0.01"),
        rounding=ROUND_HALF_UP,
    )

    policy_result = evaluate_purchase_policy(
        product=product,
        budget_usd=body.max_budget_usd,
        require_approval=True,
    )

    if not policy_result["allowed"]:
        raise HTTPException(
            status_code=409,
            detail={
                "message": policy_result["reason"],
                "policy": policy_result,
            },
        )

    base_url = os.getenv(
        "PAYPAL_BASE_URL",
        "https://api-m.sandbox.paypal.com",
    ).rstrip("/")

    req_origin = request.headers.get("origin")
    target_origin = (
        req_origin.rstrip("/")
        if req_origin and ("vercel.app" in req_origin or "localhost" in req_origin)
        else frontend_origin.rstrip("/")
    )

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
                        "return_url": f"{target_origin}/checkout/return",
                        "cancel_url": f"{target_origin}/checkout/cancel",
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
        log_transaction_event(
            order_id=order["id"],
            event_type="ORDER_CREATED",
            outcome="SUCCESS",
            message="PayPal Sandbox order created after policy approval.",
            metadata={
                "product_id": product["id"],
                "currency": "USD",
                "checkout_amount": str(price_usd),
                "policy_decision": "APPROVED",
            },
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
                existing_capture = None
                captures = unit.get("payments", {}).get("captures", [])
                if captures:
                    existing_capture = captures[0].get("id")

                if existing_capture:
                    updated = mark_captured(body.order_id, existing_capture)
                    if updated == 0:
                        try:
                            record_order(
                                order_id=body.order_id,
                                product_id=product["id"],
                                product_name=product["name"],
                                price_usd=str(price_usd),
                                budget_usd=str(price_usd),
                                checkout_amount=str(price_usd),
                            )
                            mark_captured(body.order_id, existing_capture)
                        except Exception as err:
                            print(f"Warning: Failed to record already-captured order: {err}")

                return {
                    "order_id": body.order_id,
                    "capture_id": existing_capture,
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
            mark_captured(
                order_id=body.order_id,
                capture_id=verified_capture["id"],
            )
        except Exception as err:
            print(f"Warning: Failed to update local transaction record: {err}")

    try:
        log_transaction_event(
            order_id=body.order_id,
            event_type="CAPTURE_VERIFIED",
            outcome="SUCCESS",
            message="PayPal capture verified by the backend.",
            metadata={
                "capture_id": verified_capture["id"],
                "currency": "USD",
            },
        )
    except Exception as err:
        print(f"Warning: Failed to log transaction capture event: {err}")

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


@app.get("/api/transactions/{order_id}")
def get_transaction_details(order_id: str):
    """Return one transaction for the detail view."""
    transaction = get_transaction(order_id)

    if transaction is None:
        raise HTTPException(
            status_code=404,
            detail="Transaction not found.",
        )

    return {"transaction": transaction}


@app.get("/api/transactions/{order_id}/events")
def get_transaction_audit_events(order_id: str):
    """Return the audit events for one order."""
    transaction = get_transaction(order_id)

    if transaction is None:
        raise HTTPException(
            status_code=404,
            detail="Transaction not found.",
        )

    return {
        "order_id": order_id,
        "events": list_transaction_events(order_id),
    }
