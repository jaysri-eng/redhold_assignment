/**
 * mermaid-builder.ts
 * TypeScript port of pipeline/renderer.py — builds a Mermaid flowchart TD
 * definition string from a diagram spec. Used by both the generate API route
 * and any client-side rendering helpers.
 */

// ── Category classification ──────────────────────────────────────────────────

const CLASSIFY_RULES: Record<string, string[]> = {
  // Security checked before cloud so "AWS KMS", "Cognito" → security not cloud
  security: [
    "auth", "security", "jwt", "oauth", "vault", "firewall", "waf",
    "certificate", "ssl", "tls", "keycloak", "cognito", "zero trust", "ztna",
    "identity", "mtls", "kms", "secrets", "iam", "shield", "inspector",
    "macie", "guardduty",
  ],
  message: [
    "kafka", "rabbitmq", "sqs", "sns", "pubsub", "queue", "bus", "event",
    "stream", "kinesis", "topic", "eventbridge", "msk",
  ],
  database: [
    "db", "database", "postgres", "mysql", "mongo", "redis", "dynamo",
    "cassandra", "sql", "rds", "elasticsearch", "redshift", "aurora",
    "bigtable", "spanner", "cosmos", "elasticache", "memcached", "opensearch",
  ],
  frontend: [
    "react", "vue", "angular", "ui", "web", "frontend", "browser", "client",
    "cdn", "cloudfront", "nginx", "static", "s3 website",
  ],
  backend: [
    "api", "server", "service", "node", "express", "flask", "django",
    "spring", "fastapi", "lambda", "function", "worker", "backend", "gateway",
    "graphql", "ecs", "eks", "fargate", "container", "kubernetes", "k8s",
    "pod", "deployment",
  ],
  cloud: [
    "aws", "azure", "gcp", "cloud", "ec2", "aks", "gke", "compute",
    "route53", "alb", "elb", "vpc", "s3", "blob", "storage",
  ],
};

export function classifyNode(name: string): string {
  const low = name.toLowerCase();
  for (const [bucket, keywords] of Object.entries(CLASSIFY_RULES)) {
    if (keywords.some((kw) => low.includes(kw))) return bucket;
  }
  return "generic";
}

// ── Mermaid classDef styles ──────────────────────────────────────────────────

export const MERMAID_CLASSES: Record<string, string> = {
  frontend: "fill:#083344,stroke:#22d3ee,color:#22d3ee",
  backend:  "fill:#064e3b,stroke:#34d399,color:#34d399",
  database: "fill:#4c1d95,stroke:#a78bfa,color:#a78bfa",
  cloud:    "fill:#78350f,stroke:#fbbf24,color:#fbbf24",
  security: "fill:#881337,stroke:#fb7185,color:#fb7185",
  message:  "fill:#7c2d12,stroke:#fb923c,color:#fb923c",
  generic:  "fill:#1e293b,stroke:#94a3b8,color:#94a3b8",
};

// ── Tier assignment ──────────────────────────────────────────────────────────

const TIER_ORDER = [
  "ingress", "security", "application", "messaging", "data", "observability", "other",
] as const;

const TIER_LABELS: Record<string, string> = {
  ingress:      "Ingress & API",
  security:     "Security & Auth",
  application:  "Application",
  messaging:    "Messaging & Events",
  data:         "Data & Storage",
  observability:"Observability",
  other:        "Infrastructure",
};

const TIER_STYLES: Record<string, string> = {
  ingress:      "fill:#0f1729,stroke:#334155,color:#94a3b8",
  security:     "fill:#1a0a0f,stroke:#881337,color:#94a3b8",
  application:  "fill:#061a12,stroke:#064e3b,color:#94a3b8",
  messaging:    "fill:#1c0e00,stroke:#7c2d12,color:#94a3b8",
  data:         "fill:#120a30,stroke:#4c1d95,color:#94a3b8",
  observability:"fill:#0f1729,stroke:#334155,color:#94a3b8",
  other:        "fill:#0f172a,stroke:#1e293b,color:#94a3b8",
};

const CATEGORY_TO_TIER: Record<string, string> = {
  frontend:  "ingress",
  cloud:     "application",
  security:  "security",
  backend:   "application",
  message:   "messaging",
  database:  "data",
  generic:   "other",
};

const OBSERVABILITY_HINTS = [
  "cloudwatch", "monitor", "logging", "log", "trace", "tracing", "metric",
  "prometheus", "grafana", "datadog", "splunk", "x-ray", "xray", "audit",
  "elk", "kibana",
];

