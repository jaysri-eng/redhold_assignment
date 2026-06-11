/**
 * lib/demo-examples.ts
 *
 * Static demo examples for the Demo Mode feature on the Generate page.
 * Each example includes a diagram spec, user context, conversion suggestions,
 * and a pre-written Step 1 nurture email — no Ollama calls needed.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DemoSpec {
  title:    string;
  nodes:    string[];
  edges:    [string, string][];
  provider: string;
  category: string;
}

export interface DemoConversionSuggestion {
  title:       string;
  description: string;
}

export interface DemoEmailPreview {
  subject: string;
  body:    string;
}

export interface DemoExample {
  id:                    string;
  label:                 string;
  description:           string;
  spec:                  DemoSpec;
  user_context: {
    role:         string;
    company_type: string;
  };
  conversion_suggestions: DemoConversionSuggestion[];
  email_preview:          DemoEmailPreview;
}

// ── Example 1: HIPAA Fintech ──────────────────────────────────────────────────

export const DEMO_HIPAA_FINTECH: DemoExample = {
  id:    "demo-hipaa-fintech",
  label: "HIPAA Fintech",
  description:
    "HIPAA compliant healthcare data pipeline on AWS — patient data flows from an HL7 FHIR API through Kinesis, Lambda, encrypted RDS, S3 audit trails, KMS key management, and CloudTrail for compliance monitoring.",
  spec: {
    title:    "HIPAA Compliant Healthcare Data Pipeline on AWS",
    nodes:    ["HL7 FHIR API", "Kinesis", "Lambda", "RDS", "KMS", "S3", "CloudTrail", "CloudWatch", "VPC"],
    edges: [
      ["HL7 FHIR API", "Kinesis"],
      ["Kinesis",       "Lambda"],
      ["Lambda",        "RDS"],
      ["Lambda",        "S3"],
      ["RDS",           "KMS"],
      ["S3",            "KMS"],
      ["CloudTrail",    "S3"],
      ["CloudWatch",    "Lambda"],
      ["VPC",           "RDS"],
    ],
    provider: "aws",
    category: "data",
  },
  user_context: {
    role:         "Platform Engineer",
    company_type: "Fintech",
  },
  conversion_suggestions: [
    {
      title:       "Automated HIPAA Compliance Reporting",
      description:
        "Add AWS Config rules and Security Hub to automatically audit PHI controls, generate compliance reports, and alert on exposure risks in real time — replaces manual log reviews before audits.",
    },
    {
      title:       "Full Audit Logging with CloudTrail and Athena",
      description:
        "Route CloudTrail events into Athena for ad-hoc querying and build a QuickSight dashboard so compliance officers get a self-serve view of every RDS and S3 access event.",
    },
  ],
  email_preview: {
    subject: "Your HIPAA data pipeline — 2 Pro upgrades for compliance automation",
    body: `Hi there,

You just generated a HIPAA Compliant Healthcare Data Pipeline on AWS. As a Platform Engineer at a Fintech, you're likely already thinking about what happens when an auditor asks for proof that RDS is encrypted with KMS at rest, or that every CloudTrail event is immutable in S3.

Here's what Pro unlocks for your compliance stack:

1. Automated HIPAA Compliance Reporting
   Add AWS Config rules and Security Hub to automatically audit your PHI controls, generate compliance reports, and alert on exposure risks in real time — no more manual log reviews before audits.

2. Full Audit Logging with CloudTrail and Athena
   Route your CloudTrail events to Athena, build a QuickSight dashboard, and give compliance officers a self-serve view of every RDS and S3 access event. Replaces the spreadsheet audit trail entirely.

Both are one prompt away on Pro:
http://localhost:3000/generate

— The Diagrams.so team`,
  },
};

// ── Example 2: Zero Trust SaaS ────────────────────────────────────────────────

export const DEMO_ZERO_TRUST_SAAS: DemoExample = {
  id:    "demo-zero-trust-saas",
  label: "Zero Trust SaaS",
  description:
    "Zero trust network architecture for a B2B SaaS application — identity verification with Cognito, API Gateway with WAF at the perimeter, microservices behind a service mesh, encrypted RDS and DynamoDB, CloudWatch audit logging.",
  spec: {
    title:    "Zero Trust Network Architecture for SaaS",
    nodes:    ["Cognito", "API Gateway", "WAF", "ECS", "RDS", "DynamoDB", "IAM", "CloudWatch", "VPN Gateway"],
    edges: [
      ["Cognito",      "API Gateway"],
      ["WAF",          "API Gateway"],
      ["API Gateway",  "ECS"],
      ["ECS",          "RDS"],
      ["ECS",          "DynamoDB"],
      ["IAM",          "ECS"],
      ["IAM",          "RDS"],
      ["CloudWatch",   "ECS"],
      ["VPN Gateway",  "ECS"],
    ],
    provider: "aws",
    category: "security",
  },
  user_context: {
    role:         "Solutions Architect",
    company_type: "B2B SaaS",
  },
  conversion_suggestions: [
    {
      title:       "mTLS Service-to-Service Authentication",
      description:
        "Add mutual TLS between all ECS services using AWS Private CA and ACM, enforced via App Mesh sidecar proxies — zero-trust inside the network, not just at the Cognito perimeter.",
    },
    {
      title:       "Full Service Mesh with AWS App Mesh",
      description:
        "Deploy AWS App Mesh across your ECS cluster for traffic policies, automatic retries, circuit breaking, and end-to-end observability for every service-to-service call — no application code changes needed.",
    },
  ],
  email_preview: {
    subject: "Your Zero Trust architecture — mTLS and service mesh upgrades",
    body: `Hi there,

You just generated a Zero Trust Network Architecture for SaaS. As a Solutions Architect at a B2B SaaS, WAF and Cognito at the perimeter is a solid start — but most enterprise customers will ask: what about lateral movement inside the network? Can a compromised ECS service reach RDS directly?

Here's what Pro unlocks for your zero-trust posture:

1. mTLS Service-to-Service Authentication
   Add mutual TLS between all ECS services using AWS Private CA and ACM, enforced via App Mesh sidecar proxies. Every service-to-service call is authenticated — not just traffic at the Cognito boundary.

2. Full Service Mesh with AWS App Mesh
   Deploy App Mesh across your ECS cluster for traffic policies, automatic retries, circuit breaking, and end-to-end observability. Zero-trust enforcement without touching application code.

Both are one prompt away on Pro:
http://localhost:3000/generate

— The Diagrams.so team`,
  },
};

// ── Exports ───────────────────────────────────────────────────────────────────

export const DEMO_EXAMPLES: DemoExample[] = [DEMO_HIPAA_FINTECH, DEMO_ZERO_TRUST_SAAS];
