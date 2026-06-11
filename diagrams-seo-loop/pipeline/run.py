#!/usr/bin/env python3
"""
run.py — Diagrams.so Intent Capture & Conversion Flywheel Pipeline
Processes architecture keywords through 6 stages:
  1. Keyword expansion (LLM)
  2. Diagram spec generation (LLM → JSON)
  3. Diagram rendering (HTML/Mermaid)
  4. Gallery metadata + conversion suggestions (LLM)
  5. Social post generation (LLM)
  6. Queue writing (local JSON)

Optimised for phi3:mini — tight prompts, explicit output formats,
fill-in-the-blank templates, plain-text social sections.

All LLM calls go through Ollama at http://localhost:11434/api/generate.
No external APIs. No auto-publishing. Human reviews everything in the dashboard.
"""

import json
import os
import re
import sys
import time
import datetime
import traceback
import argparse
from pathlib import Path

import requests

from renderer import render_diagram, slugify

# ── Config ────────────────────────────────────────────────────────────────────

OLLAMA_URL   = "http://localhost:11434/api/generate"
OLLAMA_MODEL = None          # Auto-detected at startup
TIMEOUT      = 180           # seconds per LLM call

ROOT_DIR      = Path(__file__).parent.parent
DATA_DIR      = ROOT_DIR / "data"
QUEUE_DIR     = DATA_DIR / "queue"
KEYWORDS_FILE = DATA_DIR / "keywords.json"

QUEUE_DIR.mkdir(parents=True, exist_ok=True)
(DATA_DIR / "approved").mkdir(parents=True, exist_ok=True)
(DATA_DIR / "rejected").mkdir(parents=True, exist_ok=True)


# ── Helpers ───────────────────────────────────────────────────────────────────

def log(msg: str, level: str = "INFO"):
    ts = datetime.datetime.now().strftime("%H:%M:%S")
    icons = {"INFO": "·", "OK": "✓", "WARN": "⚠", "ERR": "✗", "HEAD": "▶"}
    icon = icons.get(level, "·")
    print(f"[{ts}] {icon}  {msg}", flush=True)


def detect_model() -> str:
    """Ask Ollama which models are available and pick the best one.
    Prioritises phi3:mini since all prompts are tuned for it."""
    priority = ["phi3", "phi", "llama3", "llama3.1", "llama3.2", "mistral", "gemma"]
    try:
        resp = requests.get("http://localhost:11434/api/tags", timeout=10)
        resp.raise_for_status()
        available = [m["name"] for m in resp.json().get("models", [])]
        log(f"Available models: {[m.split(':')[0] for m in available]}")
        for p in priority:
            for a in available:
                if p in a.lower():
                    return a
        if available:
            return available[0]
    except Exception as e:
        log(f"Could not reach Ollama: {e}", "ERR")
        sys.exit(1)
    log("No models found in Ollama. Pull one first: ollama pull phi3:mini", "ERR")
    sys.exit(1)


def ollama_generate(prompt: str, model: str, retries: int = 1, num_predict: int = 1024) -> str:
    """Call Ollama and return the response text. Retries once on failure."""
    payload = {
        "model":  model,
        "prompt": prompt,
        "stream": False,
        "options": {"temperature": 0.3, "num_predict": num_predict},
    }
    for attempt in range(retries + 1):
        try:
            resp = requests.post(OLLAMA_URL, json=payload, timeout=TIMEOUT)
            resp.raise_for_status()
            return resp.json().get("response", "").strip()
        except Exception as e:
            if attempt < retries:
                log(f"LLM call failed ({e}), retrying…", "WARN")
                time.sleep(2)
            else:
                raise


def extract_json(text: str) -> dict | list:
    """Extract the first JSON object or array from a string."""
    try:
        return json.loads(text)
    except Exception:
        pass
    # Strip markdown code fences if present
    text_clean = re.sub(r"```(?:json)?[^\n]*\n?", "", text).strip().rstrip("`").strip()
    try:
        return json.loads(text_clean)
    except Exception:
        pass
    for pattern in (r"\{[\s\S]*?\}", r"\{[\s\S]*\}"):
        for m in re.finditer(pattern, text_clean):
            try:
                return json.loads(m.group())
            except Exception:
                pass
    raise ValueError(f"No valid JSON found in: {text[:300]}")


