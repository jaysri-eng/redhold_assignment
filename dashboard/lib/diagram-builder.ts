/**
 * diagram-builder.ts
 *
 * Converts a diagram spec (nodes + edges) into mxGraph XML suitable for
 * embed.diagrams.net (the draw.io rendering engine that powers Diagrams.so).
 *
 * Architecture:
 *   LLM (Ollama)  →  normalise  →  buildDrawioXml  →  embed.diagrams.net
 *
 * No Diagrams.so API calls. embed.diagrams.net is used as a pure renderer.
 */

export interface DiagramNode {
  id?: string;
  label: string;
  type?: string;       // optional semantic tag e.g. "aws-lambda"
}

export interface DiagramSpec {
  title?: string;
  nodes: string[];     // node labels
  edges: [string, string][];
  provider?: string;
  category?: string;
}

// ── Icon map ──────────────────────────────────────────────────────────────────

interface IconEntry {
  keys: string[];
  icon?: string;       // resIcon value for mxgraph.aws4.resourceIcon
  color: string;
  k8s?: boolean;       // use mxgraph.kubernetes.icon instead
  generic?: string;    // fallback raw style fragment
}

const ICON_MAP: IconEntry[] = [
  // AWS Security
  { keys: ["secrets manager", "secrets"],      icon: "mxgraph.aws4.secrets_manager",            color: "#DD344C" },
  { keys: ["guardduty"],                       icon: "mxgraph.aws4.guardduty",                  color: "#DD344C" },
  { keys: ["inspector"],                       icon: "mxgraph.aws4.inspector",                  color: "#DD344C" },
  { keys: ["kms", "key management"],           icon: "mxgraph.aws4.key_management_service",     color: "#DD344C" },
  { keys: ["waf"],                             icon: "mxgraph.aws4.waf",                        color: "#DD344C" },
  { keys: ["shield"],                          icon: "mxgraph.aws4.shield",                     color: "#DD344C" },
  { keys: ["cognito"],                         icon: "mxgraph.aws4.cognito",                    color: "#DD344C" },
  { keys: ["iam", "identity and access"],      icon: "mxgraph.aws4.identity_and_access_management", color: "#DD344C" },
  { keys: ["certificate manager", "acm"],      icon: "mxgraph.aws4.certificate_manager",        color: "#DD344C" },

  // AWS Networking
  { keys: ["cloudfront"],                      icon: "mxgraph.aws4.cloudfront",                 color: "#8C4FFF" },
  { keys: ["route 53", "route53"],             icon: "mxgraph.aws4.route_53",                   color: "#8C4FFF" },
  { keys: ["api gateway", "apigw"],            icon: "mxgraph.aws4.api_gateway",                color: "#8C4FFF" },
  { keys: ["elastic load balancing", "alb", "elb", "load balancer"],
                                               icon: "mxgraph.aws4.elastic_load_balancing",     color: "#8C4FFF" },
  { keys: ["vpc"],                             icon: "mxgraph.aws4.vpc",                        color: "#8C4FFF" },
  { keys: ["transit gateway"],                 icon: "mxgraph.aws4.transit_gateway",            color: "#8C4FFF" },

  // AWS Compute
  { keys: ["elastic kubernetes", "eks"],       icon: "mxgraph.aws4.elastic_kubernetes_service", color: "#FF9900" },
  { keys: ["fargate"],                         icon: "mxgraph.aws4.fargate",                    color: "#FF9900" },
  { keys: ["ecs", "elastic container service"],icon: "mxgraph.aws4.ecs",                        color: "#FF9900" },
  { keys: ["ec2"],                             icon: "mxgraph.aws4.ec2",                        color: "#FF9900" },
  { keys: ["lambda"],                          icon: "mxgraph.aws4.lambda",                     color: "#FF9900" },
  { keys: ["elastic beanstalk", "beanstalk"],  icon: "mxgraph.aws4.elastic_beanstalk",          color: "#FF9900" },
  { keys: ["batch"],                           icon: "mxgraph.aws4.batch",                      color: "#FF9900" },

  // AWS Storage
  { keys: ["s3 bucket", "amazon s3"],          icon: "mxgraph.aws4.s3",                         color: "#3F8624" },
  { keys: [" s3 ", "s3"],                      icon: "mxgraph.aws4.s3",                         color: "#3F8624" },
  { keys: ["efs"],                             icon: "mxgraph.aws4.elastic_file_system",        color: "#3F8624" },
  { keys: ["glacier"],                         icon: "mxgraph.aws4.s3_glacier",                 color: "#3F8624" },

  // AWS Database
  { keys: ["aurora"],                          icon: "mxgraph.aws4.aurora",                     color: "#7AA116" },
  { keys: ["dynamodb", "dynamo db"],           icon: "mxgraph.aws4.dynamodb",                   color: "#7AA116" },
  { keys: ["redshift"],                        icon: "mxgraph.aws4.redshift",                   color: "#7AA116" },
  { keys: ["elasticache", "elasti cache"],     icon: "mxgraph.aws4.elasticache",                color: "#7AA116" },
  { keys: ["documentdb", "document db"],       icon: "mxgraph.aws4.documentdb",                 color: "#7AA116" },
  { keys: ["neptune"],                         icon: "mxgraph.aws4.neptune",                    color: "#7AA116" },
  { keys: ["rds", "relational database", "postgresql", "postgres", "mysql", "mariadb"],
                                               icon: "mxgraph.aws4.rds",                        color: "#7AA116" },

  // AWS Messaging
  { keys: ["kinesis data firehose", "firehose"], icon: "mxgraph.aws4.kinesis_data_firehose",    color: "#E7157B" },
  { keys: ["kinesis data analytics"],          icon: "mxgraph.aws4.kinesis_data_analytics",     color: "#E7157B" },
  { keys: ["kinesis", "kinesis stream"],       icon: "mxgraph.aws4.kinesis_data_streams",       color: "#E7157B" },
  { keys: ["managed streaming", "msk", "kafka"], icon: "mxgraph.aws4.managed_streaming_for_apache_kafka", color: "#E7157B" },
  { keys: ["eventbridge", "event bridge"],     icon: "mxgraph.aws4.eventbridge",                color: "#E7157B" },
  { keys: ["step functions"],                  icon: "mxgraph.aws4.step_functions",             color: "#FF9900" },
  { keys: ["sqs", "simple queue"],             icon: "mxgraph.aws4.sqs",                        color: "#E7157B" },
  { keys: ["sns", "simple notification"],      icon: "mxgraph.aws4.sns",                        color: "#E7157B" },
  { keys: ["mq"],                              icon: "mxgraph.aws4.mq",                         color: "#E7157B" },

  // AWS Analytics
  { keys: ["glue"],                            icon: "mxgraph.aws4.glue",                       color: "#8C4FFF" },
  { keys: ["athena"],                          icon: "mxgraph.aws4.athena",                     color: "#8C4FFF" },
  { keys: ["emr"],                             icon: "mxgraph.aws4.emr",                        color: "#8C4FFF" },
  { keys: ["opensearch", "elasticsearch"],     icon: "mxgraph.aws4.opensearch_service",         color: "#8C4FFF" },
  { keys: ["lake formation"],                  icon: "mxgraph.aws4.lake_formation",             color: "#8C4FFF" },

  // AWS Observability
  { keys: ["cloudwatch"],                      icon: "mxgraph.aws4.cloudwatch",                 color: "#E7157B" },
  { keys: ["cloudtrail"],                      icon: "mxgraph.aws4.cloudtrail",                 color: "#E7157B" },
  { keys: ["x-ray", "xray"],                   icon: "mxgraph.aws4.x_ray",                      color: "#E7157B" },

  // AWS Developer Tools
  { keys: ["codecommit"],                      icon: "mxgraph.aws4.codecommit",                 color: "#C7131F" },
  { keys: ["codebuild"],                       icon: "mxgraph.aws4.codebuild",                  color: "#C7131F" },
  { keys: ["codedeploy"],                      icon: "mxgraph.aws4.codedeploy",                 color: "#C7131F" },
  { keys: ["codepipeline"],                    icon: "mxgraph.aws4.codepipeline",               color: "#C7131F" },
  { keys: ["ecr", "container registry"],       icon: "mxgraph.aws4.elastic_container_registry", color: "#FF9900" },

  // Kubernetes
  { keys: ["argocd", "argo cd", "argo"],        icon: "mxgraph.kubernetes.icon;prIcon=deploy",  color: "#326CE5", k8s: true },
  { keys: ["helm"],                             icon: "mxgraph.kubernetes.icon;prIcon=deploy",  color: "#326CE5", k8s: true },
  { keys: ["ingress controller", "nginx ingress"], icon: "mxgraph.kubernetes.icon;prIcon=ing",  color: "#326CE5", k8s: true },
  { keys: ["kubernetes", "k8s", "eks cluster"], icon: "mxgraph.kubernetes.icon;prIcon=api",    color: "#326CE5", k8s: true },
  { keys: ["pod"],                              icon: "mxgraph.kubernetes.icon;prIcon=pod",     color: "#326CE5", k8s: true },

  // Generic / non-AWS
  { keys: ["nginx", "load balancer"],           icon: undefined, color: "#1D6FCC",  generic: "rounded=1;whiteSpace=wrap;html=1;arcSize=10;" },
  { keys: ["redis", "cache"],                   icon: "mxgraph.aws4.elasticache",               color: "#7AA116" },
  { keys: ["postgres", "mysql", "mariadb", "sql"], icon: "mxgraph.aws4.rds",                   color: "#7AA116" },
  { keys: ["mongo", "mongodb", "cosmos"],        icon: "mxgraph.aws4.documentdb",               color: "#7AA116" },
  { keys: ["rabbit", "rabbitmq"],                icon: "mxgraph.aws4.sqs",                      color: "#E7157B" },
  { keys: ["prometheus"],                        icon: undefined, color: "#E6522C", generic: "ellipse;whiteSpace=wrap;html=1;" },
  { keys: ["grafana"],                           icon: undefined, color: "#F46800", generic: "ellipse;whiteSpace=wrap;html=1;" },
  { keys: ["user", "client", "browser", "mobile", "frontend", "react", "vue"],
                                                 icon: undefined, color: "#007FFF", generic: "rounded=1;whiteSpace=wrap;html=1;arcSize=50;" },
];

