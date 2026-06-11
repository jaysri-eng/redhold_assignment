"""
renderer.py — diagrams.net (draw.io / mxGraph) architecture diagram generator.

Converts a diagram spec JSON → mxGraph XML with real AWS / GCP / K8s /
generic service icons, lays the nodes out in architectural tier swimlanes
(Ingress → Security → Application → Messaging → Data → Observability),
then wraps the XML in a self-contained HTML page that embeds the
diagrams.net viewer via embed.diagrams.net (postMessage protocol).

No API calls to Diagrams.so. embed.diagrams.net is the same rendering
engine that powers Diagrams.so — we use it as a pure display layer.
"""

import html as _html
import re


# ── Utilities ─────────────────────────────────────────────────────────────────

def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def safe_id(name: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9]", "_", name).strip("_")
    return ("n_" + s) if s and s[0].isdigit() else (s or "node")


# ── Icon mapping ──────────────────────────────────────────────────────────────
# Each entry: {"keys": [...substring matches...], "icon": "resIcon value", "color": "fillColor"}
# Entries are checked top-to-bottom; first match wins.
# AWS icon names follow the mxgraph.aws4 shape library shipped with diagrams.net.

ICON_MAP = [
    # ── AWS Security ──────────────────────────────────────────────────────────
    {"keys": ["secrets manager", "secrets"],       "icon": "mxgraph.aws4.secrets_manager",            "color": "#DD344C"},
    {"keys": ["guardduty"],                        "icon": "mxgraph.aws4.guardduty",                  "color": "#DD344C"},
    {"keys": ["inspector"],                        "icon": "mxgraph.aws4.inspector",                  "color": "#DD344C"},
    {"keys": ["macie"],                            "icon": "mxgraph.aws4.macie",                      "color": "#DD344C"},
    {"keys": ["kms", "key management"],            "icon": "mxgraph.aws4.key_management_service",     "color": "#DD344C"},
    {"keys": ["waf"],                              "icon": "mxgraph.aws4.waf",                        "color": "#DD344C"},
    {"keys": ["shield"],                           "icon": "mxgraph.aws4.shield",                     "color": "#DD344C"},
    {"keys": ["cognito"],                          "icon": "mxgraph.aws4.cognito",                    "color": "#DD344C"},
    {"keys": ["iam", "identity and access"],       "icon": "mxgraph.aws4.identity_and_access_management", "color": "#DD344C"},
    {"keys": ["certificate manager", "acm"],       "icon": "mxgraph.aws4.certificate_manager",        "color": "#DD344C"},

    # ── AWS Networking ────────────────────────────────────────────────────────
    {"keys": ["cloudfront"],                       "icon": "mxgraph.aws4.cloudfront",                 "color": "#8C4FFF"},
    {"keys": ["route 53", "route53"],              "icon": "mxgraph.aws4.route_53",                   "color": "#8C4FFF"},
    {"keys": ["api gateway", "apigw"],             "icon": "mxgraph.aws4.api_gateway",                "color": "#8C4FFF"},
    {"keys": ["elastic load balancing", "alb", "elb", "load balancer"], "icon": "mxgraph.aws4.elastic_load_balancing", "color": "#8C4FFF"},
    {"keys": ["vpc"],                              "icon": "mxgraph.aws4.vpc",                        "color": "#8C4FFF"},
    {"keys": ["direct connect"],                   "icon": "mxgraph.aws4.direct_connect",             "color": "#8C4FFF"},
    {"keys": ["transit gateway"],                  "icon": "mxgraph.aws4.transit_gateway",            "color": "#8C4FFF"},

    # ── AWS Compute ───────────────────────────────────────────────────────────
    {"keys": ["elastic kubernetes", "eks"],         "icon": "mxgraph.aws4.elastic_kubernetes_service", "color": "#FF9900"},
    {"keys": ["fargate"],                          "icon": "mxgraph.aws4.fargate",                    "color": "#FF9900"},
    {"keys": ["ecs", "elastic container service"], "icon": "mxgraph.aws4.ecs",                        "color": "#FF9900"},
    {"keys": ["ec2"],                              "icon": "mxgraph.aws4.ec2",                        "color": "#FF9900"},
    {"keys": ["lambda"],                           "icon": "mxgraph.aws4.lambda",                     "color": "#FF9900"},
    {"keys": ["elastic beanstalk", "beanstalk"],   "icon": "mxgraph.aws4.elastic_beanstalk",          "color": "#FF9900"},
    {"keys": ["batch"],                            "icon": "mxgraph.aws4.batch",                      "color": "#FF9900"},

    # ── AWS Storage ───────────────────────────────────────────────────────────
    {"keys": ["s3 bucket", "amazon s3", " s3 "],   "icon": "mxgraph.aws4.s3",                         "color": "#3F8624"},
    {"keys": ["s3"],                               "icon": "mxgraph.aws4.s3",                         "color": "#3F8624"},
    {"keys": ["efs"],                              "icon": "mxgraph.aws4.elastic_file_system",        "color": "#3F8624"},
    {"keys": ["glacier"],                          "icon": "mxgraph.aws4.s3_glacier",                 "color": "#3F8624"},

    # ── AWS Database ──────────────────────────────────────────────────────────
    {"keys": ["aurora"],                           "icon": "mxgraph.aws4.aurora",                     "color": "#7AA116"},
    {"keys": ["dynamodb", "dynamo db"],            "icon": "mxgraph.aws4.dynamodb",                   "color": "#7AA116"},
    {"keys": ["redshift"],                         "icon": "mxgraph.aws4.redshift",                   "color": "#7AA116"},
    {"keys": ["elasticache", "elasti cache"],      "icon": "mxgraph.aws4.elasticache",                "color": "#7AA116"},
    {"keys": ["documentdb", "document db"],        "icon": "mxgraph.aws4.documentdb",                 "color": "#7AA116"},
    {"keys": ["neptune"],                          "icon": "mxgraph.aws4.neptune",                    "color": "#7AA116"},
    {"keys": ["timestream"],                       "icon": "mxgraph.aws4.timestream",                 "color": "#7AA116"},
    {"keys": ["rds", "relational database", "postgresql", "postgres", "mysql", "mariadb"],
                                                   "icon": "mxgraph.aws4.rds",                        "color": "#7AA116"},

    # ── AWS Messaging / Integration ───────────────────────────────────────────
    {"keys": ["kinesis data firehose", "firehose"], "icon": "mxgraph.aws4.kinesis_data_firehose",     "color": "#E7157B"},
    {"keys": ["kinesis data analytics"],           "icon": "mxgraph.aws4.kinesis_data_analytics",     "color": "#E7157B"},
    {"keys": ["kinesis", "kinesis stream"],        "icon": "mxgraph.aws4.kinesis_data_streams",       "color": "#E7157B"},
    {"keys": ["managed streaming", "msk", "kafka"], "icon": "mxgraph.aws4.managed_streaming_for_apache_kafka", "color": "#E7157B"},
    {"keys": ["eventbridge", "event bridge"],      "icon": "mxgraph.aws4.eventbridge",                "color": "#E7157B"},
    {"keys": ["step functions"],                   "icon": "mxgraph.aws4.step_functions",             "color": "#FF9900"},
    {"keys": ["sqs", "simple queue"],              "icon": "mxgraph.aws4.sqs",                        "color": "#E7157B"},
    {"keys": ["sns", "simple notification"],       "icon": "mxgraph.aws4.sns",                        "color": "#E7157B"},
    {"keys": ["mq"],                               "icon": "mxgraph.aws4.mq",                         "color": "#E7157B"},

    # ── AWS Analytics ─────────────────────────────────────────────────────────
    {"keys": ["glue"],                             "icon": "mxgraph.aws4.glue",                       "color": "#8C4FFF"},
    {"keys": ["athena"],                           "icon": "mxgraph.aws4.athena",                     "color": "#8C4FFF"},
    {"keys": ["emr"],                              "icon": "mxgraph.aws4.emr",                        "color": "#8C4FFF"},
    {"keys": ["quicksight"],                       "icon": "mxgraph.aws4.quicksight",                 "color": "#8C4FFF"},
    {"keys": ["opensearch", "elasticsearch"],      "icon": "mxgraph.aws4.opensearch_service",         "color": "#8C4FFF"},
    {"keys": ["lake formation"],                   "icon": "mxgraph.aws4.lake_formation",             "color": "#8C4FFF"},

    # ── AWS Observability ─────────────────────────────────────────────────────
    {"keys": ["cloudwatch"],                       "icon": "mxgraph.aws4.cloudwatch",                 "color": "#E7157B"},
    {"keys": ["cloudtrail"],                       "icon": "mxgraph.aws4.cloudtrail",                 "color": "#E7157B"},
    {"keys": ["x-ray", "xray"],                    "icon": "mxgraph.aws4.x_ray",                      "color": "#E7157B"},
    {"keys": ["config"],                           "icon": "mxgraph.aws4.config",                     "color": "#E7157B"},

    # ── AWS Developer Tools ───────────────────────────────────────────────────
    {"keys": ["codecommit", "code commit"],        "icon": "mxgraph.aws4.codecommit",                 "color": "#C7131F"},
    {"keys": ["codebuild", "code build"],          "icon": "mxgraph.aws4.codebuild",                  "color": "#C7131F"},
    {"keys": ["codedeploy", "code deploy"],        "icon": "mxgraph.aws4.codedeploy",                 "color": "#C7131F"},
    {"keys": ["codepipeline", "code pipeline"],    "icon": "mxgraph.aws4.codepipeline",               "color": "#C7131F"},
    {"keys": ["ecr", "container registry"],        "icon": "mxgraph.aws4.elastic_container_registry", "color": "#FF9900"},

    # ── Kubernetes / Container ecosystem ──────────────────────────────────────
    {"keys": ["argocd", "argo cd"],                "icon": "mxgraph.kubernetes.icon;prIcon=deploy",   "color": "#326CE5", "k8s": True},
    {"keys": ["helm"],                             "icon": "mxgraph.kubernetes.icon;prIcon=deploy",   "color": "#326CE5", "k8s": True},
    {"keys": ["ingress controller", "nginx ingress"], "icon": "mxgraph.kubernetes.icon;prIcon=ing",   "color": "#326CE5", "k8s": True},
    {"keys": ["kubernetes", "k8s", "cluster"],     "icon": "mxgraph.kubernetes.icon;prIcon=api",      "color": "#326CE5", "k8s": True},
    {"keys": ["pod"],                              "icon": "mxgraph.kubernetes.icon;prIcon=pod",      "color": "#326CE5", "k8s": True},

    # ── Generic / non-AWS ─────────────────────────────────────────────────────
    {"keys": ["nginx", "load balancer"],           "icon": None, "color": "#1D6FCC",  "generic": "rounded=1;whiteSpace=wrap;html=1;arcSize=10;"},
    {"keys": ["github", "git"],                    "icon": None, "color": "#24292e",  "generic": "rounded=1;whiteSpace=wrap;html=1;arcSize=10;"},
    {"keys": ["redis", "cache"],                   "icon": "mxgraph.aws4.elasticache",                "color": "#7AA116"},
    {"keys": ["postgres", "mysql", "mariadb", "sql"], "icon": "mxgraph.aws4.rds",                    "color": "#7AA116"},
    {"keys": ["mongo", "mongodb", "cosmos"],       "icon": "mxgraph.aws4.documentdb",                 "color": "#7AA116"},
    {"keys": ["rabbit", "rabbitmq"],               "icon": "mxgraph.aws4.sqs",                        "color": "#E7157B"},
    {"keys": ["prometheus"],                       "icon": None, "color": "#E6522C",  "generic": "ellipse;whiteSpace=wrap;html=1;"},
    {"keys": ["grafana"],                          "icon": None, "color": "#F46800",  "generic": "ellipse;whiteSpace=wrap;html=1;"},
    {"keys": ["datadog"],                          "icon": None, "color": "#632CA6",  "generic": "rounded=1;whiteSpace=wrap;html=1;arcSize=10;"},
    {"keys": ["user", "client", "browser", "mobile app", "frontend", "react", "vue", "angular"],
                                                   "icon": None, "color": "#007FFF",  "generic": "shape=mxgraph.cisco.end_user_devices.pc;"},
]


