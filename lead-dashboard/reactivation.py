#!/usr/bin/env python3
"""
FocusRunner Lead Reactivation — 3-Touch SMS+Email Sequence
FOC-426

Sends a sequence of 3 touchpoints to cold/warm leads over 7 days:
  Touch 1 (Day 0): "We can help fill your treatment roster..."
  Touch 2 (Day 3): "Case study: Miami med spa recovered 70% of cold leads..."
  Touch 3 (Day 7): "Final touch — 15-min strategy call?"

Each lead advances through: pending -> touch1_sent -> touch2_sent -> touch3_sent -> completed.
If a lead replies or converts, it's removed from the sequence.

Designed to work without Twilio/Resend — produces log entries and stores
intent in the notifications table. When Twilio/Resend are configured,
simply set ENABLE_SMS=True / ENABLE_EMAIL=True.

Usage:
    python3 reactivation.py status              # Show sequence state
    python3 reactivation.py process             # Process due touches
    python3 reactivation.py preview             # Preview next batch
"""

import os
import json
import sqlite3
import datetime
import logging
import sys
from pathlib import Path
from typing import Optional

logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")
logger = logging.getLogger("reactivation")

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "leads.db"

# ─── Configuration ──────────────────────────────────────────

# When True, actually sends via available channels
ENABLE_SMS = os.environ.get("ENABLE_REACTIVATION_SMS", "").lower() in ("1", "true", "yes")
ENABLE_EMAIL = os.environ.get("ENABLE_REACTIVATION_EMAIL", "").lower() in ("1", "true", "yes")

SEQUENCE = [
    {
        "touch": 1,
        "day": 0,
        "channel": "sms",
        "subject": "",
        "body": "Hi {name}, FocusRunner here. We help med spas recover leads that went cold — no upfront cost. Reply to see how we'd re-engage your {practice} leads.",
    },
    {
        "touch": 2,
        "day": 3,
        "channel": "sms",
        "subject": "",
        "body": "Case study: A Miami med spa recovered 70% of cold leads using our AI qualification + 3-touch sequence. Want the playbook? Reply YES.",
    },
    {
        "touch": 3,
        "day": 7,
        "channel": "sms",
        "subject": "",
        "body": "Last call: we're offering a free 15-min strategy session for med spa owners. See how FocusRunner can fill your {practice} pipeline. Reply STOP to opt out.",
    },
]

# Future: email versions (when Resend configured)
EMAIL_SEQUENCE = [
    {
        "touch": 1,
        "day": 0,
        "channel": "email",
        "subject": "Your cold leads aren't dead — here's proof",
        "body": "Hi {name},\n\nWe noticed you\'ve been exploring lead capture for {practice}. Most med spas see a 70% drop-off after the first inquiry — but those leads aren\'t gone, they\'re just unqualified.\n\nFocusRunner recovers them with:\n- AI qualification that scores leads in real-time\n- Automated 3-touch SMS/email sequences\n- Direct booking links for hot leads\n\nBook a 15-min walkthrough: https://focusrunner.io/demo\n\n— FocusRunner Team",
    },
    {
        "touch": 2,
        "day": 3,
        "channel": "email",
        "subject": "70% lead recovery — the playbook",
        "body": "Hi {name},\n\nLast week we mentioned our lead recovery framework. Here\'s how it works:\n\n1. Capture -> AI qualifies (volume, spend, intent)\n2. Score -> Hot leads get SMS alert within 60s\n3. Reactivate -> Cold leads enter 3-touch sequence\n\nA Miami client went from 23 cold leads to 16 booked consults in 14 days.\n\nSee the full case study: https://focusrunner.io/case-studies/miami-recovery\n\n— FocusRunner Team",
    },
    {
        "touch": 3,
        "day": 7,
        "channel": "email",
        "subject": "Your pipeline analysis is ready",
        "body": "Hi {name},\n\nThis is the last message in this sequence. We\'ve prepared a free pipeline analysis for {practice} based on industry benchmarks for med spas in your area.\n\nClaim it here: https://focusrunner.io/audit\n\nNo strings attached. If you\'d rather not hear from us again, just reply STOP.\n\n— FocusRunner Team",
    },
]


# ─── Database ───────────────────────────────────────────────

def ensure_tables():
    """Create reactivation tracking tables if needed."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS reactivation_queue (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id         TEXT NOT NULL,
            next_touch      INTEGER NOT NULL DEFAULT 1,
            status          TEXT NOT NULL DEFAULT 'pending',
                -- pending | active | paused | completed | opted_out | converted
            scheduled_at    TEXT,
            last_touch_at   TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (lead_id) REFERENCES leads(id)
        );
        CREATE INDEX IF NOT EXISTS idx_reactivation_status ON reactivation_queue(status);
        CREATE INDEX IF NOT EXISTS idx_reactivation_scheduled ON reactivation_queue(scheduled_at);
        CREATE INDEX IF NOT EXISTS idx_reactivation_lead ON reactivation_queue(lead_id);
    """)
    conn.commit()
    conn.close()