function getIconEntry(nodeName: string): IconEntry {
  const low = nodeName.toLowerCase();
  for (const entry of ICON_MAP) {
    if (entry.keys.some(k => low.includes(k))) return entry;
  }
  return { keys: [], color: "#4B5563", generic: "rounded=1;whiteSpace=wrap;html=1;arcSize=10;" };
}

function buildNodeStyle(entry: IconEntry): string {
  const { icon, color, k8s, generic } = entry;
  if (k8s && icon) {
    return (
      `fontStyle=1;align=center;html=1;aspect=fixed;` +
      `shape=${icon};fillColor=${color};strokeColor=none;` +
      `verticalLabelPosition=bottom;verticalAlign=top;`
    );
  }
  if (icon) {
    return (
      `outlineConnect=0;fontColor=#232F3E;gradientColor=none;strokeColor=none;` +
      `fillColor=${color};labelBackgroundColor=none;` +
      `align=center;html=1;fontSize=11;fontStyle=0;aspect=fixed;` +
      `shape=mxgraph.aws4.resourceIcon;resIcon=${icon};` +
      `verticalLabelPosition=bottom;verticalAlign=top;`
    );
  }
  return (
    (generic ?? "rounded=1;whiteSpace=wrap;html=1;arcSize=10;") +
    `fillColor=${color};fontColor=#ffffff;strokeColor=none;align=center;html=1;fontSize=11;`
  );
}

