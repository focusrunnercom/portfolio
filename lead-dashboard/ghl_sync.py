#!/usr/bin/env python3
"""
GoHighLevel Webhook Sync — pushes captured leads from local Flask DB to GHL Contacts API.

Usage:
    python3 ghl_sync.py                   # Live sync
    python3 ghl_sync.py --dry-run         # Dry-run: show what would be sent
    python3 ghl_sync.py --limit 5         # Sync at most 5 leads

Requires:
    - GHL_API_KEY environment variable
    - leads.db with leads table (score IS NOT NULL, ghl_synced IS NULL)
"""

import os
import sys
import json
import sqlite3
import datetime
import logging
from pathlib import Path
from typing import Optional

import requests

# ─── Logging ────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger("ghl_sync")

# ─── Config ─────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "leads.db"
GHL_API_BASE = "https://rest.gohighlevel.com/v1/contacts/"
GHL_API_KEY = os.environ.get("GHL_API_KEY", "")

# ─── Database helpers ───────────────────────────────────────

def ensure_columns():
    """Add ghl_synced and ghl_contact_id columns if they don't exist."""
    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.execute("PRAGMA table_info(leads)")
    existing = {row[1] for row in cursor.fetchall()}
    changes = False
    if "ghl_synced" not in existing:
        conn.execute("ALTER TABLE leads ADD COLUMN ghl_synced TEXT")
        logger.info("Added column: ghl_synced")
        changes = True
    if "ghl_contact_id" not in existing:
        conn.execute("ALTER TABLE leads ADD COLUMN ghl_contact_id TEXT")
        logger.info("Added column: ghl_contact_id")
        changes = True
    if changes:
        conn.commit()
    conn.close()