def extract_spec_from_truncated(text: str, keyword: str) -> dict:
    """
    When phi3:mini truncates the JSON mid-stream, extract whatever complete
    data we can (title, nodes, edges) and build a valid spec.
    Works by finding the last complete item in each array.
    """
    text_clean = re.sub(r"```(?:json)?[^\n]*\n?", "", text).strip()

    # Extract title
    title_match = re.search(r'"title"\s*:\s*"([^"]+)"', text_clean)
    title = title_match.group(1) if title_match else keyword[:50]

    # Extract provider
    prov_match = re.search(r'"provider"\s*:\s*"(aws|azure|gcp|generic)"', text_clean)
    provider = prov_match.group(1) if prov_match else "generic"

    # Extract category
    cat_match = re.search(r'"category"\s*:\s*"(cloud|devops|microservices|data|security|cicd)"', text_clean)
    category = cat_match.group(1) if cat_match else "cloud"

    # Extract nodes — find all complete quoted strings inside the nodes array
    nodes: list[str] = []
    nodes_match = re.search(r'"nodes"\s*:\s*\[([^\]]*)', text_clean, re.DOTALL)
    if nodes_match:
        raw_nodes = nodes_match.group(1)
        nodes = re.findall(r'"([^"]+)"', raw_nodes)

    # Extract edges — find all complete [source, target] pairs
    edges: list[list[str]] = []
    edges_match = re.search(r'"edges"\s*:\s*\[(.+?)(?:\]\s*[,}]|\Z)', text_clean, re.DOTALL)
    if edges_match:
        raw_edges = edges_match.group(1)
        for pair in re.finditer(r'\["([^"]+)"\s*,\s*"([^"]+)"\]', raw_edges):
            src, dst = pair.group(1), pair.group(2)
            if src in nodes and dst in nodes:
                edges.append([src, dst])

    if not nodes:
        raise ValueError("Could not extract any nodes from truncated spec")

    log(f"  (Recovered from truncation: {len(nodes)} nodes, {len(edges)} edges)", "WARN")
    return {
        "title":    title,
        "nodes":    nodes,
        "edges":    edges,
        "provider": provider,
        "category": category,
        "style":    "flow",
    }


# ── Stage 1: Keyword Expansion ────────────────────────────────────────────────

def stage1_expand(keyword: str, model: str) -> str:
    log(f"Stage 1 · Expanding: {keyword}")
    prompt = f"""Describe the architecture for: "{keyword}"

Write 5 to 8 sentences. Cover:
1. The entry point (what receives traffic first)
2. The main services and what they do
3. The data layer (databases, caches, storage)
4. Any messaging, queues, or async components
5. Security or compliance considerations if relevant

Use specific product names (e.g. Amazon SQS, Nginx, PostgreSQL). Write sentences, not bullet points."""

    desc = ollama_generate(prompt, model, num_predict=512)
    log(f"  → {len(desc)} chars", "OK")
    return desc


# ── Stage 2: Diagram Spec Generation ──────────────────────────────────────────

def stage2_nodes(keyword: str, description: str, model: str) -> dict:
    """
    Stage 2a — ask phi3:mini for ONLY the small structural fields:
    title, nodes (8), provider, category.
    Keeping the JSON tiny (~200 tokens) avoids truncation.
    """
    prompt = f"""Output ONLY a JSON object. No explanation, no markdown.

Architecture topic: {keyword}
Summary: {description[:400]}

JSON to output (fill in real values):
{{
  "title": "short diagram title under 55 chars",
  "nodes": ["Node1", "Node2", "Node3", "Node4", "Node5", "Node6", "Node7", "Node8"],
  "provider": "aws",
  "category": "microservices",
  "style": "flow"
}}

Rules:
- nodes: exactly 8 specific component names, each under 22 chars, name actual services
- provider: aws, azure, gcp, or generic
- category: cloud, devops, microservices, data, security, or cicd

Your JSON:"""
    raw = ollama_generate(prompt, model, num_predict=500)
    try:
        result = extract_json(raw)
    except ValueError:
        result = extract_spec_from_truncated(raw, keyword)

    # Set edges to empty for now; filled in stage2b
    result.setdefault("edges", [])
    result.setdefault("style", "flow")
    return result