const INGRESS_HINTS = [
  "gateway", "cdn", "cloudfront", "alb", "elb", "load balancer", "nginx",
  "ingress", "waf", "shield", "route53",
];

function assignTier(nodeName: string): string {
  const low = nodeName.toLowerCase();
  if (OBSERVABILITY_HINTS.some((h) => low.includes(h))) return "observability";
  if (INGRESS_HINTS.some((h) => low.includes(h))) return "ingress";
  const cat = classifyNode(nodeName);
  return CATEGORY_TO_TIER[cat] ?? "other";
}

// ── Node ID / shape helpers ──────────────────────────────────────────────────

export function makeNodeId(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "");
  return sanitized && /^\d/.test(sanitized) ? "n_" + sanitized : sanitized || "node";
}

function nodeDeclaration(nodeId: string, label: string, category: string): string {
  const safe = label.replace(/"/g, "'");
  switch (category) {
    case "database": return `${nodeId}[("${safe}")]`;
    case "security": return `${nodeId}>"${safe}"]`;
    case "cloud":
    case "frontend":  return `${nodeId}("${safe}")`;
    case "message":   return `${nodeId}(["${safe}"])`;
    default:          return `${nodeId}["${safe}"]`;
  }
}

// ── Main builder ─────────────────────────────────────────────────────────────

export interface DiagramSpecInput {
  title?: string;
  nodes: string[];
  edges: [string, string][];
  provider?: string;
  category?: string;
}

export function buildMermaidDefinition(spec: DiagramSpecInput): string {
  const { nodes, edges } = spec;

  // Build id_map
  const idMap: Record<string, string> = {};
  const usedIds = new Set<string>();
  for (const node of nodes) {
    let nid = makeNodeId(node);
    if (usedIds.has(nid)) nid = nid + "_" + usedIds.size;
    usedIds.add(nid);
    idMap[node] = nid;
  }

  // Group by tier
  const tierNodes: Record<string, string[]> = {};
  for (const t of TIER_ORDER) tierNodes[t] = [];
  for (const node of nodes) {
    const tier = assignTier(node);
    tierNodes[tier].push(node);
  }
  const activeTiers = TIER_ORDER.filter((t) => tierNodes[t].length > 0);

  const lines: string[] = ["flowchart TD"];

  // classDef
  for (const [cat, style] of Object.entries(MERMAID_CLASSES)) {
    lines.push(`    classDef ${cat} ${style}`);
  }
  lines.push("");

  // Subgraphs
  for (const tier of activeTiers) {
    const label = TIER_LABELS[tier];
    lines.push(`    subgraph ${tier}[${label}]`);
    lines.push("        direction LR");
    for (const node of tierNodes[tier]) {
      const cat = classifyNode(node);
      const nid = idMap[node];
      const decl = nodeDeclaration(nid, node, cat);
      lines.push(`        ${decl}:::${cat}`);
    }
    lines.push("    end");
    lines.push("");
  }

  // Subgraph styles
  for (const tier of TIER_ORDER) {
    lines.push(`    style ${tier} ${TIER_STYLES[tier]}`);
  }
  lines.push("");

  // Edges
  const nodeSet = new Set(nodes);
  for (const edge of edges) {
    const [src, dst] = edge;
    if (!nodeSet.has(src) || !nodeSet.has(dst)) continue;
    lines.push(`    ${idMap[src]} --> ${idMap[dst]}`);
  }

  return lines.join("\n");
}

// ── srcdoc HTML wrapper ──────────────────────────────────────────────────────

export function buildMermaidHtml(mermaidDef: string, title = "Architecture Diagram"): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; background: #020617; }
    body { display: flex; align-items: flex-start; justify-content: center;
           padding: 16px; min-height: 100vh; }
    .mermaid { width: 100%; }
    .mermaid svg { display: block; margin: 0 auto; max-width: 100%; }
    .error { color: #fb7185; font-family: monospace; font-size: 12px; padding: 20px; }
  </style>
</head>
<body>
  <pre class="mermaid">${mermaidDef}</pre>
  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      themeVariables: {
        background: '#020617',
        mainBkg: '#0f172a',
        nodeBorder: '#334155',
        clusterBkg: '#1e293b',
        titleColor: '#e2e8f0',
        edgeLabelBackground: '#020617',
        lineColor: '#475569',
        fontFamily: 'monospace',
        fontSize: '13px',
      },
      flowchart: { curve: 'basis', padding: 24, htmlLabels: true },
    });
  </script>
</body>
</html>`;
}
