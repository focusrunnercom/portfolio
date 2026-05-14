#!/usr/bin/env python3
"""
FocusRunner Lead Scorer CLI — Classify all leads in the database with scores.

Usage:
  python3 lead-scorer.py              # Score all unscored/pending leads
  python3 lead-scorer.py --all        # Re-score all leads
  python3 lead-scorer.py --stats      # Show score distribution
  python3 lead-scorer.py --export     # Export scored leads as JSON
  python3 lead-scorer.py --export-csv # Export as CSV

Scoring logic matches app.py score_lead():
  - hot_85+   (volume >= 100 or spend >= $5k, bonus up to +20)
  - warm_60   (volume >= 30 or spend >= $1k)
  - cold_25   (everything else)
"""

import os
import sys
import json
import csv
import io
import argparse
import sqlite3
from pathlib import Path
from datetime import datetime


BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "leads.db"


SCORING_RULES = {
    "hot": {"min_volume": 100, "min_spend": 5000, "base_score": 85},
    "warm": {"min_volume": 30, "min_spend": 1000, "base_score": 60},
    "cold": {"base_score": 25},
}


def score_lead(volume_str: str, spend_str: str) -> tuple[str, int]:
    """Return (category, score_number). Same logic as app.py."""
    try:
        volume = int(volume_str) if volume_str else 0
    except (ValueError, TypeError):
        volume = 0
    try:
        spend = int(spend_str) if spend_str else 0
    except (ValueError, TypeError):
        spend = 0

    hot = SCORING_RULES["hot"]
    if volume >= hot["min_volume"] or spend >= hot["min_spend"]:
        bonus = 0
        if volume >= 200:
            bonus += 10
        if spend >= 10000:
            bonus += 10
        return "hot", hot["base_score"] + bonus

    warm = SCORING_RULES["warm"]
    if volume >= warm["min_volume"] or spend >= warm["min_spend"]:
        return "warm", warm["base_score"]

    return "cold", SCORING_RULES["cold"]["base_score"]


def get_leads(all_leads: bool = False):
    """Fetch leads from DB. If not all, only unscored/pending."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    if all_leads:
        rows = conn.execute("SELECT * FROM leads ORDER BY created_at DESC").fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM leads WHERE score IS NULL OR score IN ('', 'unscored', 'pending') ORDER BY created_at DESC"
        ).fetchall()

    conn.close()
    return [dict(r) for r in rows]


def cmd_score(args):
    """Score all unscored leads."""
    leads = get_leads(all_leads=args.all)

    if not leads:
        print("  No leads to score.")
        return

    conn = sqlite3.connect(str(DB_PATH))
    updated = 0
    hot_count = 0
    warm_count = 0
    cold_count = 0

    for lead in leads:
        volume = lead.get("volume", "0")
        spend = lead.get("spend", "0")
        category, score_num = score_lead(str(volume), str(spend))
        computed_score = f"{category}_{score_num}"

        conn.execute("UPDATE leads SET score = ? WHERE id = ?", (computed_score, lead["id"]))
        updated += 1

        if category == "hot":
            hot_count += 1
        elif category == "warm":
            warm_count += 1
        else:
            cold_count += 1

    conn.commit()
    conn.close()

    print(f"\n  ✅ Scored {updated} leads")
    print(f"     🔥 HOT:  {hot_count}")
    print(f"     ⭐ WARM: {warm_count}")
    print(f"     ❄️ COLD: {cold_count}")
    print()


def cmd_stats(args):
    """Show score distribution across all leads."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row

    total = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
    unscored = conn.execute("SELECT COUNT(*) FROM leads WHERE score IS NULL OR score IN ('', 'unscored', 'pending')").fetchone()[0]
    hot = conn.execute("SELECT COUNT(*) FROM leads WHERE score LIKE 'hot_%'").fetchone()[0]
    warm = conn.execute("SELECT COUNT(*) FROM leads WHERE score LIKE 'warm_%'").fetchone()[0]
    cold = conn.execute("SELECT COUNT(*) FROM leads WHERE score LIKE 'cold_%'").fetchone()[0]

    top_hot = conn.execute(
        "SELECT name, practice, email, phone, score, volume, spend, created_at FROM leads WHERE score LIKE 'hot_%' ORDER BY created_at DESC"
    ).fetchall()

    conn.close()

    print(f"\n  📊 LEAD SCORE DISTRIBUTION")
    print(f"  {'='*40}")
    print(f"  Total leads:  {total}")
    print(f"  Unscored:     {unscored}")
    print(f"  🔥 HOT:       {hot}")
    print(f"  ⭐ WARM:      {warm}")
    print(f"  ❄️ COLD:      {cold}")
    print()

    if top_hot:
        print(f"  🔥 Hot Leads:")
        for r in top_hot[:10]:
            print(f"     {r['score']:8s} | {r['name']:20s} | {r['practice'][:20]:20s} | v:{r['volume']:>4s} | s:{r['spend']:>5s}")
        if len(top_hot) > 10:
            print(f"     ... and {len(top_hot)-10} more")
        print()


def cmd_export_json(args):
    """Export all leads as JSON."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM leads ORDER BY created_at DESC").fetchall()
    conn.close()

    leads = [dict(r) for r in rows]
    print(json.dumps(leads, indent=2, default=str))


def cmd_export_csv(args):
    """Export all leads as CSV."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM leads ORDER BY created_at DESC").fetchall()
    conn.close()

    leads = [dict(r) for r in rows]
    if not leads:
        print("No leads.")
        return

    writer = csv.writer(sys.stdout)
    writer.writerow(leads[0].keys())
    for lead in leads:
        writer.writerow(lead.values())


def main():
    parser = argparse.ArgumentParser(description="FocusRunner Lead Scorer CLI")
    sub = parser.add_subparsers(dest="command", help="Command")

    p_score = sub.add_parser("score", help="Score all unscored leads")
    p_score.add_argument("--all", action="store_true", help="Re-score ALL leads")

    sub.add_parser("stats", help="Show score distribution")
    sub.add_parser("export", help="Export all leads as JSON")
    sub.add_parser("export-csv", help="Export all leads as CSV")

    args = parser.parse_args()

    if args.command == "score":
        cmd_score(args)
    elif args.command == "stats":
        cmd_stats(args)
    elif args.command == "export":
        cmd_export_json(args)
    elif args.command == "export-csv":
        cmd_export_csv(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