def stage2_edges(nodes: list[str], description: str, model: str) -> list[list[str]]:
    """
    Stage 2b — given the confirmed node list, ask phi3:mini for connections
    as plain "Source -> Target" lines. Much smaller output, no nested JSON.
    """
    node_list = "\n".join(f"- {n}" for n in nodes)
    prompt = f"""These are the components in an architecture diagram:
{node_list}

List the connections between them. Write one connection per line as:
Source -> Target

Only use names from the list above. Write 6 to 10 connections. No other text.

Connections:"""
    raw = ollama_generate(prompt, model, num_predict=300)

    edges: list[list[str]] = []
    node_set = set(nodes)
    for line in raw.splitlines():
        # Accept "A -> B" or "A → B" or "A - B" or "A --> B"
        m = re.match(r"^[-*•]?\s*(.+?)\s*[-=][-=>]+\s*(.+?)\s*$", line.strip())
        if m:
            src, dst = m.group(1).strip(), m.group(2).strip()
            # Strip any trailing punctuation
            src = src.rstrip(".,;:")
            dst = dst.rstrip(".,;:")
            if src in node_set and dst in node_set and src != dst:
                pair = [src, dst]
                if pair not in edges:
                    edges.append(pair)

    return edges


def stage2_spec(keyword: str, description: str, model: str, retry: bool = False) -> dict:
    """
    Two-step spec generation optimised for phi3:mini.
    Step A: small JSON with title + nodes + provider + category (~300 tokens).
    Step B: plain-text edges list given confirmed nodes (~250 tokens).
    Separating the calls prevents truncation of either part.
    """
    log(f"Stage 2 · Generating diagram spec (2-step)")

    if retry:
        # On retry, use a minimal 5-node prompt as a single call
        prompt = f"""Output ONLY valid JSON. No explanation.

Topic: {keyword}

JSON:
{{
  "title": "short title",
  "nodes": ["Component A", "Component B", "Component C", "Component D", "Component E"],
  "edges": [["Component A", "Component B"], ["Component B", "Component C"], ["Component C", "Component D"]],
  "provider": "aws",
  "category": "microservices",
  "style": "flow"
}}

Your JSON (5 real nodes, 3 real edges from the topic, nothing else):"""
        raw = ollama_generate(prompt, model, num_predict=400)
        try:
            spec = extract_json(raw)
        except ValueError:
            spec = extract_spec_from_truncated(raw, keyword)
    else:
        # Step A: nodes
        spec = stage2_nodes(keyword, description, model)
        nodes = spec.get("nodes", [])
        if not nodes:
            raise ValueError("Stage 2a returned no nodes")
        log(f"  → Step A: {len(nodes)} nodes recovered", "OK")

        # Step B: edges (separate call, plain text format)
        edges = stage2_edges(nodes, description, model)
        spec["edges"] = edges
        log(f"  → Step B: {len(edges)} edges recovered", "OK")

    required = {"title", "nodes", "edges", "provider", "category", "style"}
    missing = required - set(spec.keys())
    if missing:
        raise ValueError(f"Spec missing fields: {missing}")
    if not spec["nodes"] or not isinstance(spec["nodes"], list):
        raise ValueError("Spec has no nodes")

    # Deduplicate nodes while preserving order
    seen: set[str] = set()
    unique_nodes: list[str] = []
    for n in spec["nodes"]:
        if n not in seen:
            seen.add(n)
            unique_nodes.append(n)
    spec["nodes"] = unique_nodes

    node_set = set(spec["nodes"])
    valid_edges = [e for e in spec.get("edges", [])
                   if isinstance(e, list) and len(e) == 2
                   and e[0] in node_set and e[1] in node_set
                   and e[0] != e[1]]
    # Deduplicate edges
    seen_edges: set[tuple] = set()
    deduped_edges = []
    for e in valid_edges:
        key = (e[0], e[1])
        if key not in seen_edges:
            seen_edges.add(key)
            deduped_edges.append(e)
    spec["edges"] = deduped_edges

    log(f"  → Final: {len(spec['nodes'])} nodes, {len(spec['edges'])} edges", "OK")
    return spec


# ── Stage 3: Diagram Rendering ────────────────────────────────────────────────

def stage3_render(spec: dict, keyword: str) -> tuple[str, Path]:
    """Render spec to Mermaid HTML file, return (html_string, file_path)."""
    log(f"Stage 3 · Rendering diagrams.net diagram HTML")
    html = render_diagram(spec)
    slug = slugify(keyword)
    out_path = QUEUE_DIR / f"{slug}.html"
    out_path.write_text(html, encoding="utf-8")
    log(f"  → Saved {out_path.name}", "OK")
    return html, out_path