// ── Tier assignment ───────────────────────────────────────────────────────────

type Tier = "ingress" | "security" | "application" | "messaging" | "data" | "observability" | "other";

const OBSERVABILITY_HINTS = ["cloudwatch", "monitor", "logging", "log", "trace", "tracing",
  "metric", "prometheus", "grafana", "datadog", "splunk", "x-ray", "xray", "audit",
  "cloudtrail", "kibana"];
const INGRESS_HINTS = ["api gateway", "cdn", "cloudfront", "alb", "elb", "load balancer",
  "nginx", "route53", "route 53"];

const CLASSIFY_RULES: Record<string, string[]> = {
  security:    ["auth", "security", "jwt", "oauth", "vault", "firewall", "waf", "tls",
                "keycloak", "cognito", "zero trust", "identity", "mtls", "kms",
                "secrets", "iam", "shield", "inspector", "macie", "guardduty", "acm"],
  message:     ["kafka", "rabbitmq", "sqs", "sns", "pubsub", "queue", "bus", "event",
                "stream", "kinesis", "topic", "eventbridge", "msk", "firehose"],
  database:    ["db", "database", "postgres", "mysql", "mongo", "redis", "dynamo",
                "cassandra", "sql", "rds", "elasticsearch", "redshift", "aurora",
                "elasticache", "documentdb", "neptune", "opensearch",
                "s3", "bucket", "blob", "storage", "glacier", "efs", "datalake",
                "delta lake", "lake formation", "athena", "glue"],
  frontend:    ["react", "vue", "angular", "ui", "web", "frontend", "browser", "client",
                "cdn", "cloudfront", "static"],
  backend:     ["api", "server", "service", "node", "express", "flask", "django",
                "spring", "fastapi", "lambda", "function", "worker", "backend",
                "graphql", "ecs", "eks", "fargate", "container", "kubernetes", "k8s",
                "argocd", "argo", "helm", "gitops", "pipeline", "codebuild", "codedeploy",
                "codepipeline", "step functions"],
  cloud:       ["aws", "azure", "gcp", "cloud", "ec2", "aks", "gke", "compute",
                "vpc", "alb", "elb"],
};

