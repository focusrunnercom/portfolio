#!/usr/bin/env python3
"""Lead Scorer CLI — classifies FocusRunner SQLite leads for Sales prioritization.

Usage:
  python3 lead-scorer.py                         # table output, all leads
  python3 lead-scorer.py --json                   # JSON output
  python3 lead-scorer.py --top 10                 # top N by score
  python3 lead-scorer.py --hot                    # only Hot leads
  python3 lead-scorer.py --cold                   # only Cold leads
  python3 lead-scorer.py --unscored               # only unscored leads
  python3 lead-scorer.py --export-csv             # CSV export
  python3 lead-scorer.py --summary                # counts only
  python3 lead-scorer.py --apply                  # write scores back to DB

Scoring tiers (mirrors Flask app score_lead):
  hot_85+ — Volume >= 100 OR spend >= $5k, with bonuses for volume >= 200 (+10) / spend >= $10k (+10)
  warm_60 — Volume >= 30 OR spend >= $1k
  cold_25 — Below thresholds, but has name + contact (real signal)
  cold_10 — Below thresholds, incomplete data

Quality boost:
  +5 if source is webhook, capture-form, chat-widget, lead_capture_standalone (real capture)
  +5 if has both email AND phone
"""

import sqlite3, json, sys, os, csv, io, math
from datetime import datetime, timezone

DB_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(DB_DIR, "leads.db")

REAL_SOURCES = {"webhook", "capture-form", "chat-widget", "lead_capture_standalone"}