# ── Stage 4: Gallery Metadata ─────────────────────────────────────────────────

def clean_template_value(raw_val: str) -> str:
    """Strip bracket placeholders, quotes, and leading punctuation from LLM template responses."""
    val = raw_val.strip()
    # Strip surrounding quotes
    val = val.strip('"').strip("'")
    # Strip bracket placeholders like [value here] — take the content inside
    bracket_match = re.match(r"^\[(.+)\]$", val)
    if bracket_match:
        val = bracket_match.group(1).strip()
    # Strip any remaining leading/trailing brackets
    val = val.strip("[").strip("]").strip()
    return val


def parse_metadata_template(raw: str, spec: dict) -> dict:
    """Parse fill-in-the-blank metadata response into a dict."""
    meta = {
        "gallery_title":       "",
        "gallery_description": "",
        "tags":                [],
        "category":            spec.get("category", "cloud"),
        "provider":            spec.get("provider", "generic"),
    }

    for line in raw.splitlines():
        line = line.strip()
        if re.match(r"(?i)title\s*:", line):
            val = clean_template_value(line.split(":", 1)[1])
            if val and not val.lower().startswith("under ") and len(val) > 4:
                meta["gallery_title"] = val[:60]
        elif re.match(r"(?i)description\s*:", line):
            val = clean_template_value(line.split(":", 1)[1])
            if val and not val.lower().startswith("under ") and len(val) > 4:
                meta["gallery_description"] = val[:160]
        elif re.match(r"(?i)tags\s*:", line):
            raw_tags = line.split(":", 1)[1].strip().strip("[").strip("]")
            parsed = [t.strip().lower().replace(" ", "-").strip('"').strip("'")
                      for t in raw_tags.split(",") if t.strip()]
            if parsed:
                meta["tags"] = parsed[:5]

    # Fallbacks if parsing failed or values were placeholder-only
    if not meta["gallery_title"]:
        meta["gallery_title"] = spec.get("title", "Architecture Diagram")[:60]
    if not meta["gallery_description"]:
        meta["gallery_description"] = f"{spec.get('title', 'Architecture')} — production-grade architecture diagram."
    if not meta["tags"]:
        meta["tags"] = [spec.get("provider", "generic"), spec.get("category", "cloud")]

    return meta


def stage4_metadata(keyword: str, spec: dict, model: str) -> dict:
    log(f"Stage 4 · Generating gallery metadata")
    nodes_preview = ", ".join(spec["nodes"][:6])
    prompt = f"""Complete this template for a diagram gallery page. Replace each bracketed instruction with real content.

Diagram topic: {keyword}
Key components: {nodes_preview}

Title: [under 60 characters, specific and SEO-friendly, include key technology names]
Description: [under 160 characters, specific and useful, mention the main technologies and use case, not generic]
Tags: [3 to 5 comma-separated lowercase tags relevant to this architecture]
Category: [one of: cloud, devops, microservices, data, security, cicd]
Provider: [one of: aws, azure, gcp, generic]

Your answer (keep the exact label format):"""

    raw = ollama_generate(prompt, model, num_predict=300)
    meta = parse_metadata_template(raw, spec)
    # Always enforce category/provider from spec
    meta["category"] = spec["category"]
    meta["provider"] = spec["provider"]
    log(f"  → Title: {meta.get('gallery_title', '?')[:50]}", "OK")
    return meta


# ── Stage 4b: Conversion Suggestions ─────────────────────────────────────────

