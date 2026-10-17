from contextlib import contextmanager
from pathlib import Path
import sqlite3
from typing import Any, Dict, List, Optional

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
        return cursor.rowcount


def list_transactions(limit: int = 50) -> List[Dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute("""
            SELECT *
            FROM transactions
            ORDER BY id DESC
            LIMIT ?
        """, (limit,)).fetchall()
        return [dict(row) for row in rows]