def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def load_leads():
    conn = get_conn()
    rows = conn.execute("SELECT * FROM leads ORDER BY created_at DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]


def score_volume_spend(volume_str, spend_str):
    """Score based on volume/spend thresholds (mirrors Flask app.py)."""
    try:
        volume = int(volume_str) if volume_str else 0
    except (ValueError, TypeError):
        volume = 0
    try:
        spend = int(spend_str) if spend_str else 0
    except (ValueError, TypeError):
        spend = 0

    if volume >= 100 or spend >= 5000:
        bonus = 0
        if volume >= 200:
            bonus += 10
        if spend >= 10000:
            bonus += 10
        return "hot", 85 + bonus
    elif volume >= 30 or spend >= 1000:
        return "warm", 60
    else:
        return "cold", 25


def classify_lead(lead):
    """Full classification: score + priority + real-vs-test signal."""
    name = (lead.get("name") or "").strip()
    email = (lead.get("email") or "").strip()
    phone = (lead.get("phone") or "").strip()
    practice = (lead.get("practice") or "").strip()
    volume = lead.get("volume") or ""
    spend = lead.get("spend") or ""
    source = (lead.get("source") or "").lower()
    ts = lead.get("created_at") or lead.get("timestamp") or ""

    # Detect test/placeholder leads
    test_names = {"test", "test lead", "test user", "bob test", "cto test lead", "cmo test lead",
                  "ceo test lead", "test engineer", "cmo pipeline test", "cmo live test",
                  "cto pipeline test", "cto tunnel test", "test target", "cmo test",
                  "cto test", ""}
    test_phones = {"555-test", "305-555-ceo", "305-555-cto", "305-555-test",
                   "+155****4567", "305-555-bob", "305-555-cmo-test",
                   "305-555-test", ""}
    test_emails = {"test@focusrunner.com", "cto@focusrunner.com", "ceo@focusrunner.com",
                   "cto-test@focusrunner.com", "pipeline@focusrunner.com",
                   "cmotest@focusrunner.com", "test@focusrunner.io", "jane@test.com",
                   "tunnel@focusrunner.com", "cmo@focusrunner.com", "test@test.com"}

    is_test_name = name.lower() in test_names or name.lower().startswith("test ")
    is_test_phone = phone.strip() in test_phones or "+155****" in phone
    is_test_email = email.lower() in test_emails or email.lower().endswith("@focusrunner.com") or \
                    email.lower().endswith("@focusrunner.io") or email.lower().endswith("@test.com")
    is_tech_source = source.startswith("ceo_") or source.startswith("cto_") or \
                     source in {"web", "direct_qualify", "verification"}

    is_test = is_test_name or is_test_phone or is_test_email or \
              (is_tech_source and (is_test_name or is_test_phone or is_test_email))

    # Volume/spend score
    cat, base = score_volume_spend(volume, spend)

    # Quality boost
    quality_boost = 0
    if source in REAL_SOURCES:
        quality_boost += 5
    if email and phone and not is_test_email:
        quality_boost += 5

    score = base + quality_boost

    # Recency bonus (+5 if < 24h)
    recency = ""
    if ts:
        try:
            lead_dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            age_hours = (datetime.now(timezone.utc) - lead_dt).total_seconds() / 3600
            if age_hours < 24:
                score += 5
                recency = "<24h"
        except (ValueError, TypeError):
            pass

    # Override for test leads
    if is_test:
        return {
            "classification": "Test",
            "score": min(score, 35),
            "category": cat,
            "quality_boost": quality_boost,
            "recency": recency,
            "is_test": True,
            "reasons": ["test/placeholder lead"]
        }

    if cat == "hot":
        classification = "Hot"
    elif cat == "warm":
        classification = "Warm"
    elif score >= 25:
        classification = "Cold"
    else:
        classification = "Cold"

    return {
        "classification": classification,
        "score": min(score, 100),
        "category": cat,
        "quality_boost": quality_boost,
        "recency": recency,
        "is_test": False,
        "reasons": [
            f"vol/spend: {cat}_{base}",
            f"quality: +{quality_boost}",
            f"recency: +{5 if recency else 0}"
        ]
    }


def display_table(leads, filter_cls=None, top=None):
    now = datetime.now(timezone.utc)
    scored = []
    for l in leads:
        result = classify_lead(l)
        scored.append((result, l))

    # Sort: Real leads first (Hot > Warm > Cold), then by score desc, then Test
    order = {"Hot": 0, "Warm": 1, "Cold": 2, "Test": 3}
    scored.sort(key=lambda x: (order.get(x[0]["classification"], 99), -x[0]["score"]))

    if filter_cls:
        scored = [(r, l) for r, l in scored if r["classification"] == filter_cls]
    if top:
        scored = scored[:top]

    real = [s for s, _ in scored if s["classification"] != "Test"]
    tests = [s for s, _ in scored if s["classification"] == "Test"]

    print(f"\n{'='*100}")
    print(f"  FOCUSRUNNER LEAD SCORER — {now.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'='*100}")
    print(f"  Total: {len(leads):>3} leads  |  Real: {len(real):>3}  |  Test: {len(tests):>3}")
    hot_count = sum(1 for s, _ in scored if s["classification"] == "Hot")
    warm_count = sum(1 for s, _ in scored if s["classification"] == "Warm")
    cold_count = sum(1 for s, _ in scored if s["classification"] == "Cold")
    print(f"  Hot: {hot_count}  |  Warm: {warm_count}  |  Cold: {cold_count}  |  Test: {tests}")
    print(f"{'='*100}")
    print()
    print(f"  {'#':<4} {'SCORE':<6} {'CLASS':<8} {'NAME':<22} {'PHONE':<18} {'PRACTICE':<28} {'SOURCE':<20}")
    print(f"  {'-'*4} {'-'*6} {'-'*8} {'-'*22} {'-'*18} {'-'*28} {'-'*20}")

    for i, (r, l) in enumerate(scored, 1):
        cls = r["classification"]
        icon = {"Hot": "🔥", "Warm": "●", "Cold": "○", "Test": "·"}
        prio = icon.get(cls, "?")
        name = (l.get("name", "") or "")[:22]
        phone = (l.get("phone", "") or "")[:18]
        practice = (l.get("practice", "") or "")[:28]
        source = (l.get("source", "") or "")[:20]
        print(f"  {prio:<4} {str(r['score'])+'/100':<6} {cls:<8} {name:<22} {phone:<18} {practice:<28} {source:<20}")

    if filter_cls or top:
        return

    print(f"\n{'='*100}")
    print(f"  BREAKDOWN BY CLASSIFICATION:")
    print(f"{'='*100}")

    for cls_name in ("Hot", "Warm", "Cold", "Test"):
        items = [(r, l) for r, l in scored if r["classification"] == cls_name]
        if items:
            print(f"\n  [{cls_name}] — {len(items)} lead(s)")
            for r, l in items:
                rec = f" [{r['recency']}]" if r['recency'] else ""
                print(f"    {l.get('name','?'):<24} ({r['score']}/100){rec}  —  {', '.join(r['reasons'])}")

    print()


def display_json(leads, filter_cls=None, top=None):
    now = datetime.now(timezone.utc)
    results = []
    for l in leads:
        r = classify_lead(l)
        results.append({
            "id": l.get("id", ""),
            "name": l.get("name", ""),
            "phone": l.get("phone", ""),
            "email": l.get("email", ""),
            "practice": l.get("practice", ""),
            "volume": l.get("volume", ""),
            "spend": l.get("spend", ""),
            "source": l.get("source", ""),
            "score": l.get("score", "unscored"),
            "created_at": l.get("created_at", ""),
            "classification": r["classification"],
            "score_value": r["score"],
            "reasons": r["reasons"],
        })

    order = {"Hot": 0, "Warm": 1, "Cold": 2, "Test": 3}
    results.sort(key=lambda x: (order.get(x["classification"], 99), -x["score_value"]))

    if filter_cls:
        results = [x for x in results if x["classification"] == filter_cls]
    if top:
        results = results[:top]

    print(json.dumps({
        "total": len(leads),
        "scored_at": now.isoformat(),
        "summary": {
            "hot": sum(1 for r in results if r["classification"] == "Hot"),
            "warm": sum(1 for r in results if r["classification"] == "Warm"),
            "cold": sum(1 for r in results if r["classification"] == "Cold"),
            "test": sum(1 for r in results if r["classification"] == "Test"),
        },
        "leads": results,
    }, indent=2))


def display_summary(leads):
    now = datetime.now(timezone.utc)
    results = [classify_lead(l) for l in leads]
    hot = sum(1 for r in results if r["classification"] == "Hot")
    warm = sum(1 for r in results if r["classification"] == "Warm")
    cold = sum(1 for r in results if r["classification"] == "Cold")
    test = sum(1 for r in results if r["classification"] == "Test")

    print(f"{'='*60}")
    print(f"  FOCUSRUNNER LEAD SUMMARY — {now.strftime('%Y-%m-%d %H:%M UTC')}")
    print(f"{'='*60}")
    print(f"  Total leads:     {len(leads):>3}")
    print(f"  {'🔥 Hot':<20} {hot:>3}")
    print(f"  {'● Warm':<20} {warm:>3}")
    print(f"  {'○ Cold':<20} {cold:>3}")
    print(f"  {'· Test/Placeholder':<20} {test:>3}")
    print(f"{'='*60}")
    print(f"  Ready for Sales: {hot + warm}")
    print(f"  Needs nurture:   {cold}")
    print(f"  Unscored:        {sum(1 for l in leads if l.get('score','') in ('unscored','unscored_25',''))}")
    print(f"{'='*60}")


def export_csv(leads):
    now = datetime.now(timezone.utc)
    results = [classify_lead(l) for l in leads]
    output = io.StringIO()
    fieldnames = ["score_value", "classification", "name", "phone", "email", "practice",
                   "volume", "spend", "source", "created_at"]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for l, r in zip(leads, results):
        writer.writerow({
            "score_value": r["score"],
            "classification": r["classification"],
            "name": l.get("name", ""),
            "phone": l.get("phone", ""),
            "email": l.get("email", ""),
            "practice": l.get("practice", ""),
            "volume": l.get("volume", ""),
            "spend": l.get("spend", ""),
            "source": l.get("source", ""),
            "created_at": l.get("created_at", ""),
        })

    print(output.getvalue())
    output.close()


def apply_scores(leads):
    """Write scores back to SQLite DB."""
    conn = get_conn()
    updated = 0
    errors = 0
    for l in leads:
        r = classify_lead(l)
        lid = l["id"]
        score_str = f"{r['classification'].lower()}_{r['score']}"
        qual = json.dumps({
            "score": r["score"],
            "classification": r["classification"],
            "reasons": r["reasons"],
        })
        try:
            conn.execute(
                "UPDATE leads SET score = ?, qualification = ?, updated_at = datetime('now') WHERE id = ?",
                (score_str, qual, lid)
            )
            updated += 1
        except Exception as e:
            print(f"  Error updating {lid}: {e}", file=sys.stderr)
            errors += 1
    conn.commit()
    conn.close()
    print(f"Applied scores: {updated} updated, {errors} errors")


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    leads = load_leads()

    filter_cls = None
    if "--hot" in sys.argv:
        filter_cls = "Hot"
    elif "--warm" in sys.argv:
        filter_cls = "Warm"
    elif "--cold" in sys.argv:
        filter_cls = "Cold"
    elif "--unscored" in sys.argv:
        leads = [l for l in leads if l.get("score", "") in ("unscored", "unscored_25", "")]
        filter_cls = None

    top = None
    if "--top" in sys.argv:
        idx = sys.argv.index("--top")
        if idx + 1 < len(sys.argv):
            top = int(sys.argv[idx + 1])

    if "--json" in sys.argv:
        display_json(leads, filter_cls, top)
    elif "--export-csv" in sys.argv:
        export_csv(leads)
    elif "--summary" in sys.argv:
        display_summary(leads)
    elif "--apply" in sys.argv:
        apply_scores(leads)
        display_summary(leads)
    else:
        display_table(leads, filter_cls, top)