def parse_conversion_suggestions(raw: str) -> list[dict]:
    """Parse numbered suggestions into a list of {title, description} dicts."""
    suggestions = []
    lines = raw.strip().splitlines()

    def clean_suggestion_text(s: str) -> str:
        val = s.strip().strip('"').strip("'").strip()
        for _ in range(3):
            val = re.sub(r"^\[(?:title|description)(?:\s*here)?\]\s*", "", val, flags=re.IGNORECASE)
            val = re.sub(r"^\[one sentence[^\]]*\]\s*", "", val, flags=re.IGNORECASE)
            val = re.sub(r"^\[[^\]]{1,60}\]\s*", "", val)
        val = re.sub(r"\[title\]\s*", "", val, flags=re.IGNORECASE)
        val = re.sub(r"\[description\]\s*", "", val, flags=re.IGNORECASE)
        return val.strip()

    def is_low_quality(title: str, desc: str) -> bool:
        if not title or len(title) < 4:
            return True
        if re.match(r"^\[.+\]$", title):
            return True
        if re.search(r"\[title\]|\[description\]", title + desc, re.IGNORECASE):
            return True
        return False

    for line in lines:
        line = line.strip()
        # Match "Suggestion N: Title - Description" or "1. Title - Description"
        match = re.match(r"^(?:suggestion\s*\d+[:.]?\s*|\d+[.)]\s*)(.*)", line, re.IGNORECASE)
        if match:
            content = clean_suggestion_text(match.group(1))
            if " - " in content:
                parts = content.split(" - ", 1)
                title = clean_suggestion_text(parts[0])
                desc  = clean_suggestion_text(parts[1])
                if not is_low_quality(title, desc):
                    suggestions.append({"title": title, "description": desc})
            elif ": " in content:
                parts = content.split(": ", 1)
                title = clean_suggestion_text(parts[0])
                desc  = clean_suggestion_text(parts[1])
                if not is_low_quality(title, desc):
                    suggestions.append({"title": title, "description": desc})
            elif content and not content.startswith("["):
                title = clean_suggestion_text(content)
                if not is_low_quality(title, ""):
                    suggestions.append({"title": title, "description": "Advanced production-grade version."})

    # If parsing found nothing, create generic fallbacks
    if not suggestions:
        suggestions = [
            {"title": "Security-hardened version", "description": "Add WAF, secrets management, and zero-trust network policies."},
            {"title": "Multi-region disaster recovery", "description": "Extend with active-active failover across two regions."},
        ]

    return suggestions[:2]


def stage4b_conversion_suggestions(keyword: str, spec: dict, model: str) -> list[dict]:
    log(f"Stage 4b · Generating conversion suggestions")
    nodes_preview = ", ".join(spec["nodes"][:6])
    prompt = f"""A user just generated this diagram: {spec['title']}
Components: {nodes_preview}
Topic: {keyword}

Suggest 2 paid Pro follow-up diagrams. Use real service names from the components. No brackets or placeholders.

Example for a Kafka diagram:
Suggestion 1: Order saga with DLQ and idempotency keys - Adds retry topics and dead-letter queues between order and payment services.
Suggestion 2: Real-time fraud scoring on checkout stream - Adds Kinesis Analytics between API Gateway and payment Lambda.

Write 2 for the diagram above. Copy the format exactly:

Suggestion 1:"""

    continuation = ollama_generate(prompt, model, num_predict=256)
    raw = f"Suggestion 1: {continuation}"
    suggestions = parse_conversion_suggestions(raw)
    log(f"  → {len(suggestions)} suggestions", "OK")
    return suggestions


# ── Stage 5: Social Posts ─────────────────────────────────────────────────────