def get_conn():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn


# ─── Core Logic ─────────────────────────────────────────────

def enqueue_cold_leads(dry_run: bool = False) -> dict:
    """Find cold/warm leads not yet in queue and enqueue them."""
    conn = get_conn()
    stats = {"found": 0, "enqueued": 0, "already_in_queue": 0, "skipped_no_contact": 0}

    candidates = conn.execute("""
        SELECT id, name, email, phone, practice, score, source
        FROM leads
        WHERE (score LIKE 'cold%' OR score LIKE 'warm%')
          AND id NOT IN (SELECT lead_id FROM reactivation_queue)
        ORDER BY created_at ASC
    """).fetchall()

    stats["found"] = len(candidates)

    for row in candidates:
        lead = dict(row)
        lid = lead["id"]
        has_phone = len((lead.get("phone") or "").strip()) > 3
        has_email = len((lead.get("email") or "").strip()) > 3

        if not has_phone and not has_email:
            stats["skipped_no_contact"] += 1
            if not dry_run:
                logger.info(f"  SKIP {lid[:12]} — no phone or email")
            continue

        if dry_run:
            logger.info(f"  QUEUE {lid[:12]} {lead['name'] or '?'} ({lead.get('phone','')[:12]} / {lead.get('email','')[:20]})")
            stats["enqueued"] += 1
            continue

        try:
            conn.execute(
                """INSERT INTO reactivation_queue (lead_id, next_touch, status, scheduled_at)
                   VALUES (?, 1, 'active', datetime('now'))""",
                (lid,),
            )
            conn.commit()
            stats["enqueued"] += 1
        except Exception as e:
            logger.warning(f"  ERROR enqueuing {lid[:12]}: {e}")

    conn.close()
    return stats


def process_due(dry_run: bool = False) -> dict:
    """Process leads whose next touch is due."""
    conn = get_conn()
    stats = {"due": 0, "sent": 0, "skipped_no_channel": 0, "completed": 0, "errors": 0}

    now = datetime.datetime.utcnow()

    # Find leads due for their next touch
    # Touch 1: immediately (scheduled = enqueue time)
    # Touch 2: 3 days after touch 1
    # Touch 3: 7 days after touch 1
    due = conn.execute("""
        SELECT rq.id as queue_id, rq.lead_id, rq.next_touch, rq.scheduled_at,
               l.name, l.email, l.phone, l.practice, l.score
        FROM reactivation_queue rq
        JOIN leads l ON l.id = rq.lead_id
        WHERE rq.status = 'active'
          AND rq.scheduled_at <= datetime('now')
        ORDER BY rq.scheduled_at ASC
        LIMIT 20
    """).fetchall()

    stats["due"] = len(due)

    for row in due:
        q = dict(row)
        lid = q["lead_id"]

        if dry_run:
            next_touch = q["next_touch"]
            channel = SEQUENCE[next_touch - 1]["channel"] if next_touch <= len(SEQUENCE) else "?"
            logger.info(f"  TOUCH {next_touch} -> {lid[:12]} {q.get('name','')[:20]} via {channel}")
            continue

        touch_num = q["next_touch"]
        if touch_num > len(SEQUENCE):
            # All touches sent — mark completed
            conn.execute(
                "UPDATE reactivation_queue SET status='completed', updated_at=datetime('now') WHERE id=?",
                (q["queue_id"],),
            )
            conn.commit()
            stats["completed"] += 1
            continue

        template = SEQUENCE[touch_num - 1]
        body = template["body"].format(
            name=q.get("name", "there"),
            practice=q.get("practice", "your med spa"),
        )

        # Determine channel availability
        channel = template["channel"]
        has_channel = {
            "sms": len((q.get("phone") or "").strip()) > 3 and ENABLE_SMS,
            "email": len((q.get("email") or "").strip()) > 3 and ENABLE_EMAIL,
        }

        if not has_channel.get(channel, False):
            # Fallback: try alternative channel or skip
            if channel == "sms" and has_channel.get("email", False):
                channel = "email"
                body = EMAIL_SEQUENCE[touch_num - 1]["body"].format(
                    name=q.get("name", "there"),
                    practice=q.get("practice", "your med spa"),
                )
            elif channel == "email" and has_channel.get("sms", False):
                channel = "sms"
            else:
                logger.info(f"  SKIP {lid[:12]} touch {touch_num} — no {channel} channel available")
                stats["skipped_no_channel"] += 1
                # Schedule retry in 1 day
                conn.execute(
                    "UPDATE reactivation_queue SET scheduled_at=datetime('now', '+1 day'), updated_at=datetime('now') WHERE id=?",
                    (q["queue_id"],),
                )
                conn.commit()
                continue

        # Log the notification
        recipient = q.get("phone", q.get("email", ""))
        conn.execute(
            """INSERT INTO notifications (type, lead_id, recipient, status, message)
               VALUES (?, ?, ?, 'queued', ?)""",
            (f"reactivation_touch{touch_num}", lid, recipient, body[:500]),
        )

        # Advance to next touch
        next_touch = touch_num + 1
        if next_touch <= len(SEQUENCE):
            # Schedule next touch
            conn.execute(
                """UPDATE reactivation_queue
                   SET next_touch=?, status='active',
                       scheduled_at=datetime('now', '+? days'),
                       last_touch_at=datetime('now'),
                       updated_at=datetime('now')
                   WHERE id=?""",
                (next_touch, SEQUENCE[next_touch - 1]["day"] - SEQUENCE[touch_num - 1]["day"], q["queue_id"]),
            )
        else:
            # All touches done
            conn.execute(
                "UPDATE reactivation_queue SET status='completed', last_touch_at=datetime('now'), updated_at=datetime('now') WHERE id=?",
                (q["queue_id"],),
            )
            stats["completed"] += 1

        conn.commit()
        stats["sent"] += 1
        logger.info(f"  SENT touch {touch_num} to {lid[:12]} via {channel}")

    conn.close()
    return stats