def get_icon_info(node_name: str) -> dict:
    """Return the best matching icon entry for a node name."""
    low = node_name.lower()
    for entry in ICON_MAP:
        if any(k in low for k in entry["keys"]):
            return entry
    return {"icon": None, "color": "#4B5563", "generic": "rounded=1;whiteSpace=wrap;html=1;arcSize=10;"}


def build_node_style(entry: dict) -> str:
    """Build the mxGraph style string for a node."""
    icon = entry.get("icon")
    color = entry.get("color", "#4B5563")
    generic_style = entry.get("generic")
    is_k8s = entry.get("k8s", False)

    if is_k8s:
        # Kubernetes icon shape
        icon_part = icon  # already contains "mxgraph.kubernetes.icon;prIcon=..."
        return (
            f"fontStyle=1;align=center;html=1;aspect=fixed;"
            f"shape={icon_part};"
            f"fillColor={color};strokeColor=none;"
            f"verticalLabelPosition=bottom;verticalAlign=top;"
        )
    elif icon:
        return (
            f"outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;"
            f"fillColor={color};labelBackgroundColor=none;"
            f"align=center;html=1;fontSize=11;fontStyle=0;aspect=fixed;"
            f"shape=mxgraph.aws4.resourceIcon;resIcon={icon};"
            f"verticalLabelPosition=bottom;verticalAlign=top;"
        )
    elif generic_style:
        return (
            f"{generic_style}"
            f"fillColor={color};fontColor=#ffffff;strokeColor=none;"
            f"align=center;html=1;fontSize=11;"
        )
    else:
        return (
            f"rounded=1;whiteSpace=wrap;html=1;arcSize=10;"
            f"fillColor={color};fontColor=#ffffff;strokeColor=none;"
            f"align=center;html=1;fontSize=11;"
        )