def get_unsynced_leads(limit: Optional[int] = None) -> list[dict]:
    """Fetch leads that have a score but haven't been synced to GHL."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    query = "SELECT * FROM leads WHERE score IS NOT NULL AND score != '' AND ghl_synced IS NULL ORDER BY id"
    if limit:
        query += f" LIMIT {limit}"
    rows = conn.execute(query).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def mark_synced(lead_id: int, ghl_contact_id: str):
    """Mark a lead as synced to GHL."""
    conn = sqlite3.connect(str(DB_PATH))
    now = datetime.datetime.utcnow().isoformat()
    conn.execute(
        "UPDATE leads SET ghl_synced = ?, ghl_contact_id = ? WHERE id = ?",
        (now, ghl_contact_id, lead_id),
    )
    conn.commit()
    conn.close()


def mark_failed(lead_id: int, reason: str):
    """Mark a lead as sync-failed with error reason stored in ghl_synced."""
    conn = sqlite3.connect(str(DB_PATH))
    error_marker = f"FAILED:{datetime.datetime.utcnow().isoformat()}:{reason[:200]}"
    conn.execute(
        "UPDATE leads SET ghl_synced = ? WHERE id = ?",
        (error_marker, lead_id),
    )
    conn.commit()
    conn.close()


# ─── GHL API ────────────────────────────────────────────────

def build_ghl_payload(lead: dict) -> dict:
    """Map our lead schema to GHL Contact API fields."""
    # Parse score numeric value from 'hot_85', 'warm_60', etc.
    score_str = lead.get("score", "cold_25")
    try:
        score_parts = score_str.split("_")
        score_category = score_parts[0] if len(score_parts) > 0 else "cold"
        score_value = int(score_parts[1]) if len(score_parts) > 1 else 25
    except (ValueError, IndexError):
        score_category = "cold"
        score_value = 25

    # Build custom fields
    custom_fields = []

    # Map volume and spend
    volume = lead.get("volume", "0")
    spend = lead.get("spend", "0")
    if volume:
        custom_fields.append({
            "key": "monthly_volume",
            "field_value": str(volume),
        })
    if spend:
        custom_fields.append({
            "key": "monthly_ad_spend",
            "field_value": str(spend),
        })

    # Score breakdown
    custom_fields.append({
        "key": "lead_score",
        "field_value": score_str,
    })
    custom_fields.append({
        "key": "score_category",
        "field_value": score_category,
    })
    custom_fields.append({
        "key": "score_value",
        "field_value": str(score_value),
    })

    # Source
    custom_fields.append({
        "key": "source",
        "field_value": lead.get("source", "web"),
    })

    # Practice type
    practice = lead.get("practice", "")
    if practice:
        custom_fields.append({
            "key": "practice_type",
            "field_value": practice,
        })

    # Message
    message = lead.get("message", "")
    if message:
        custom_fields.append({
            "key": "lead_message",
            "field_value": message[:500],
        })

    payload = {
        "name": lead.get("name", ""),
        "email": lead.get("email", ""),
        "phone": lead.get("phone", ""),
        "customField": custom_fields if custom_fields else None,
        "tags": [f"focusrunner-{score_category}", "focusrunner-lead"],
        "source": "FocusRunner Lead Sync",
    }

    # Remove None values
    return {k: v for k, v in payload.items() if v is not None}


def send_to_ghl(lead: dict) -> Optional[str]:
    """POST a lead to GHL Contacts API. Returns contact ID on success, None on failure."""
    if not GHL_API_KEY:
        logger.error("GHL_API_KEY not set in environment")
        return None

    payload = build_ghl_payload(lead)
    headers = {
        "Authorization": f"Bearer {GHL_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        resp = requests.post(
            GHL_API_BASE,
            json=payload,
            headers=headers,
            timeout=30,
        )
        if resp.status_code in (200, 201):
            data = resp.json()
            contact_id = data.get("contact", {}).get("id", data.get("id", ""))
            logger.info(f"GHL sync OK — lead #{lead['id']} ({lead['email']}) → contact {contact_id}")
            return contact_id
        else:
            error_body = resp.text[:500]
            logger.error(f"GHL sync FAIL — lead #{lead['id']} ({lead['email']}) — HTTP {resp.status_code}: {error_body}")
            return None
    except requests.exceptions.Timeout:
        logger.error(f"GHL sync TIMEOUT — lead #{lead['id']} ({lead['email']})")
        return None
    except requests.exceptions.ConnectionError as e:
        logger.error(f"GHL sync CONNECTION ERROR — lead #{lead['id']} ({lead['email']}): {e}")
        return None
    except Exception as e:
        logger.error(f"GHL sync ERROR — lead #{lead['id']} ({lead['email']}): {e}")
        return None


# ─── Main Sync ──────────────────────────────────────────────

def run_sync(dry_run: bool = False, limit: Optional[int] = None) -> dict:
    """Run the sync. Returns a result summary dict."""
    if not GHL_API_KEY:
        return {"error": "GHL_API_KEY not set in environment", "synced": 0, "failed": 0, "skipped": 0, "total": 0}

    ensure_columns()
    leads = get_unsynced_leads(limit)

    if not leads:
        logger.info("No unsynced leads found")
        return {"synced": 0, "failed": 0, "skipped": 0, "total": 0}

    results = {"synced": 0, "failed": 0, "skipped": 0, "total": len(leads), "details": []}

    for lead in leads:
        if dry_run:
            payload = build_ghl_payload(lead)
            results["skipped"] += 1
            results["details"].append({
                "id": lead["id"],
                "name": lead["name"],
                "email": lead["email"],
                "score": lead.get("score"),
                "dry_run": True,
                "payload": payload,
            })
            logger.info(f"[DRY-RUN] Would sync lead #{lead['id']} ({lead['email']})")
            continue

        contact_id = send_to_ghl(lead)
        if contact_id:
            mark_synced(lead["id"], contact_id)
            results["synced"] += 1
            results["details"].append({
                "id": lead["id"],
                "name": lead["name"],
                "email": lead["email"],
                "ghl_contact_id": contact_id,
                "status": "synced",
            })
        else:
            mark_failed(lead["id"], "API error")
            results["failed"] += 1
            results["details"].append({
                "id": lead["id"],
                "name": lead["name"],
                "email": lead["email"],
                "status": "failed",
            })

    return results


# ─── CLI Entry ──────────────────────────────────────────────

if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv
    limit = None
    for i, arg in enumerate(sys.argv):
        if arg in ("--limit", "-l") and i + 1 < len(sys.argv):
            try:
                limit = int(sys.argv[i + 1])
            except ValueError:
                pass

    if dry_run:
        logger.info("=== DRY RUN MODE ===")

    result = run_sync(dry_run=dry_run, limit=limit)
    print(json.dumps(result, indent=2))

    if result.get("error"):
        sys.exit(1)
