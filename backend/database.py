from contextlib import contextmanager
from pathlib import Path
import sqlite3
from typing import Any, Dict, List, Optional

import json

DB_PATH = Path(__file__).resolve().parent / "paypilot.db"


@contextmanager
def get_connection():
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def get_db_connection():
    return get_connection()


def initialize_database() -> None:
    with get_connection() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                paypal_order_id TEXT UNIQUE NOT NULL,
                paypal_capture_id TEXT,
                product_id TEXT NOT NULL,
                product_name TEXT NOT NULL,
                catalog_price_usd TEXT NOT NULL,
                budget_limit_usd TEXT NOT NULL,
                checkout_amount TEXT NOT NULL,
                checkout_currency TEXT NOT NULL DEFAULT 'USD',
                policy_decision TEXT NOT NULL,
                payment_status TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT
                    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT
                    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
        """)


        connection.execute("""
            CREATE TABLE IF NOT EXISTS transaction_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                paypal_order_id TEXT NOT NULL,
                event_type TEXT NOT NULL,
                outcome TEXT NOT NULL,
                message TEXT NOT NULL,
                metadata_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL DEFAULT
                    (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
        """)

        connection.execute("""
            CREATE INDEX IF NOT EXISTS
            idx_transaction_events_order_id
            ON transaction_events(paypal_order_id, id)
        """)


def log_transaction_event(
    order_id: str,
    event_type: str,
    outcome: str,
    message: str,
    metadata: Optional[Dict[str, Any]] = None,
) -> None:
    """Append a safe audit event for a PayPal order."""
    metadata_json = json.dumps(
        metadata or {},
        separators=(",", ":"),
        default=str,
    )

    with get_connection() as connection:
        connection.execute(
            """
            INSERT INTO transaction_events (
                paypal_order_id,
                event_type,
                outcome,
                message,
                metadata_json
            )
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                order_id,
                event_type,
                outcome,
                message,
                metadata_json,
            ),
        )


def list_transaction_events(
    order_id: str,
    limit: int = 100,
) -> List[Dict[str, Any]]:
    """Return the audit history for one order, oldest first."""
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT
                id,
                paypal_order_id,
                event_type,
                outcome,
                message,
                metadata_json,
                created_at
            FROM transaction_events
            WHERE paypal_order_id = ?
            ORDER BY id ASC
            LIMIT ?
            """,
            (order_id, max(1, min(limit, 500))),
        ).fetchall()

        events = []
        for row in rows:
            event = dict(row)
            try:
                event["metadata"] = json.loads(
                    event.pop("metadata_json")
                )
            except (json.JSONDecodeError, TypeError):
                event["metadata"] = {}
            events.append(event)

        return events


def record_order(
    order_id: str,
    product_id: str,
    product_name: str,
    price_usd: str,
    budget_usd: str,
    checkout_amount: str,
    policy_decision: str = "APPROVED",
) -> None:
    with get_connection() as connection:
        connection.execute("""
            INSERT INTO transactions (
                paypal_order_id,
                product_id,
                product_name,
                catalog_price_usd,
                budget_limit_usd,
                checkout_amount,
                checkout_currency,
                policy_decision,
                payment_status
            )
            VALUES (?, ?, ?, ?, ?, ?, 'USD', ?, 'CREATED')
            ON CONFLICT(paypal_order_id) DO UPDATE SET
                product_id = excluded.product_id,
                product_name = excluded.product_name,
                catalog_price_usd = excluded.catalog_price_usd,
                budget_limit_usd = excluded.budget_limit_usd,
                checkout_amount = excluded.checkout_amount,
                policy_decision = excluded.policy_decision,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
        """, (
            order_id,
            product_id,
            product_name,
            str(price_usd),
            str(budget_usd),
            str(checkout_amount),
            policy_decision,
        ))


def mark_captured(order_id: str, capture_id: str) -> int:
    with get_connection() as connection:
        cursor = connection.execute("""
            UPDATE transactions
            SET paypal_capture_id = ?,
                payment_status = 'COMPLETED',
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE paypal_order_id = ?
              AND payment_status IN ('CREATED', 'APPROVED')
        """, (capture_id, order_id))

        if cursor.rowcount > 0:
            return cursor.rowcount

        # If 0 rows updated, check if the record exists and is already COMPLETED
        existing = connection.execute("""
            SELECT id, payment_status, paypal_capture_id
            FROM transactions
            WHERE paypal_order_id = ?
        """, (order_id,)).fetchone()

        if existing:
            # Ensure capture_id is recorded if it was missing
            if not existing["paypal_capture_id"] and capture_id:
                connection.execute("""
                    UPDATE transactions
                    SET paypal_capture_id = ?,
                        payment_status = 'COMPLETED',
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
                    WHERE paypal_order_id = ?
                """, (capture_id, order_id))
            return 1

        return 0


def list_transactions(limit: int = 50) -> List[Dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute("""
            SELECT *
            FROM transactions
            ORDER BY id DESC
            LIMIT ?
        """, (limit,)).fetchall()
        return [dict(row) for row in rows]


def get_transaction(order_id: str) -> Optional[Dict[str, Any]]:
    """Fetch one transaction using its PayPal order ID."""
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM transactions
            WHERE paypal_order_id = ?
            LIMIT 1
            """,
            (order_id,),
        ).fetchone()

        return dict(row) if row else None