def parse_social_sections(raw: str) -> dict:
    """
    Parse LinkedIn, Twitter, and Devto sections from plain text.
    Handles multiple formats phi3:mini uses:
      - "LinkedIn:" (plain colon)
      - "**LinkedIn**" (markdown bold header)
      - "LinkedIn" on its own line followed by content
    """
    posts = {"linkedin": "", "twitter": "", "devto": ""}

    # Normalise all heading variants to plain "label:" at start of line.
    # phi3:mini uses many forms:
    #   **LinkedIn**         **LinkedIn:**      **LinkedIn Post:**
    #   # LinkedIn           Twitter:           Dev.to Post:
    def _norm_label(m: re.Match) -> str:
        # group(1) is everything captured inside or around the bold markers
        raw_label = m.group(1).lower().strip()
        # Remove colon, trailing noise words
        raw_label = raw_label.rstrip(":").strip()
        raw_label = re.sub(r"\s*(post|section|content|draft|update)\s*$", "", raw_label).strip()
        raw_label = raw_label.replace("dev.to", "devto").replace("dev to", "devto").replace(".", "")
        return raw_label + ":"

    # Bold markers — capture everything inside ** ** including optional colon and suffix
    # Handles: **LinkedIn** **LinkedIn:** **LinkedIn Post:** **LinkedIn Post**
    normalised = re.sub(
        r"\*\*((?:linkedin|twitter|devto|dev\.to)[^*]*?)\*\*\s*:?",
        _norm_label,
        raw,
        flags=re.IGNORECASE,
    )
    # Markdown heading: # LinkedIn or ## LinkedIn Post
    normalised = re.sub(
        r"(?im)^#+\s*((?:linkedin|twitter|devto|dev\.to)[^\n]*?)\s*:?\s*$",
        _norm_label,
        normalised,
    )

    # Split on label at start of line (colon or colon-optional)
    pattern = re.compile(r"(?im)^(linkedin|twitter|devto)\s*:")
    parts = pattern.split(normalised)

    def clean_post_content(text: str) -> str:
        """Strip wrapper quotes, trailing instructions, and ensure LINK_HERE."""
        t = text.strip()
        # Strip outer "..." wrapper if present
        if t.startswith('"') and t.endswith('"') and len(t) > 2:
            t = t[1:-1].strip()
        # Strip trailing instruction hints like [3 to 4 sentences]
        t = re.sub(r"\s*\[.*?\]\s*$", "", t).strip()
        # Ensure LINK_HERE
        if t and "LINK_HERE" not in t:
            t = t.rstrip(".,;") + " LINK_HERE"
        return t

    if len(parts) >= 3:
        for i in range(1, len(parts) - 1, 2):
            label = parts[i].lower().strip()
            content = clean_post_content(parts[i + 1])
            if label == "linkedin":
                posts["linkedin"] = content
            elif label == "twitter":
                posts["twitter"] = content
            elif label == "devto":
                posts["devto"] = content
    else:
        # Fallback: line-by-line scan
        current_key = None
        current_lines: list[str] = []
        for line in normalised.splitlines():
            matched = None
            if re.match(r"(?i)linkedin\s*:", line):
                matched = "linkedin"
            elif re.match(r"(?i)twitter\s*:", line):
                matched = "twitter"
            elif re.match(r"(?i)devto\s*:", line):
                matched = "devto"

            if matched:
                if current_key and current_lines:
                    posts[current_key] = " ".join(current_lines).strip()
                current_key = matched
                rest = line.split(":", 1)
                current_lines = [rest[1].strip()] if len(rest) > 1 and rest[1].strip() else []
            elif current_key and line.strip():
                current_lines.append(line.strip())

        if current_key and current_lines:
            posts[current_key] = " ".join(current_lines).strip()

    return posts


def stage5_social(keyword: str, spec: dict, meta: dict, model: str) -> dict:
    log(f"Stage 5 · Generating social media posts")
    components = ", ".join(spec["nodes"][:5])
    title = meta.get("gallery_title", spec["title"])

    prompt = f"""Write three social media posts about this architecture diagram. Start each post with the problem it solves. Show the diagram as the answer. Sound like an engineer sharing a solution, not an ad.

Topic: {keyword}
Diagram title: {title}
Key components: {components}

Write each post under its label. Do not include any other text.

LinkedIn: [3 to 4 sentences. Start with the problem. Name specific components. End with LINK_HERE]

Twitter: [Under 280 characters. Start with the problem or insight. One relevant emoji. End with LINK_HERE]

Devto: [4 to 5 sentences. Technical tone. Start with the engineering challenge. End with LINK_HERE]"""

    raw = ollama_generate(prompt, model, num_predict=800)
    posts = parse_social_sections(raw)

    # Log a warning if parsing failed (so we can see the raw output)
    empty_keys = [k for k in ("linkedin", "twitter", "devto") if not posts[k]]
    if empty_keys:
        log(f"  Social parsing missed sections: {empty_keys}. Raw snippet: {raw[:120]!r}", "WARN")

    # Fallbacks for any missing sections
    for k in ("linkedin", "twitter", "devto"):
        if not posts[k]:
            posts[k] = f"Architecture diagram: {keyword}. See the full diagram at LINK_HERE"

    log(f"  → linkedin({len(posts['linkedin'])} chars), twitter({len(posts['twitter'])} chars)", "OK")
    return posts


# ── Stage 6: Queue Writing ─────────────────────────────────────────────────────

def stage6_queue(keyword: str, description: str, spec: dict,
                 html_path: Path, meta: dict, posts: dict,
                 conversion_suggestions: list) -> Path:
    log(f"Stage 6 · Writing to queue")
    slug = slugify(keyword)
    queue_item = {
        "id":                    slug,
        "keyword":               keyword,
        "status":                "pending",
        "timestamp":             datetime.datetime.utcnow().isoformat() + "Z",
        "description":           description,
        "spec":                  spec,
        "diagram_html_path":     str(html_path.relative_to(ROOT_DIR)),
        "gallery_metadata":      meta,
        "social_posts":          posts,
        "conversion_suggestions": conversion_suggestions,
    }
    out = QUEUE_DIR / f"{slug}.json"
    out.write_text(json.dumps(queue_item, indent=2, ensure_ascii=False), encoding="utf-8")
    log(f"  → Saved {out.name}", "OK")
    return out