# ── Tier / swimlane layout ────────────────────────────────────────────────────

CLASSIFY_RULES = {
    "security":  ["auth", "security", "jwt", "oauth", "vault", "firewall", "waf", "tls",
                  "keycloak", "cognito", "zero trust", "ztna", "identity", "mtls", "kms",
                  "secrets", "iam", "shield", "inspector", "macie", "guardduty"],
    "message":   ["kafka", "rabbitmq", "sqs", "sns", "pubsub", "queue", "bus", "event",
                  "stream", "kinesis", "topic", "eventbridge", "msk", "firehose"],
    "database":  ["db", "database", "postgres", "mysql", "mongo", "redis", "dynamo",
                  "cassandra", "sql", "rds", "elasticsearch", "redshift", "aurora",
                  "elasticache", "memcached", "opensearch", "documentdb", "neptune",
                  "s3", "bucket", "blob", "storage", "glacier", "efs", "datalake",
                  "delta lake", "lake formation", "athena", "glue"],
    "frontend":  ["react", "vue", "angular", "ui", "web", "frontend", "browser", "client",
                  "cdn", "cloudfront", "static"],
    "backend":   ["api", "server", "service", "node", "express", "flask", "django",
                  "spring", "fastapi", "lambda", "function", "worker", "backend", "gateway",
                  "graphql", "ecs", "eks", "fargate", "container", "kubernetes", "k8s",
                  "argocd", "argo", "helm", "gitops", "pipeline", "codebuild", "codedeploy",
                  "codepipeline", "step functions"],
    "cloud":     ["aws", "azure", "gcp", "cloud", "ec2", "aks", "gke", "compute",
                  "vpc", "alb", "elb"],
}