function assignTier(name: string): Tier {
  const low = name.toLowerCase();
  if (OBSERVABILITY_HINTS.some(h => low.includes(h))) return "observability";
  if (INGRESS_HINTS.some(h => low.includes(h))) return "ingress";
  for (const [cat, kws] of Object.entries(CLASSIFY_RULES)) {
    if (kws.some(k => low.includes(k))) {
      const map: Record<string, Tier> = {
        security: "security", message: "messaging", database: "data",
        frontend: "ingress", backend: "application", cloud: "application",
      };
      return map[cat] ?? "other";
    }
  }
  return "other";
}

// ── Layout ────────────────────────────────────────────────────────────────────

const CANVAS_W  = 1400;
const TIER_H    = 140;
const TOP_PAD   = 30;
const NODE_W    = 60;
const NODE_H    = 60;
const H_GAP     = 130;

const TIER_ORDER: Tier[] = ["ingress","security","application","messaging","data","observability","other"];
const TIER_LABELS: Record<Tier, string> = {
  ingress:       "Ingress & API",
  security:      "Security & Auth",
  application:   "Application",
  messaging:     "Messaging & Events",
  data:          "Data & Storage",
  observability: "Observability",
  other:         "Infrastructure",
};
const TIER_FILL: Record<Tier, string> = {
  ingress:       "#0d1f38", security: "#1c0a0f", application: "#071a12",
  messaging:     "#1d0e00", data:     "#130a32", observability: "#0d1f38",
  other:         "#111827",
};
const TIER_STROKE: Record<Tier, string> = {
  ingress:       "#334155", security: "#881337", application: "#064e3b",
  messaging:     "#7c2d12", data:     "#4c1d95", observability: "#334155",
  other:         "#1e293b",
};

interface NodePos { x: number; y: number; w: number; h: number; tier: Tier; tierY: number; }

function computeLayout(nodes: string[]): Map<string, NodePos> {
  const tierNodes = new Map<Tier, string[]>(TIER_ORDER.map(t => [t, []]));
  for (const n of nodes) tierNodes.get(assignTier(n))!.push(n);

  const activeTiers = TIER_ORDER.filter(t => (tierNodes.get(t)?.length ?? 0) > 0);
  const tierY = new Map<Tier, number>();
  let y = TOP_PAD;
  for (const tier of activeTiers) { tierY.set(tier, y); y += TIER_H; }

  const positions = new Map<string, NodePos>();
  for (const tier of activeTiers) {
    const tnodes = tierNodes.get(tier)!;
    const n = tnodes.length;
    const totalW  = (n - 1) * H_GAP;
    const startX  = Math.max(20, Math.floor((CANVAS_W - totalW) / 2 - NODE_W / 2));
    const nodeY   = tierY.get(tier)! + Math.floor((TIER_H - NODE_H) / 2);
    tnodes.forEach((node, i) => {
      positions.set(node, {
        x: startX + i * H_GAP, y: nodeY, w: NODE_W, h: NODE_H,
        tier, tierY: tierY.get(tier)!,
      });
    });
  }
  return positions;
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;")
          .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function safeId(name: string): string {
  const s = name.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "");
  return /^\d/.test(s) ? "n_" + s : (s || "node");
}

