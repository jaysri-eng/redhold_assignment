#!/usr/bin/env python3
"""
discover_keywords.py — pytrends-powered keyword discovery for the Diagrams.so SEO pipeline.

Replaces (or augments) the static data/keywords.json with keywords derived from real
Google Trends signal. Two modes:

  python discover_keywords.py           → enriches keywords.json (merge mode)
  python discover_keywords.py --replace → overwrites keywords.json entirely

How it works
────────────
1. SEED queries — a small set of known high-intent architecture topics.
2. Related queries — pytrends fetches "rising" and "top" related queries for each seed.
3. Intent scoring — filters for terms that look like engineering work (contain AWS, K8s,
   pipeline, architecture, etc.) and strips navigational/branded terms.
4. Deduplication — merges with the existing keywords.json, deduplicates, and writes back.

pytrends throttles requests — the loop sleeps between calls.
If pytrends is unavailable or rate-limits, the script falls back gracefully and prints
a warning; the existing keywords.json is never corrupted.

Install: pip install pytrends
"""

import json
import sys
import time
import re
import argparse
import datetime
from pathlib import Path

try:
    from pytrends.request import TrendReq
    PYTRENDS_AVAILABLE = True
except ImportError:
    PYTRENDS_AVAILABLE = False

ROOT_DIR      = Path(__file__).parent.parent
KEYWORDS_FILE = ROOT_DIR / "data" / "keywords.json"

# ── Seed topics ───────────────────────────────────────────────────────────────
# Broad enough to get cloud/devops-adjacent related queries from Trends.

SEED_TOPICS = [
    "kubernetes architecture",
    "AWS microservices",
    "devops pipeline",
    "cloud architecture diagram",
    "data engineering pipeline",
]

# ── Intent filters ────────────────────────────────────────────────────────────
# A discovered query must contain at least one of these tokens to qualify.

INTENT_TOKENS = [
    "architecture", "pipeline", "kubernetes", "k8s", "aws", "gcp", "azure",
    "microservice", "devops", "deploy", "cluster", "kafka", "grpc", "istio",
    "argocd", "terraform", "helm", "docker", "ci/cd", "cicd", "lakehouse",
    "data lake", "zero trust", "hipaa", "compliance", "platform engineering",
    "service mesh", "multi-region", "multi region", "gitops",
]

# Blacklist: skip queries that are navigational, too short, or irrelevant.
BLACKLIST_TOKENS = [
    "vs", "course", "tutorial", "certification", "exam", "salary", "jobs",
    "reddit", "github", "youtube", "book", "pdf", "free", "download",
]

MAX_DISCOVERED   = 20   # max new keywords to surface per run
SLEEP_BETWEEN_S  = 5    # seconds between pytrends requests (avoid rate-limit)


def ts() -> str:
    return datetime.datetime.now().strftime("%H:%M:%S")


def log(msg: str, level: str = "INFO") -> None:
    icons = {"INFO": "·", "OK": "✓", "WARN": "⚠", "ERR": "✗"}
    print(f"[{ts()}] {icons.get(level, '·')}  {msg}", flush=True)


def is_intent_match(query: str) -> bool:
    q = query.lower()
    if len(q) < 12:
        return False
    if any(b in q for b in BLACKLIST_TOKENS):
        return False
    return any(t in q for t in INTENT_TOKENS)


def fetch_related_queries(seeds: list[str]) -> list[str]:
    """
    Call pytrends for each seed topic and collect related rising/top queries.
    Returns a deduplicated list of candidate keyword strings.
    """
    pytrends = TrendReq(hl="en-US", tz=0, timeout=(10, 30), retries=2, backoff_factor=0.5)
    discovered: list[str] = []
    seen: set[str] = set()

    for i, seed in enumerate(seeds):
        log(f"Fetching related queries for: '{seed}'")
        try:
            pytrends.build_payload(
                kw_list=[seed],
                cat=0,
                timeframe="today 12-m",  # last 12 months
                geo="",                   # worldwide
            )
            related = pytrends.related_queries()
            frames = related.get(seed, {})

            for frame_key in ("rising", "top"):
                df = frames.get(frame_key)
                if df is None or df.empty:
                    continue
                for query in df["query"].tolist():
                    q_clean = str(query).strip().lower()
                    if q_clean not in seen and is_intent_match(q_clean):
                        seen.add(q_clean)
                        discovered.append(q_clean)

            log(f"  → {len(seen)} candidates so far", "OK")

        except Exception as exc:
            log(f"  pytrends error for '{seed}': {exc}", "WARN")

        if i < len(seeds) - 1:
            log(f"  Sleeping {SLEEP_BETWEEN_S}s to avoid rate-limit…")
            time.sleep(SLEEP_BETWEEN_S)

    return discovered[:MAX_DISCOVERED]


def title_case_keyword(kw: str) -> str:
    """Normalise discovered keyword to title case for consistency with existing list."""
    stop = {"a", "an", "the", "and", "or", "on", "in", "for", "with", "to", "of", "at", "by"}
    words = kw.split()
    return " ".join(
        w if w.upper() in ("AWS", "GCP", "K8S", "CI/CD", "CICD", "GRPC", "HIPAA") else
        (w if w.lower() in stop and i > 0 else w.capitalize())
        for i, w in enumerate(words)
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Discover high-intent architecture keywords via Google Trends (pytrends)"
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Replace keywords.json entirely instead of merging.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print discovered keywords without writing keywords.json.",
    )
    args = parser.parse_args()

    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║   Diagrams.so · pytrends Keyword Discovery           ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()

    if not PYTRENDS_AVAILABLE:
        log("pytrends is not installed. Run:  pip install pytrends", "ERR")
        log("Falling back to static keywords.json — no changes made.", "WARN")
        sys.exit(0)

    # Load existing keywords
    existing: list[str] = []
    if KEYWORDS_FILE.exists():
        try:
            existing = json.loads(KEYWORDS_FILE.read_text(encoding="utf-8"))
            log(f"Loaded {len(existing)} existing keywords from keywords.json")
        except Exception as e:
            log(f"Could not read keywords.json: {e}", "WARN")

    existing_lower = {k.lower() for k in existing}

    # Fetch from Trends
    log(f"Querying Google Trends for {len(SEED_TOPICS)} seed topics…")
    print()
    discovered_raw = fetch_related_queries(SEED_TOPICS)

    if not discovered_raw:
        log("No new keywords discovered (rate-limit or no results). Keeping existing list.", "WARN")
        sys.exit(0)

    # Title-case, deduplicate against existing
    new_keywords = []
    for raw in discovered_raw:
        kw = title_case_keyword(raw)
        if kw.lower() not in existing_lower:
            new_keywords.append(kw)
            existing_lower.add(kw.lower())

    log(f"Discovered {len(new_keywords)} new keywords not in existing list:")
    for kw in new_keywords:
        print(f"      + {kw}")
    print()

    if args.dry_run:
        log("Dry run — keywords.json not modified.", "OK")
        return

    if args.replace:
        final = new_keywords
        log(f"Replace mode: writing {len(final)} keywords to keywords.json", "OK")
    else:
        final = existing + new_keywords
        log(f"Merge mode: writing {len(final)} keywords ({len(existing)} existing + {len(new_keywords)} new)", "OK")

    KEYWORDS_FILE.write_text(
        json.dumps(final, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    log(f"Saved → {KEYWORDS_FILE}", "OK")
    print()
    print("  Next step: run the pipeline to process new keywords.")
    print("    cd pipeline && python run.py")
    print()


if __name__ == "__main__":
    main()