OBSERVABILITY_HINTS = ["cloudwatch", "monitor", "logging", "log", "trace", "tracing",
                       "metric", "prometheus", "grafana", "datadog", "splunk",
                       "x-ray", "xray", "audit", "elk", "kibana", "cloudtrail"]
INGRESS_HINTS       = ["api gateway", "cdn", "cloudfront", "alb", "elb", "load balancer",
                       "nginx", "route53", "route 53"]

TIER_ORDER  = ["ingress", "security", "application", "messaging", "data", "observability", "other"]
TIER_LABELS = {
    "ingress":       "Ingress & API",
    "security":      "Security & Auth",
    "application":   "Application",
    "messaging":     "Messaging & Events",
    "data":          "Data & Storage",
    "observability": "Observability",
    "other":         "Infrastructure",
}
TIER_FILL  = {
    "ingress":       "#0d1f38",
    "security":      "#1c0a0f",
    "application":   "#071a12",
    "messaging":     "#1d0e00",
    "data":          "#130a32",
    "observability": "#0d1f38",
    "other":         "#111827",
}
TIER_STROKE = {
    "ingress":       "#334155",
    "security":      "#881337",
    "application":   "#064e3b",
    "messaging":     "#7c2d12",
    "data":          "#4c1d95",
    "observability": "#334155",
    "other":         "#1e293b",
}