// ── Public API ────────────────────────────────────────────────────────────────

export function buildDrawioXml(spec: DiagramSpec): string {
  const nodes    = spec.nodes ?? [];
  const edges    = spec.edges ?? [];
  const positions = computeLayout(nodes);

  // Ensure unique IDs
  const idMap = new Map<string, string>();
  const usedIds = new Set<string>();
  for (const n of nodes) {
    let id = safeId(n);
    if (usedIds.has(id)) id += "_" + usedIds.size;
    usedIds.add(id);
    idMap.set(n, id);
  }

  const activeTiers = new Set([...positions.values()].map(p => p.tier));
  const canvasH     = TOP_PAD + activeTiers.size * TIER_H + 60;
  const cells: string[] = [
    '<mxCell id="0" />',
    '<mxCell id="1" parent="0" />',
  ];

  // Swimlane bands
  const renderedTiers = new Set<Tier>();
  for (const node of nodes) {
    const p = positions.get(node);
    if (!p || renderedTiers.has(p.tier)) continue;
    renderedTiers.add(p.tier);
    const { tier, tierY } = p;
    const fill   = TIER_FILL[tier];
    const stroke = TIER_STROKE[tier];
    const label  = escXml(TIER_LABELS[tier]);
    cells.push(
      `<mxCell id="band_${tier}" value="" ` +
      `style="rounded=0;whiteSpace=wrap;html=1;fillColor=${fill};strokeColor=${stroke};strokeWidth=1;opacity=80;" ` +
      `vertex="1" parent="1">` +
      `<mxGeometry x="0" y="${tierY}" width="${CANVAS_W}" height="${TIER_H}" as="geometry" />` +
      `</mxCell>`
    );
    cells.push(
      `<mxCell id="label_${tier}" value="${label}" ` +
      `style="text;html=1;strokeColor=none;fillColor=none;align=left;verticalAlign=middle;` +
      `spacingLeft=8;fontSize=11;fontStyle=1;fontColor=${stroke};" ` +
      `vertex="1" parent="1">` +
      `<mxGeometry x="8" y="${tierY + 4}" width="160" height="20" as="geometry" />` +
      `</mxCell>`
    );
  }

  // Node cells
  for (const node of nodes) {
    const p = positions.get(node);
    if (!p) continue;
    const nid   = idMap.get(node)!;
    const label = escXml(node);
    const entry = getIconEntry(node);
    const style = buildNodeStyle(entry);
    cells.push(
      `<mxCell id="${nid}" value="${label}" style="${style}" vertex="1" parent="1">` +
      `<mxGeometry x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" as="geometry" />` +
      `</mxCell>`
    );
  }

  // Edge cells
  const nodeSet = new Set(nodes);
  edges.forEach((edge, i) => {
    if (!Array.isArray(edge) || edge.length < 2) return;
    const [src, dst] = edge;
    if (!nodeSet.has(src) || !nodeSet.has(dst)) return;
    cells.push(
      `<mxCell id="edge_${i}" value="" ` +
      `style="edgeStyle=orthogonalEdgeStyle;html=1;rounded=1;arcSize=10;` +
      `strokeColor=#475569;strokeWidth=1.5;exitX=0.5;exitY=1;exitDx=0;exitDy=0;" ` +
      `edge="1" source="${idMap.get(src)}" target="${idMap.get(dst)}" parent="1">` +
      `<mxGeometry relative="1" as="geometry" />` +
      `</mxCell>`
    );
  });

  return (
    `<mxGraphModel background="#020617" gridSize="10" grid="0" ` +
    `page="0" pageWidth="${CANVAS_W}" pageHeight="${canvasH}" math="0" shadow="0">\n` +
    `  <root>\n    ${cells.join("\n    ")}\n  </root>\n` +
    `</mxGraphModel>`
  );
}