# ── Main Pipeline ──────────────────────────────────────────────────────────────

def process_keyword(keyword: str, model: str) -> bool:
    """Run all pipeline stages for a single keyword. Returns True on success."""
    log(f"{'='*60}", "HEAD")
    log(f"Processing: {keyword}", "HEAD")
    log(f"{'='*60}", "HEAD")

    try:
        # Stage 1
        description = stage1_expand(keyword, model)

        # Stage 2 (with one retry on failure)
        try:
            spec = stage2_spec(keyword, description, model)
        except Exception as e:
            log(f"Spec gen failed ({e}), retrying with stricter prompt…", "WARN")
            spec = stage2_spec(keyword, description, model, retry=True)

        # Stage 3
        _, html_path = stage3_render(spec, keyword)

        # Stage 4
        meta = stage4_metadata(keyword, spec, model)

        # Stage 4b
        conversion_suggestions = stage4b_conversion_suggestions(keyword, spec, model)

        # Stage 5
        posts = stage5_social(keyword, spec, meta, model)

        # Stage 6
        stage6_queue(keyword, description, spec, html_path, meta, posts, conversion_suggestions)

        log(f"✓ Completed: {keyword}", "OK")
        return True

    except Exception as e:
        log(f"Failed: {keyword} — {e}", "ERR")
        traceback.print_exc()
        return False


def run_keyword_discovery() -> None:
    """
    Optionally enrich keywords.json with Google Trends data before processing.
    Calls discover_keywords.py in merge mode (never overwrites existing keywords).
    Gracefully skips if pytrends is not installed or if discovery fails.
    """
    discover_script = Path(__file__).parent / "discover_keywords.py"
    if not discover_script.exists():
        log("discover_keywords.py not found — skipping Trends enrichment.", "WARN")
        return

    log("Running pytrends keyword discovery (merge mode)…")
    import subprocess
    result = subprocess.run(
        [sys.executable, str(discover_script)],
        capture_output=False,
        text=True,
    )
    if result.returncode != 0:
        log("Keyword discovery exited with errors — continuing with existing keywords.json.", "WARN")
    else:
        log("Keyword discovery complete.", "OK")
    print()


def main():
    parser = argparse.ArgumentParser(
        description="Diagrams.so SEO pipeline — keyword → diagram → queue"
    )
    parser.add_argument(
        "--discover",
        action="store_true",
        help="Run pytrends keyword discovery before processing (merges new keywords into keywords.json).",
    )
    args = parser.parse_args()

    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║  Diagrams.so Intent Capture & Conversion Flywheel    ║")
    print("╚══════════════════════════════════════════════════════╝")
    print()

    if args.discover:
        run_keyword_discovery()

    global OLLAMA_MODEL
    OLLAMA_MODEL = detect_model()
    log(f"Using model: {OLLAMA_MODEL}", "OK")

    if not KEYWORDS_FILE.exists():
        log(f"keywords.json not found at {KEYWORDS_FILE}", "ERR")
        sys.exit(1)

    keywords = json.loads(KEYWORDS_FILE.read_text())
    log(f"Loaded {len(keywords)} keywords")
    print()

    succeeded, failed = [], []
    for i, kw in enumerate(keywords, 1):
        log(f"[{i}/{len(keywords)}] {kw}")
        ok = process_keyword(kw, OLLAMA_MODEL)
        if ok:
            succeeded.append(kw)
        else:
            failed.append(kw)
        print()

    print()
    print("╔══════════════════════════════════════════════════════╗")
    print("║                   PIPELINE SUMMARY                   ║")
    print("╚══════════════════════════════════════════════════════╝")
    print(f"  ✓ Succeeded: {len(succeeded)}")
    for kw in succeeded:
        print(f"      · {kw}")
    if failed:
        print(f"  ✗ Failed:    {len(failed)}")
        for kw in failed:
            print(f"      · {kw}")
    print()
    print(f"  Queue items written to: {QUEUE_DIR}")
    print(f"  Open the dashboard:     cd dashboard && npm run dev")
    print()


if __name__ == "__main__":
    main()