def classify_node(name: str) -> str:
    low = name.lower()
    for bucket, kws in CLASSIFY_RULES.items():
        if any(k in low for k in kws):
            return bucket
    return "generic"


def assign_tier(name: str) -> str:
    low = name.lower()
    if any(h in low for h in OBSERVABILITY_HINTS):
        return "observability"
    if any(h in low for h in INGRESS_HINTS):
        return "ingress"
    cat = classify_node(name)
    mapping = {"frontend": "ingress", "security": "security",
               "backend": "application", "cloud": "application",
               "message": "messaging", "database": "data", "generic": "other"}
    return mapping.get(cat, "other")


# ── Layout engine ─────────────────────────────────────────────────────────────

CANVAS_W   = 1400
TIER_H     = 140
TOP_PAD    = 30
NODE_W     = 60
NODE_H     = 60
H_GAP      = 130    # center-to-center horizontal spacing


def compute_layout(nodes: list[str]) -> dict[str, dict]:
    """
    Assign (x, y, w, h) to each node in a tiered swimlane layout.
    Tiers stack vertically; nodes in each tier are centered horizontally.
    """
    # Group nodes by tier (preserve insertion order)
    tier_nodes: dict[str, list[str]] = {t: [] for t in TIER_ORDER}
    for node in nodes:
        tier_nodes[assign_tier(node)].append(node)

    # Compute cumulative tier Y offsets (only active tiers)
    active_tiers = [t for t in TIER_ORDER if tier_nodes[t]]
    tier_y: dict[str, int] = {}
    y = TOP_PAD
    for tier in active_tiers:
        tier_y[tier] = y
        y += TIER_H

    positions: dict[str, dict] = {}
    for tier in active_tiers:
        tnodes = tier_nodes[tier]
        n = len(tnodes)
        total_w = (n - 1) * H_GAP
        start_x = max(20, (CANVAS_W - total_w) // 2 - NODE_W // 2)
        node_y   = tier_y[tier] + (TIER_H - NODE_H) // 2
        for i, node in enumerate(tnodes):
            positions[node] = {
                "x": start_x + i * H_GAP,
                "y": node_y,
                "w": NODE_W,
                "h": NODE_H,
                "tier": tier,
                "tier_y": tier_y[tier],
            }
    return positions


# ── mxGraph XML builder ───────────────────────────────────────────────────────

def build_drawio_xml(spec: dict) -> str:
    """Convert a diagram spec to mxGraph XML with AWS/K8s/generic icons."""
    nodes    = spec.get("nodes", [])
    edges    = spec.get("edges", [])

    positions = compute_layout(nodes)
    id_map    = {n: safe_id(n) for n in nodes}

    # Deduplicate IDs
    used: set[str] = set()
    for n in nodes:
        nid = id_map[n]
        if nid in used:
            id_map[n] = nid + "_" + str(len(used))
        used.add(id_map[n])

    # Compute canvas height from tallest tier stack
    total_tiers = len({p["tier"] for p in positions.values()})
    canvas_h    = TOP_PAD + total_tiers * TIER_H + 60

    cells: list[str] = [
        '<mxCell id="0" />',
        '<mxCell id="1" parent="0" />',
    ]

    # ── Swimlane background bands ────────────────────────────────────────────
    rendered_tiers: set[str] = set()
    for node in nodes:
        p    = positions.get(node)
        if not p or p["tier"] in rendered_tiers:
            continue
        tier  = p["tier"]
        ty    = p["tier_y"]
        fill  = TIER_FILL[tier]
        stroke= TIER_STROKE[tier]
        label = _html.escape(TIER_LABELS[tier])
        rendered_tiers.add(tier)

        # Band background
        cells.append(
            f'<mxCell id="band_{tier}" value="" '
            f'style="rounded=0;whiteSpace=wrap;html=1;'
            f'fillColor={fill};strokeColor={stroke};strokeWidth=1;opacity=80;" '
            f'vertex="1" parent="1">'
            f'<mxGeometry x="0" y="{ty}" width="{CANVAS_W}" height="{TIER_H}" as="geometry" />'
            f'</mxCell>'
        )
        # Tier label
        cells.append(
            f'<mxCell id="label_{tier}" value="{label}" '
            f'style="text;html=1;strokeColor=none;fillColor=none;'
            f'align=left;verticalAlign=middle;spacingLeft=8;'
            f'fontFamily=JetBrains Mono,monospace;fontSize=11;fontStyle=1;'
            f'fontColor={stroke};" '
            f'vertex="1" parent="1">'
            f'<mxGeometry x="8" y="{ty + 4}" width="160" height="20" as="geometry" />'
            f'</mxCell>'
        )

    # ── Node cells ───────────────────────────────────────────────────────────
    for node in nodes:
        p     = positions.get(node)
        if not p:
            continue
        nid   = id_map[node]
        label = _html.escape(node)
        entry = get_icon_info(node)
        style = build_node_style(entry)

        cells.append(
            f'<mxCell id="{nid}" value="{label}" style="{style}" '
            f'vertex="1" parent="1">'
            f'<mxGeometry x="{p["x"]}" y="{p["y"]}" '
            f'width="{p["w"]}" height="{p["h"]}" as="geometry" />'
            f'</mxCell>'
        )

    # ── Edge cells ───────────────────────────────────────────────────────────
    node_set = set(nodes)
    for i, edge in enumerate(edges):
        if not (isinstance(edge, list) and len(edge) == 2):
            continue
        src, dst = edge[0], edge[1]
        if src not in node_set or dst not in node_set:
            continue
        src_id = id_map[src]
        dst_id = id_map[dst]
        cells.append(
            f'<mxCell id="edge_{i}" value="" '
            f'style="edgeStyle=orthogonalEdgeStyle;html=1;rounded=1;arcSize=10;'
            f'strokeColor=#475569;strokeWidth=1.5;exitX=0.5;exitY=1;exitDx=0;exitDy=0;"'
            f' edge="1" source="{src_id}" target="{dst_id}" parent="1">'
            f'<mxGeometry relative="1" as="geometry" />'
            f'</mxCell>'
        )

    cells_str = "\n    ".join(cells)
    return (
        f'<mxGraphModel background="#020617" gridSize="10" grid="0" '
        f'page="0" pageWidth="{CANVAS_W}" pageHeight="{canvas_h}" '
        f'math="0" shadow="0">\n'
        f'  <root>\n    {cells_str}\n  </root>\n'
        f'</mxGraphModel>'
    )


# ── HTML wrapper (embed.diagrams.net via postMessage) ─────────────────────────

def render_diagram(spec: dict) -> str:
    """
    Return a self-contained HTML page that:
    1. Embeds embed.diagrams.net as an iframe.
    2. Waits for the "ready" postMessage from the viewer.
    3. Sends a "load" postMessage with the mxGraph XML.
    No Diagrams.so API calls. embed.diagrams.net is the rendering engine only.
    """
    title    = spec.get("title", "Architecture Diagram")
    provider = spec.get("provider", "generic")
    category = spec.get("category", "cloud")
    slug     = slugify(title)
    xml_str  = build_drawio_xml(spec)

    # Escape XML for embedding in a JS template literal
    xml_js = (xml_str
              .replace("\\", "\\\\")
              .replace("`",  "\\`")
              .replace("${", "\\${"))

    esc_title = _html.escape(title)

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <meta name="diagram-title"    content="{esc_title}"/>
  <meta name="diagram-category" content="{category}"/>
  <meta name="diagram-provider" content="{provider}"/>
  <title>{esc_title} — Architecture Diagram</title>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet"/>
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    html, body {{ height: 100%; background: #020617; color: #e2e8f0;
                  font-family: 'JetBrains Mono', monospace; display: flex; flex-direction: column; }}
    header {{ display: flex; align-items: center; justify-content: space-between;
              padding: 10px 20px; background: #0f172a;
              border-bottom: 1px solid #1e293b; flex-shrink: 0; }}
    .logo {{ font-size: 13px; color: #64748b; }}
    .logo span {{ color: #22d3ee; }}
    .badge {{ font-size: 10px; padding: 3px 8px; border-radius: 999px;
              background: rgba(34,211,238,0.1); color: #22d3ee;
              border: 1px solid rgba(34,211,238,0.3); }}
    .diagram-container {{ flex: 1; position: relative; min-height: 560px; }}
    #drawio-frame {{ position: absolute; inset: 0; width: 100%; height: 100%; border: none; }}
    #loading {{ position: absolute; top: 50%; left: 50%;
                transform: translate(-50%,-50%);
                color: #64748b; font-size: 12px; text-align: center; }}
    .spinner {{ width: 22px; height: 22px; border: 2px solid #334155;
                border-top-color: #22d3ee; border-radius: 50%;
                animation: spin 0.7s linear infinite; margin: 0 auto 8px; }}
    @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
    .actions {{ position: fixed; bottom: 16px; right: 16px;
                display: flex; gap: 8px; z-index: 200; }}
    .btn {{ font-family: inherit; font-size: 11px; padding: 7px 14px;
            border-radius: 6px; border: 1px solid; cursor: pointer;
            background: rgba(15,23,42,0.92); backdrop-filter: blur(8px);
            transition: all 0.2s; }}
    .btn-xml {{ color: #22d3ee; border-color: rgba(34,211,238,0.4); }}
    .btn-xml:hover {{ background: rgba(34,211,238,0.15); }}
    footer {{ padding: 7px 20px; font-size: 10px; color: #334155;
              background: #020617; border-top: 1px solid #1e293b; flex-shrink: 0; }}
  </style>
</head>
<body>
  <header>
    <div class="logo"><span>diagrams</span>.so · Intent Capture &amp; Conversion Flywheel</div>
    <div class="badge">{category} · {provider}</div>
  </header>

  <div class="diagram-container">
    <div id="loading">
      <div class="spinner"></div>
      Loading diagram renderer…
    </div>
    <iframe
      id="drawio-frame"
      src="https://embed.diagrams.net/?embed=1&proto=json&spin=1&noSaveBtn=1&noExitBtn=1&nav=1"
      title="Architecture Diagram: {esc_title}"
      allowfullscreen>
    </iframe>
  </div>

  <div class="actions">
    <button class="btn btn-xml" onclick="copyXML()">Copy XML</button>
  </div>

  <footer>Rendered via embed.diagrams.net (draw.io engine) ·
          diagrams.so Growth Loop · {esc_title}</footer>

  <script>
    const DIAGRAM_XML = `{xml_js}`;
    const frame   = document.getElementById('drawio-frame');
    const loading = document.getElementById('loading');
    let   loaded  = false;

    function sendLoad() {{
      frame.contentWindow.postMessage(
        JSON.stringify({{ action: 'load', xml: DIAGRAM_XML, format: 'xml' }}),
        '*'
      );
    }}

    window.addEventListener('message', function(evt) {{
      if (evt.source !== frame.contentWindow) return;
      try {{
        const msg = JSON.parse(evt.data);
        if ((msg.event === 'ready' || msg.event === 'init') && !loaded) {{
          loaded = true;
          loading.style.display = 'none';
          sendLoad();
        }}
      }} catch(e) {{}}
    }});

    // Fallback: attempt load after 4s in case ready event was missed
    setTimeout(function() {{
      if (!loaded) {{
        loaded = true;
        loading.style.display = 'none';
        try {{ sendLoad(); }} catch(e) {{}}
      }}
    }}, 4000);

    function copyXML() {{
      navigator.clipboard.writeText(DIAGRAM_XML)
        .then(function()  {{ alert('XML copied to clipboard!\\nPaste into any diagrams.net / draw.io diagram.'); }})
        .catch(function() {{ alert('Copy failed — please copy manually.'); }});
    }}
  </script>
</body>
</html>"""


# ── CLI smoke test ─────────────────────────────────────────────────────────────
if __name__ == "__main__":
    test_spec = {
        "title": "HIPAA Healthcare Data Pipeline",
        "nodes": [
            "API Gateway", "AWS WAF", "Cognito", "Lambda",
            "Kinesis", "RDS PostgreSQL", "S3", "KMS", "CloudWatch",
        ],
        "edges": [
            ["AWS WAF",    "API Gateway"],
            ["API Gateway","Cognito"],
            ["API Gateway","Lambda"],
            ["Lambda",     "Kinesis"],
            ["Lambda",     "RDS PostgreSQL"],
            ["Lambda",     "S3"],
            ["KMS",        "RDS PostgreSQL"],
            ["KMS",        "S3"],
            ["Lambda",     "CloudWatch"],
        ],
        "provider": "aws",
        "category": "data",
        "style": "flow",
    }
    out = render_diagram(test_spec)
    with open("test_output.html", "w") as f:
        f.write(out)
    print("✓ Wrote test_output.html")
    print("  Open in browser to verify diagrams.net rendering.")
    print(f"  XML length: {len(build_drawio_xml(test_spec))} chars")