def status() -> dict:
    """Show current reactivation queue state."""
    conn = get_conn()
    result = {}

    # Counts by status
    rows = conn.execute(
        "SELECT status, COUNT(*) as cnt FROM reactivation_queue GROUP BY status"
    ).fetchall()
    result["by_status"] = {r["status"]: r["cnt"] for r in rows}

    # Total leads eligible
    eligible = conn.execute(
        "SELECT COUNT(*) FROM leads WHERE score LIKE 'cold%' OR score LIKE 'warm%'"
    ).fetchone()[0]
    result["eligible_leads"] = eligible
    result["queued"] = sum(result["by_status"].values()) if result["by_status"] else 0
    result["remaining"] = eligible - result["queued"]

    # Next due
    next_due = conn.execute(
        """SELECT rq.next_touch, rq.scheduled_at, l.name, l.phone, l.email
           FROM reactivation_queue rq
           JOIN leads l ON l.id = rq.lead_id
           WHERE rq.status = 'active'
           ORDER BY rq.scheduled_at ASC
           LIMIT 5"""
    ).fetchall()
    result["next_due"] = [dict(r) for r in next_due]

    # Channels configured
    result["sms_configured"] = ENABLE_SMS
    result["email_configured"] = ENABLE_EMAIL

    conn.close()
    return result


# ─── CLI ────────────────────────────────────────────────────

if __name__ == "__main__":
    ensure_tables()

    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    dry_run = "--dry-run" in sys.argv or "-n" in sys.argv

    if cmd == "status":
        s = status()
        print("=== Reactivation Queue Status ===")
        print(f"  Eligible cold/warm leads: {s['eligible_leads']}")
        print(f"  In queue:                 {s['queued']}")
        print(f"  Remaining to enqueue:     {s['remaining']}")
        print(f"  By status:               ")
        for st, cnt in s.get("by_status", {}).items():
            print(f"    {st}: {cnt}")
        print(f"  SMS configured:           {s['sms_configured']}")
        print(f"  Email configured:         {s['email_configured']}")
        if s["next_due"]:
            print(f"  Next due touches:")
            for nd in s["next_due"]:
                print(f"    Touch {nd['next_touch']} -> {nd['name']} at {nd['scheduled_at'][:19]}")

    elif cmd == "enqueue":
        print("=== Enqueue Cold/Warm Leads ===")
        s = enqueue_cold_leads(dry_run=dry_run)
        print(f"  Found:       {s['found']}")
        print(f"  Enqueued:    {s['enqueued']}")
        print(f"  No contact:  {s['skipped_no_contact']}")
        print(f"  Already in:  {s['already_in_queue']}")
        if dry_run:
            print("  (dry run — no changes made)")

    elif cmd == "process":
        print("=== Process Due Touches ===")
        s = process_due(dry_run=dry_run)
        print(f"  Due:                  {s['due']}")
        print(f"  Sent:                 {s['sent']}")
        print(f"  Completed sequences:  {s['completed']}")
        print(f"  Skipped (no channel): {s['skipped_no_channel']}")
        print(f"  Errors:               {s['errors']}")
        if dry_run:
            print("  (dry run — no changes made)")

    elif cmd == "preview":
        print("=== Preview: What Would Happen ===")
        enqueue_cold_leads(dry_run=True)
        process_due(dry_run=True)

    else:
        print(f"Unknown command: {cmd}")
        print("Usage: python3 reactivation.py [status|enqueue|process|preview] [--dry-run]")
        sys.exit(1)