/**
 * Builds a self-contained HTML page that embeds the diagrams.net viewer
 * via embed.diagrams.net and loads the generated mxGraph XML via postMessage.
 */
export function buildDrawioHtml(spec: DiagramSpec): string {
  const title    = spec.title ?? "Architecture Diagram";
  const provider = spec.provider ?? "generic";
  const category = spec.category ?? "cloud";
  const xml      = buildDrawioXml(spec);

  const xmlJs    = xml
    .replace(/\\/g, "\\\\")
    .replace(/`/g,  "\\`")
    .replace(/\$\{/g, "\\${");

  const escTitle = escXml(title);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${escTitle} — Architecture Diagram</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%;background:#020617;color:#e2e8f0;font-family:monospace;display:flex;flex-direction:column}
    header{display:flex;align-items:center;justify-content:space-between;padding:10px 20px;background:#0f172a;border-bottom:1px solid #1e293b;flex-shrink:0}
    .logo{font-size:13px;color:#64748b}.logo span{color:#22d3ee}
    .badge{font-size:10px;padding:3px 8px;border-radius:999px;background:rgba(34,211,238,0.1);color:#22d3ee;border:1px solid rgba(34,211,238,0.3)}
    .container{flex:1;position:relative;min-height:560px}
    #df{position:absolute;inset:0;width:100%;height:100%;border:none}
    #loading{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:#64748b;font-size:12px;text-align:center}
    .spin{width:22px;height:22px;border:2px solid #334155;border-top-color:#22d3ee;border-radius:50%;animation:s .7s linear infinite;margin:0 auto 8px}
    @keyframes s{to{transform:rotate(360deg)}}
    .actions{position:fixed;bottom:16px;right:16px;display:flex;gap:8px;z-index:200}
    .btn{font-family:inherit;font-size:11px;padding:7px 14px;border-radius:6px;border:1px solid;cursor:pointer;background:rgba(15,23,42,0.92);backdrop-filter:blur(8px);transition:all .2s;color:#22d3ee;border-color:rgba(34,211,238,0.4)}
    .btn:hover{background:rgba(34,211,238,0.15)}
    footer{padding:7px 20px;font-size:10px;color:#334155;background:#020617;border-top:1px solid #1e293b;flex-shrink:0}
  </style>
</head>
<body>
<header>
  <div class="logo"><span>diagrams</span>.so · diagrams.net renderer</div>
  <div class="badge">${escXml(category)} · ${escXml(provider)}</div>
</header>
<div class="container">
  <div id="loading"><div class="spin"></div>Loading diagrams.net renderer…</div>
  <iframe id="df"
    src="https://embed.diagrams.net/?embed=1&proto=json&spin=1&noSaveBtn=1&noExitBtn=1&nav=1"
    title="${escTitle}" allowfullscreen></iframe>
</div>
<div class="actions">
  <button class="btn" onclick="copyXML()">Copy XML</button>
</div>
<footer>Rendered via embed.diagrams.net (draw.io engine) · ${escTitle}</footer>
<script>
const XML=\`${xmlJs}\`;
const fr=document.getElementById('df');
const ld=document.getElementById('loading');
let ok=false;
function send(){fr.contentWindow.postMessage(JSON.stringify({action:'load',xml:XML,format:'xml'}),'*');}
window.addEventListener('message',function(e){
  if(e.source!==fr.contentWindow)return;
  try{const m=JSON.parse(e.data);if((m.event==='ready'||m.event==='init')&&!ok){ok=true;ld.style.display='none';send();}}catch(x){}
});
setTimeout(function(){if(!ok){ok=true;ld.style.display='none';try{send();}catch(x){}}},4000);
function copyXML(){navigator.clipboard.writeText(XML).then(function(){alert('XML copied! Paste into any diagrams.net / draw.io diagram.');}).catch(function(){alert('Copy failed.');});}
</script>
</body>
</html>`;
}
