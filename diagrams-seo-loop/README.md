# Diagrams.so — Intent Capture & Conversion Flywheel

> A fully local, human-in-the-loop pipeline that captures high-intent developer search traffic, delivers immediate visual value, and creates a clear path from free to paid. Nothing publishes automatically. A human approves everything.

---

## The Problem This Solves

RedHold wants paid users, not free users. Generic SEO traffic — people searching "what is microservices" — converts poorly. The traffic worth capturing is professional engineers with real problems: *"Kubernetes multi-tenant cluster isolation strategy"* or *"HIPAA compliant healthcare data pipeline on AWS."* These people have budget, technical context, and a specific need to solve.

This system is designed around that insight. Every component is optimised for high-intent capture and conversion, not content volume.

---

## How It Works

### The Four-Layer Funnel

**1. Discovery — Intent Capture**
The keyword list targets senior engineers and engineering teams facing real production problems, not beginners. A developer who searches "zero trust network architecture for SaaS" is evaluating architecture decisions, not learning what zero trust means. The gallery page that matches this search puts Diagrams.so in the room when the decision is being made.

**2. Activation — Immediate Visual Value**
When the developer lands on the gallery page, they see a real, detailed architecture diagram rendered interactively via **diagrams.net** (the same draw.io engine that powers Diagrams.so). The diagram uses actual AWS / Kubernetes icons, laid out in architectural tier swimlanes (Ingress → Security → Application → Messaging → Data → Observability). Value is immediate, before any account creation.

**3. Conversion — Surfacing Paid Value**
Each generated diagram comes with two conversion suggestions: more complex, production-grade versions of the same architecture (e.g. security-hardened with WAF and secrets management, or multi-region with active-active failover). These are surfaced to free users as "what you unlock with paid" — not as hard gates, but as a clear demonstration that the free version is a sketch and the paid version is production-ready.

**4. Social — Organic Inbound Without Promotion**
Social posts are drafted as engineers sharing solutions to real problems. They start with the problem, show the diagram as the answer, and link to the interactive version. They do not mention Diagrams.so as a product or sound like advertising. Engineers share what is useful.

---

## Growth Flywheel

```
High-intent search
        ↓
Gallery page with real, interactive diagram (free, diagrams.net renderer)
        ↓
"What paid unlocks" — conversion suggestions shown inline
        ↓
Signup to generate or customise → paid plan for production features
        ↓
Satisfied engineers share the diagram → organic inbound
        ↓
More gallery pages indexed → more high-intent search captured
```

The loop compounds. Each approved diagram adds a gallery page. Each gallery page captures more search traffic. Social posts by engineers (not marketers) drive inbound that looks like word-of-mouth, not advertising.

---

## What the System Does

1. You provide a list of architecture keywords targeting professional developer problems.
2. The pipeline expands each keyword into an architecture description, generates a structured diagram spec, converts it to **diagrams.net mxGraph XML** with real AWS/K8s icons, renders an HTML diagram, writes gallery metadata, generates conversion suggestions, and drafts three social media posts.
3. Everything lands in a local review queue.
4. You open the dashboard, review each item, and click Approve or Reject.
5. Approved items move to `data/approved/` for a human to act on — upload to the gallery, post to social, etc.

**Nothing is published automatically. Not a single byte leaves your machine without human sign-off.**

---

## How to Run It

### Prerequisites

1. **Python 3.11+** — for the pipeline
2. **Node.js 20+** — for the dashboard
3. **Ollama** — for local LLM inference

### Step 1 — Install Ollama and pull phi3:mini

```bash
# Install Ollama (macOS)
brew install ollama

# Start Ollama
ollama serve

# Pull phi3:mini (all prompts are tuned for this model)
ollama pull phi3:mini
```

The pipeline also works with llama3, mistral, or llama3.2. phi3:mini is preferred because it is fast and the prompts are specifically tuned for its output style. Larger models produce richer diagram specs.

### Step 2 — Install Python dependencies

```bash
cd diagrams-seo-loop/pipeline
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### Step 3 — (Optional) Discover new keywords with Google Trends

```bash
# From inside diagrams-seo-loop/pipeline/
python3 discover_keywords.py           # merges trending queries into keywords.json
python3 discover_keywords.py --dry-run # preview without writing
```

This queries Google Trends for architecture-related rising queries and merges new ones into `data/keywords.json`. Safe to skip — it never corrupts the existing list.

### Step 4 — Run the pipeline

```bash
# From inside diagrams-seo-loop/pipeline/
python3 run.py              # process all keywords in keywords.json
python3 run.py --discover   # run Trends discovery first, then process
```

The pipeline reads `data/keywords.json`, processes all keywords sequentially, and writes results to `data/queue/`. Each keyword produces:
- `data/queue/<slug>.json` — full queue item with metadata, social drafts, and conversion suggestions
- `data/queue/<slug>.html` — self-contained **diagrams.net** HTML file (embed.diagrams.net + mxGraph XML)

Expect ~2–5 minutes per keyword on a modern CPU (phi3:mini).

### Step 5 — Start the review dashboard

```bash
cd diagrams-seo-loop/dashboard
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Project Structure

```
diagrams-seo-loop/
├── pipeline/
│   ├── run.py                  # Main pipeline (stages 1–6 + 4b) — use --discover flag
│   ├── discover_keywords.py    # pytrends keyword discovery — merges into keywords.json
│   ├── renderer.py             # diagrams.net mxGraph XML builder + embed.diagrams.net HTML
│   └── requirements.txt        # Python deps: requests, pytrends
├── dashboard/
│   ├── app/
│   │   ├── page.tsx            # Main dashboard / review queue page
│   │   ├── layout.tsx          # Root layout — mounts PostHogInit
│   │   ├── globals.css         # Design system
│   │   ├── generate/
│   │   │   └── page.tsx        # Text prompt → SSE generation · Demo Mode · auto sequence trigger
│   │   ├── shared/
│   │   │   ├── page.tsx        # Public gallery — all shared diagrams
│   │   │   └── [id]/
│   │   │       └── page.tsx    # Public diagram landing page (CTA: Generate your own)
│   │   └── api/
│   │       ├── items/
│   │       │   ├── route.ts              # GET all items · POST save + PostHog decision + addSequence
│   │       │   └── [id]/
│   │       │       ├── review/route.ts   # POST approve/reject
│   │       │       └── diagram/route.ts  # GET diagram HTML
│   │       ├── generate/
│   │       │   └── route.ts    # Streaming SSE endpoint (Ollama → mxGraph XML)
│   │       ├── notify/
│   │       │   └── route.ts    # POST — sends nurture email via Gmail (8 branching sequences)
│   │       ├── run-sequences/
│   │       │   └── route.ts    # POST — processes pending_sequences.json, fires due emails
│   │       └── demo-sequence/
│   │           └── route.ts    # POST — writes a demo sequence record (step 1 immediately due)
│   ├── components/
│   │   ├── PostHogInit.tsx     # Client component — initialises PostHog on mount
│   │   ├── Header.tsx          # Sticky header with stats + tab navigation
│   │   ├── QueueCard.tsx       # Summary card (uses ClientTimestamp)
│   │   ├── ItemDetail.tsx      # Full detail view with Conversion Path section
│   │   ├── SharedCard.tsx      # Card used in /shared gallery grid
│   │   ├── SharePanel.tsx      # Pre-written social post drafts + copy buttons
│   │   ├── ClientTimestamp.tsx # Hydration-safe timestamp renderer
│   │   └── Toast.tsx           # Notification toasts
│   ├── hooks/
│   │   └── use-mounted.ts      # Returns true only after client mount (prevents hydration errors)
│   ├── lib/
│   │   ├── queue.ts                  # File-system queue helpers
│   │   ├── sequence-runner.ts        # Read/write pending_sequences.json · addSequence · processDueSequences
│   │   ├── posthog-query.ts          # Server-side HogQL query → event counts → decision_action
│   │   ├── demo-examples.ts          # Static HIPAA Fintech + Zero Trust SaaS demo data
│   │   ├── diagram-builder.ts        # TypeScript mxGraph XML builder + ~60-entry icon map
│   │   ├── ollama.ts                 # Ollama model detection + generic generate helper
│   │   ├── conversion-suggestions.ts # LLM suggestion generation, parsing, and sanitisation
│   │   ├── format-date.ts            # Deterministic UTC date formatter (hydration-safe)
│   │   └── mermaid-builder.ts        # Legacy Mermaid builder (kept for reference)
│   ├── scripts/
│   │   ├── run-sequences.ts    # CLI: npx tsx scripts/run-sequences.ts (manual sequence trigger)
│   │   └── test-decision-engine.ts   # CLI: test the deterministic rules engine
│   └── types/queue.ts          # TypeScript type definitions
├── data/
│   ├── keywords.json       # High-intent professional keyword list (augmented by pytrends)
│   ├── queue/              # Pending items
│   ├── approved/           # Approved items
│   └── rejected/           # Rejected items
└── README.md
```

---

## Tools and Frameworks

| Layer                   | Technology                                                              |
|-------------------------|-------------------------------------------------------------------------|
| LLM                     | Ollama — phi3:mini (local, free, prompt-tuned)                          |
| Diagram render          | diagrams.net / embed.diagrams.net (draw.io engine, same as Diagrams.so) |
| Diagram format          | mxGraph XML with AWS4 + Kubernetes icon shape libraries                 |
| Pipeline                | Python 3.11, stdlib + requests                                          |
| Keyword discovery       | pytrends (Google Trends API wrapper)                                    |
| Dashboard               | Next.js 16, React 19, TypeScript, Vanilla CSS                           |
| Email sequence          | Nodemailer + Gmail App Password (3-step, role-personalised)             |
| Sequence orchestration  | Local cron runner — `data/pending_sequences.json` + `lib/sequence-runner.ts` |
| Analytics & intent      | PostHog — event capture, funnels, session replay, server-side HogQL query |
| Intent enrichment       | Ollama — `inferUserContext()` infers role + company type from prompt    |
| Storage                 | Local JSON files (no database)                                          |

### diagrams.net renderer details

The rendering pipeline works in three steps:

**Step 1 — Icon normalisation**
Each node label is matched against a 60-entry keyword map. Recognised services are mapped to their exact `mxgraph.aws4` or `mxgraph.kubernetes` shape ID. Unrecognised components fall back to a styled rounded rectangle.

| Category           | Example icon IDs                                                   |
|--------------------|--------------------------------------------------------------------|
| AWS Compute        | `mxgraph.aws4.lambda`, `mxgraph.aws4.ecs`, `mxgraph.aws4.fargate` |
| AWS Networking     | `mxgraph.aws4.api_gateway`, `mxgraph.aws4.cloudfront`              |
| AWS Security       | `mxgraph.aws4.waf`, `mxgraph.aws4.cognito`, `mxgraph.aws4.kms`    |
| AWS Database       | `mxgraph.aws4.rds`, `mxgraph.aws4.dynamodb`, `mxgraph.aws4.redshift` |
| AWS Messaging      | `mxgraph.aws4.kinesis_data_streams`, `mxgraph.aws4.sqs`            |
| AWS Observability  | `mxgraph.aws4.cloudwatch`, `mxgraph.aws4.cloudtrail`               |
| Kubernetes         | `mxgraph.kubernetes.icon;prIcon=api`, `prIcon=deploy` (ArgoCD)     |

**Step 2 — Tier swimlane layout**
Nodes are classified into architectural tiers and laid out in horizontal swimlane bands:

1. **Ingress & API** — API Gateway, CloudFront, Load Balancers, Nginx
2. **Security & Auth** — WAF, Cognito, IAM, KMS, Secrets Manager
3. **Application** — Lambda, ECS, EKS, Fargate, ArgoCD, microservices
4. **Messaging & Events** — Kinesis, SQS, SNS, Kafka, EventBridge
5. **Data & Storage** — RDS, DynamoDB, S3, Redshift, ElastiCache
6. **Observability** — CloudWatch, Prometheus, Grafana, CloudTrail

**Step 3 — embed.diagrams.net rendering**
The mxGraph XML is embedded in a self-contained HTML page. The page loads `embed.diagrams.net` in an iframe and sends the XML via the diagrams.net postMessage protocol. No API calls to Diagrams.so. The embed is used as a pure renderer.

```
"We use diagrams.net as a visualization layer to ensure production-grade
diagram rendering, while keeping the generation pipeline fully independent
and portable."
```

---

## The Queue Item Structure

Each processed keyword produces a JSON queue item with:

```json
{
  "id": "zero-trust-network-architecture-for-saas",
  "keyword": "zero trust network architecture for SaaS",
  "status": "pending",
  "spec": { "title": "...", "nodes": [...], "edges": [...], "provider": "aws", "category": "security" },
  "diagram_html_path": "data/queue/zero-trust-network-architecture-for-saas.html",
  "gallery_metadata": { "gallery_title": "...", "gallery_description": "...", "tags": [...] },
  "social_posts": { "linkedin": "...", "twitter": "...", "devto": "..." },
  "conversion_suggestions": [
    { "title": "Security-hardened version with WAF and mTLS", "description": "..." },
    { "title": "Multi-region failover with Route53 health checks", "description": "..." }
  ]
}
```

The `conversion_suggestions` array is displayed in the dashboard under the social drafts as **Conversion Path — What paid users unlock**. This illustrates the free-to-paid journey for the reviewer and for RedHold.

---

## Safety and Scope

### What this prototype is ALLOWED to do

- Generate architecture diagram HTML files locally in `data/queue/`
- Write JSON queue items to `data/queue/`
- Read and write files in `data/approved/` and `data/rejected/`
- Display all generated content in the local review dashboard
- Serve diagram HTML through a local Next.js API route for iframe preview

### What this prototype is NOT ALLOWED to do

- Publish to social media (LinkedIn, Twitter/X, Dev.to, or any platform)
- Send outbound emails to real users or prospects (operator inbox only, after save)
- Post to the Diagrams.so gallery automatically
- Contact any real users or external services
- Call any API other than Ollama running on localhost

A human must approve every item before it leaves the review queue. Even after approval, nothing is auto-published — approved items simply move to `data/approved/` for a human to manually act on.

---

## Known Limitations

- **phi3:mini produces simpler diagram specs than larger models.** Node names are shorter and there may be fewer edges (some runs produce 0 edges due to JSON truncation — the two-step spec generation mitigates this). A production version should use llama3 or a capable hosted model for richer specs.
- **No Diagrams.so publishing API.** There is no public API for external diagram upload. The pipeline produces standalone diagrams.net HTML files as the output artifact. When a Diagrams.so API becomes available, the `diagram_html_path` file and spec JSON are the integration points.
- **embed.diagrams.net requires internet access.** The rendering iframe loads from `embed.diagrams.net` CDN. On a fully offline machine, diagrams will not render (the mxGraph XML is still generated and stored locally).
- **No auth on the dashboard.** Fine for local use; add authentication before deploying externally.
- **No incremental processing.** Re-running the pipeline re-generates all keywords. A future version should skip already-queued keywords.
- **phi3:mini generation is slow on CPU.** Expect 2–4 minutes per diagram on a standard laptop. The Generate page shows elapsed time and warns about this upfront.

---

## Organic Growth and Conversion Mechanics

Three mechanisms are designed to move users from discovery to paid without relying on advertising or friction-heavy onboarding.

### Share to Discover

When an engineer generates a diagram, they see a **Share** button below it. The pre-written posts are deliberately written to make the *sharer* look good — not to promote Diagrams.so. The LinkedIn copy reads: *"Spent way too long drawing this diagram by hand before I found Diagrams.so. Generated this in about 30 seconds. Sharing in case it saves someone else the same time."* The Twitter copy is shorter: *"Drew this architecture in ~30 seconds with Diagrams.so. Link if useful."*

Engineers do not share tools. They share evidence of their own efficiency. The post is designed around that insight — the tool's speed is the story, not the tool itself. Each share is a warm referral from a credible source. It reaches engineers who know the person sharing it, which is worth ten cold ad impressions.

The share text contains a `DIAGRAM_LINK` placeholder pointing to `/shared/[id]`. When the item is approved and published, the link resolves to a real diagram landing page.

### Usage-Gated Conversion

After each successful generation, the interface shows two **Next-level version** cards: a security-hardened variant and a multi-region failover variant of the same architecture.

For the first two generations these cards have a live **Generate follow-up →** button. The user gets genuine value from generating the upgrade immediately. By the third generation, the button is replaced with a lock icon and a single line: *"Upgrade to Pro to generate production-grade follow-ups."* The card title and description are fully visible — the user can read exactly what they would get. They just cannot generate it.

This sequencing matters. Gating a feature before someone has felt its value creates frustration. Gating it after two free uses — at the moment they want the next level — creates desire. The user already knows the tool works. They are not being asked to pay on faith.

A minimal persistent banner appears from the third generation onwards: *"You are on the free plan. X diagrams generated."* with an Upgrade link. It is informational, not aggressive. A **Reset counter (demo only)** link below the banner lets evaluators toggle between free and paid states without clearing localStorage manually.

The counter is stored in `localStorage` under `diagrams_generations_count` and increments only on successful diagram generation.

### The Shared Diagram Page

Each diagram has a dedicated landing page at `/shared/[id]`. This is the URL that `DIAGRAM_LINK` eventually resolves to. The page shows:

- The diagram fullscreen, rendered via `embed.diagrams.net`
- The gallery title and description
- A single CTA: **Generate your own →** linking to `/generate`

There is no signup wall before the diagram. The visitor sees immediate value — a real, interactive architecture diagram in their browser — before being asked to do anything. The only action available is to generate their own. This takes them directly into the generation flow, which is the top of the paid funnel.

The loop is: engineer generates → saves to queue → approves → shares link → visitor lands on diagram page → sees value → clicks Generate your own → becomes a user.

### Evangelist Nurture Email (user-facing preview)

After you **Save to Review Queue**, a user-facing nurture email is sent to the operator inbox (prototype safety — no real users contacted). The email is written as if the new signup received it: greeting, link to their diagram at `/shared/[id]` (using the real saved queue item ID), and two **Ollama-generated** Pro follow-up suggestions tailored to their prompt and components.

In production this goes to the user who generated the diagram, right after their first save. The footer marks it as `[PROTOTYPE — operator preview]` so evaluators know no real user was contacted.

Paid-unlock suggestions are generated by phi3:mini after the diagram spec is built — not hardcoded templates. One email per save; failure is silent and does not block the UI.

Configuration requires a Gmail App Password stored in `.env.local` as `NOTIFY_GMAIL_APP_PASSWORD`. This is a separate 16-character password generated from Google Account → Security → 2-Step Verification → App Passwords. It is not your Gmail account password. See `.env.local.example` in the dashboard folder for setup instructions.

---

## How We Would Know This Is Working In 60 Days

| Metric                              | Target                              |
|-------------------------------------|-------------------------------------|
| Gallery items published             | ≥ 10 live from approved queue       |
| Organic impressions per page        | ≥ 100 avg via Google Search Console |
| Click-through rate                  | ≥ 2% on gallery pages               |
| New signups from gallery traffic    | Track via UTM params on LINK_HERE   |
| Free-to-paid conversion from gallery| Track via cohort: gallery → signup → paid |
| Social post engagement rate         | Baseline from first 5 posts         |
| Human approval rate                 | ≥ 40% of reviewed items approved    |

### Kill conditions

- After 60 days: fewer than 100 average impressions per gallery page → keyword targeting is wrong, pivot to narrower or broader professional queries.
- Approval rate drops below 40% → LLM output quality is too low, switch to a larger model or add a validation layer.
- Zero free-to-paid conversions from gallery traffic after 30 signups → the conversion suggestions are not compelling, rework the paid value framing.

---

## What We Would Do Next With More Time

1. **Larger model for diagram spec generation** — Use llama3 or a hosted model for Stage 2 to get richer, more accurate node graphs. phi3:mini is fast but limited.
2. **Diagrams.so API integration** — When the API goes public, add a publish step after human approval.
3. **Deeper keyword research** — `discover_keywords.py` (pytrends) already augments the static list with Google Trends signal. The next step is integrating Google Search Console for impression/CTR data to prioritise which discovered keywords are worth processing first.
4. **Incremental pipeline** — Skip keywords that already have a queue item; only process new ones.
5. **Conversion suggestion A/B testing** — Test different framings of paid value (security-hardened vs. compliance-ready vs. enterprise-scale) to find what converts best.
6. **Auth on the dashboard** — Add NextAuth or Basic Auth so the dashboard can be shared with a remote team.

## What We Would Cut If Scope Halved

Cut the social post generation (Stage 5) first. It adds Ollama calls per keyword and the social drafts are the least critical output — a human copywriter can write better posts in 5 minutes once the diagram and gallery metadata are ready. The core value is the diagram, the metadata, and the conversion suggestions. Social posts are a nice-to-have.

---

## Closed-Loop Automated Email Sequence

When a user saves a diagram to the queue, the system writes a three-step nurture sequence record to `data/pending_sequences.json` and begins processing it automatically. No external orchestrator (n8n or otherwise) is required.

### How the loop works

```
User saves diagram on /generate
        ↓
POST /api/items saves JSON + HTML to data/queue/
        ↓
inferUserContext() calls Ollama → { role, company_type } stored in queue item JSON
        ↓
PostHog query (or local fallback) determines decision_action
        ↓
addSequence() writes 3-step record to data/pending_sequences.json
  step 1: next_send_at = now          (0 delay)
  step 2: next_send_at = now + 3 days (1 min in DEMO_MODE=true)
  step 3: next_send_at = now + 7 days (2 min in DEMO_MODE=true)
        ↓
Browser auto-polls POST /api/run-sequences every 10 seconds
        ↓
processDueSequences() finds due step → POST /api/notify (email_step=1/2/3)
        ↓
Nodemailer sends email via Gmail · marks step sent · repeats for steps 2 and 3
```

The browser starts the polling loop automatically as soon as a diagram is saved — no manual clicking required.

### Context enrichment

`lib/ollama.ts` — `inferUserContext(prompt)` calls the local Ollama model with a short structured prompt and returns `{ role, company_type }`. Example output for "multi-tenant SaaS on AWS": `{ role: "Platform Engineer", company_type: "B2B SaaS" }`. This is stored in `user_context` on the queue item JSON and used to personalise all three emails. Falls back silently to `"Software Engineer" / "Tech Company"` if Ollama is unreachable.

### Email content per step

| Step | Trigger | Subject line | Body focus |
|------|---------|--------------|------------|
| 1 | Immediate | `Your [title] diagram — 2 Pro upgrades to try next` | Diagram link + 2 Pro upgrade suggestions, personalised by role |
| 2 | Day 3 (1 min in demo) | `[title] — here's what a production-grade version looks like` | The first upgrade suggestion expanded with production rationale |
| 3 | Day 7 (2 min in demo) | `You're almost at your free diagram limit — upgrade before you hit it` | Free tier counter warning, Pro feature list, direct upgrade CTA |

Email content branches on `decision_action` — a `free_limit_conversion` user gets an urgent upgrade sequence; a `champion` user gets a personal outreach; a first-time user gets the educational sequence. Eight distinct sequences are implemented in `app/api/notify/route.ts`.

### Sequence runner

`lib/sequence-runner.ts` provides two public functions:

- **`addSequence(params)`** — called by `POST /api/items` after saving. Writes a new 3-step record. Uses `DEMO_MODE=true` delays when the env var is set.
- **`processDueSequences(baseUrl)`** — scans `pending_sequences.json`, calls `POST /api/notify` for every step whose `next_send_at` has passed, marks it sent, and marks the sequence complete when all steps are done.

`POST /api/run-sequences` is the HTTP wrapper around `processDueSequences`. The browser calls it on a 10-second interval automatically after any save.

### Manual trigger (CLI)

```bash
# From dashboard/
npx tsx scripts/run-sequences.ts
# or
npx ts-node --transpile-only scripts/run-sequences.ts
```

### DEMO_MODE

```bash
# dashboard/.env.local
DEMO_MODE=true   # step 2 = 1 min, step 3 = 2 min (instead of 3/7 days)
```

With `DEMO_MODE=true`, the full three-email sequence completes in under 2 minutes while staying on the `/generate` page. Demo sequences (loaded via the ⚡ Demo Mode button) use even shorter delays: step 1 is immediately due, step 2 fires after 10 seconds, step 3 after 20 seconds.

### Required environment variables

```bash
# dashboard/.env.local
NOTIFY_EMAIL=your@gmail.com
NOTIFY_GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx  # Google Account → Security → App Passwords
DEMO_MODE=true
```

### Files changed

```
diagrams-seo-loop/
├── dashboard/
│   ├── lib/
│   │   └── sequence-runner.ts   # NEW: addSequence, addDemoSequence, processDueSequences
│   ├── scripts/
│   │   └── run-sequences.ts     # NEW: CLI wrapper for processDueSequences
│   └── app/api/
│       ├── items/route.ts       # Replaced n8n webhook with addSequence()
│       ├── run-sequences/
│       │   └── route.ts         # NEW: POST — browser-callable sequence processor
│       └── demo-sequence/
│           └── route.ts         # NEW: POST — writes immediate demo sequence record
```

---

## AI Decision Engine

### Intent scoring tells us who is interested. Decisioning tells us what to do next.

Intent scoring — implemented in the Intent Intelligence Layer — answers the question *"how engaged is this user?"* The score, segment, and event trail tell you that a given user has generated five diagrams, shared a link to a colleague, and returned after two weeks. That is rich signal.

But the score alone does not tell you what to do. A `champion` user and a user who just hit their free limit might have similar scores, but they need completely different next actions. The **AI Decision Engine** closes that gap. It consumes the intent intelligence and produces a single, concrete recommendation: the right action, the right priority, and the reason behind the choice.

This transforms the pipeline from:

```
User → Intent Score → Email Sequence
```

into:

```
User → PostHog event capture → HogQL query → event counts
                                                    ↓
                                         AI Decision Engine → decision_action
                                                    ↓
                                         Sequence Runner → Email 1/2/3
```

The engine never performs actions. It only decides what should happen next.

When `POSTHOG_PERSONAL_API_KEY` and `POSTHOG_PROJECT_ID` are set, the decision engine queries PostHog's API for the user's real event counts (`diagram_generated`, `free_limit_reached`, `diagram_saved`) and derives the `decision_action` from there — PostHog becomes the single source of truth for user intent. When those env vars are not set, the engine falls back to the local `data/intent/<user_id>.json` profile silently.

---

### Inspiration

| Tool         | What it does                                                       |
|--------------|--------------------------------------------------------------------|
| **Pocus**    | Surfaces the highest-PQL accounts and recommends rep actions        |
| **CommonRoom**| Aggregates community + product signals into a single score        |
| **UserMotion**| Maps behavioural patterns to lifecycle stages and next-best-actions|
| **HockeyStack**| Traces the full multi-touch path and models revenue attribution  |

For Diagrams.so, the Decision Engine plays the role that Pocus plays for enterprise PLG teams — it takes a rich behavioral profile and converts it into an actionable recommendation that a human or an automation (n8n) can act on immediately.

---

### Architecture

The engine lives in `dashboard/lib/decision-engine.ts` and operates as a pure function. It accepts a `DecisionInput` and returns a `DecisionResult`:

```ts
interface DecisionInput {
  user_id?:       string;
  intent_score:   number;
  intent_segment: IntentSegment;
  event_counts:   Partial<Record<EventType, number>>;
  user_context?:  { role: string; company_type: string };
  recent_events?: EventType[];
}

interface DecisionResult {
  action:
    | "none"
    | "educational_email"
    | "upgrade_email"
    | "champion_outreach"
    | "team_collaboration_followup"
    | "returning_user_nurture"
    | "free_limit_conversion"
    | "high_intent_followup";
  reason:       string;
  confidence:   number;   // 0.0 – 1.0
  priority:     "low" | "medium" | "high";
  generated_at: string;
}
```

Every decision is persisted to `data/decisions/<user_id>.json` as an append-only history array. Decision history is fully inspectable — open the file to see every recommendation ever made for a user.

---

### Rules Engine (Phase 1 — always active)

The default engine is fully deterministic. No LLM required. Rules are evaluated in priority order and the first match wins:

| Rule                                   | Action                        | Confidence | Priority |
|----------------------------------------|-------------------------------|------------|----------|
| `free_limit_reached` event exists      | `free_limit_conversion`       | 95%        | High     |
| `intent_segment = "champion"`          | `champion_outreach`           | 92%        | High     |
| `team_collaboration_detected` event    | `team_collaboration_followup` | 88%        | High     |
| `returning_user` event exists          | `returning_user_nurture`      | 80%        | Medium   |
| `intent_score > 70`                    | `high_intent_followup`        | 75%        | High     |
| `intent_score 30–70`                   | `educational_email`           | 65%        | Medium   |
| Default                                | `none`                        | 50%        | Low      |

Every result includes a `reason` — a human-readable explanation of why the rule fired. This is surfaced in the dashboard under **AI Recommendation** for every queue item.

---

### AI Mode (Phase 2 — optional)

An optional Ollama-powered layer is available. Set the environment variable:

```bash
# dashboard/.env.local
ENABLE_AI_DECISION_ENGINE=true
```

When enabled, the engine calls the local Ollama model (auto-detected from `phi3`, `llama3`, `mistral`, etc.) with a structured product-led growth prompt:

```
You are a product-led growth strategist.

Given the user profile and behavioral signals below, choose the best next action.
Return JSON only.

{
  "action": "...",
  "reason": "...",
  "confidence": 0.0-1.0,
  "priority": "low|medium|high"
}
```

The AI response is validated against the known action and priority enumerations. If Ollama is unreachable, the response is malformed, or any required field is missing, the engine silently falls back to the deterministic rules engine. The save response is never blocked.

**Default: `ENABLE_AI_DECISION_ENGINE` is `false`.** The system runs the deterministic engine by default — local-first, zero dependencies, instant.

---

### Storage

Every decision is persisted to `data/decisions/<user_id>.json`. The file is an append-only array — every recommendation is recorded and inspectable:

```json
[
  {
    "user_id": "b7e8a0f1-...",
    "item_id": "zero-trust-saas-on-aws",
    "decision": {
      "action": "team_collaboration_followup",
      "reason": "A colleague viewed a shared diagram (2 collaboration events detected), indicating multi-stakeholder evaluation.",
      "confidence": 0.88,
      "priority": "high",
      "generated_at": "2026-06-10T09:00:00.000Z"
    }
  }
]
```

---

### Queue and n8n Integration

When `POST /api/items` saves a diagram to the review queue, the decision is generated and stored on the queue item JSON:

```json
{
  "decision_action":     "champion_outreach",
  "decision_priority":   "high",
  "decision_reason":     "Intent score 92 with champion classification...",
  "decision_confidence": 0.92
}
```

These four fields are also appended to the n8n webhook payload — backward-compatible (existing n8n workflow nodes ignore unknown fields). Future n8n workflows can branch on `decision_action` to route users into the right sequence automatically:

```
Webhook → Code (Extract) → Branch on decision_action
  ├── champion_outreach       → High-touch sales sequence
  ├── free_limit_conversion   → Upgrade CTA email (immediate)
  ├── team_collaboration_followup → Team plan pitch
  ├── returning_user_nurture  → Re-engagement sequence
  └── educational_email       → Standard nurture sequence
```

---

### Dashboard Display

`ItemDetail.tsx` shows an **AI Recommendation** panel above the Conversion Path section for every queue item that has a non-`none` decision. The panel displays:

- **Action** — the recommended next action in human-readable form
- **Priority** — colour-coded badge (low = gray, medium = amber, high = emerald)
- **Confidence** — percentage with a visual bar
- **Reason** — the human-readable explanation from the engine

---

### Design principles

- **Local-first.** No database, no external analytics vendors, no SaaS dependencies.
- **Additive only.** The engine does not modify any existing queue management, gallery generation, intent scoring, or email sequence logic.
- **Never blocks.** Decision generation is wrapped in try/catch. A failure never delays the save response.
- **Deterministic by default.** The Phase 1 rules engine requires no Ollama, no network, no configuration. It works on every machine, every time.
- **AI is opt-in.** Set `ENABLE_AI_DECISION_ENGINE=true` to unlock Ollama-powered recommendations. Unset it to return to the deterministic engine.

---

### Files added or changed

```
diagrams-seo-loop/
├── data/
│   └── decisions/               # NEW: <user_id>.json — per-user decision history
├── dashboard/
│   ├── types/queue.ts           # Added DecisionAction, DecisionPriority types + 4 decision fields on QueueItem
│   ├── lib/
│   │   └── decision-engine.ts   # NEW: Phase 1 rules engine + Phase 2 AI mode + storage helpers
│   ├── app/api/
│   │   └── items/route.ts       # Extended: generates decision on save, attaches to item + n8n payload
│   └── components/
│       └── ItemDetail.tsx       # Extended: AI Recommendation section with action/priority/confidence/reason
```

---

---

## PostHog Analytics

PostHog replaces the local intent JSON files as the visible analytics layer. It provides real-time event tracking, session replay, funnel analysis, and a server-side query API — all on the free tier.

### Events captured

| Event | Where | Properties |
|---|---|---|
| `cta_clicked` | Main Generate button click | `button: "generate_diagram"` |
| `diagram_generated` | Ollama pipeline completes | `diagram_title`, `provider` |
| `free_limit_reached` | Generation count hits free limit | `generation_count` |
| `diagram_saved` | "Save to Review Queue" succeeds | `diagram_id`, `diagram_title`, `provider`, `suggestion_1/2_title/description` |

`posthog.identify(userId)` is called on mount so all events from a browser session are attributed to the same anonymous UUID that the server-side decision engine queries.

### Server-side decision query

`lib/posthog-query.ts` runs a HogQL query against PostHog's API:

```sql
SELECT event, count() AS cnt
FROM events
WHERE distinct_id = '<userId>'
  AND event IN ('diagram_generated', 'free_limit_reached', 'cta_clicked', 'diagram_saved')
GROUP BY event
```

The counts are merged with the local intent profile (taking the max of each) to handle PostHog's few-second ingestion lag, then mapped to a `decision_action`:

| PostHog says | Email sequence |
|---|---|
| `free_limit_reached ≥ 1` | `free_limit_conversion` |
| `diagram_saved ≥ 3` | `champion_outreach` |
| `diagram_generated ≥ 5` | `high_intent_followup` |
| anything else | `educational_email` |

### Required environment variables

```bash
# dashboard/.env.local

# Client-side JS key (from PostHog → Project Settings → Project API Key)
NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxx

# Server-side Personal API Key (PostHog → avatar → Personal API Keys → Create — enable Query: Read)
POSTHOG_PERSONAL_API_KEY=phx_xxxxxxxxxxxx

# Project ID (PostHog → Project Settings → Project ID — a number like 12345)
POSTHOG_PROJECT_ID=12345
```

### Funnel setup in PostHog

1. PostHog → **Insights** → **New insight** → **Funnel**
2. Add steps in order: `cta_clicked` → `diagram_generated` → `diagram_saved` → `free_limit_reached`
3. Save as `Generate → Save → Limit Funnel`

The funnel shows drop-off at each step. The **Watch recordings** button next to any drop-off step opens session replays of users who stopped there.

### Files added

```
dashboard/
├── components/
│   └── PostHogInit.tsx       # Client component — posthog.init() on mount, silent if key absent
├── lib/
│   └── posthog-query.ts      # getUserEventCounts(), eventCountsToDecisionAction(), mergeEventCounts()
```

---

## Demo Mode

The `/generate` page includes a **⚡ Demo Mode** button in the right sidebar that loads two pre-built example diagrams instantly — no Ollama required. This is designed for showing the full product flow in a live demo without waiting 2–4 minutes for local LLM inference.

### How to use it

1. Go to `http://localhost:3000/generate`
2. Click **⚡ Demo Mode** → two cards appear:
   - **HIPAA Fintech** — Platform Engineer at a Fintech, HIPAA healthcare data pipeline on AWS
   - **Zero Trust SaaS** — Solutions Architect at B2B SaaS, zero trust network architecture
3. Click either card — the diagram renders instantly, conversion suggestion cards appear, and a **Step 1 email preview** panel shows below the diagram
4. The sequence runner fires automatically: step 1 email immediately, step 2 at 10 seconds, step 3 at 20 seconds
5. Click **Exit demo** or type a real prompt and click Generate to return to the normal flow

### What each example contains

Each `DemoExample` in `lib/demo-examples.ts` provides:
- A complete diagram spec (title, nodes, edges, provider, category) — rendered via `buildDrawioHtml` in the iframe
- `user_context` (role + company_type) — used to personalise the email preview
- Two typed conversion suggestions — shown in the "Next-level versions" cards
- A pre-written Step 1 email preview (subject + body) — displayed inline below the diagram

### What stays unchanged

The real generate flow (Ollama → SSE → diagram) is completely untouched. Demo mode only sets the existing `result`, `suggestions`, and `activeDemoExample` state — it never modifies the generation, save, or notify paths.

### Files added

```
dashboard/
└── lib/
    └── demo-examples.ts    # DEMO_HIPAA_FINTECH, DEMO_ZERO_TRUST_SAAS, DEMO_EXAMPLES array
```

---

## Updates & Iteration Log

### Update 1 — Mermaid.js renderer (replaces original SVG)

Replaced the Python SVG renderer with a Mermaid.js-based approach. HTML files embedded Mermaid 10 from CDN and rendered client-side. Nodes were classified into categories and mapped to Mermaid shapes (cylinder for databases, asymmetric for security, etc.) with color-coded `classDef` blocks and tier subgraphs.

### Update 2 — phi3:mini prompt optimisation

All Ollama prompts were rewritten for phi3:mini's smaller context window:

- **Stage 1**: Structured 5–8 sentence prompt instead of open-ended prose
- **Stage 2 (two-step)**: Split into Stage 2a (nodes only, ~300 tokens) and Stage 2b (edges as plain `Source -> Target` lines, ~250 tokens). Separating the calls prevents JSON truncation, which was causing 0-edge diagrams. A `recover_from_truncated` fallback extracts nodes via regex if JSON is still cut off.
- **Stage 4**: Fill-in-the-blank template prompt with a bracket-stripping parser
- **Stage 5**: Plain labelled sections (`**LinkedIn:**`, `**Twitter:**`, `**Devto:**`) with a robust multi-variant parser that handles all phi3:mini heading formats

### Update 3 — High-intent keyword list

`data/keywords.json` replaced with 10 professional engineering queries targeting senior engineers and platform teams:

- AWS microservices architecture for fintech compliance
- Kubernetes multi-tenant cluster isolation strategy
- Zero trust network architecture for SaaS
- Event-driven architecture with Kafka for e-commerce
- GitOps CI/CD pipeline with ArgoCD and Kubernetes
- Data lakehouse architecture on AWS with Delta Lake
- gRPC microservices with service mesh Istio
- Multi-region active-active architecture on AWS
- Platform engineering internal developer platform architecture
- HIPAA compliant healthcare data pipeline on AWS

### Update 4 — Conversion suggestions (Stage 4b)

A new Ollama call after Stage 4 generates two paid-upgrade diagram ideas (e.g. "Security-hardened version with WAF and mTLS", "Multi-region disaster recovery with Route53 health checks"). These are stored as a `conversion_suggestions` array in the queue JSON.

### Update 5 — Dashboard Conversion Path section

`components/ItemDetail.tsx` now shows a **Conversion Path — What paid users unlock** section below the social drafts. The two suggestions appear as violet-bordered cards with a `PAID` badge and a note: *"These would be surfaced to free users after they generate this diagram to demonstrate paid value."*

### Update 6 — Text prompt Generate page

A new page at `http://localhost:3000/generate` lets you type any architecture description and generate a diagram instantly, without running the Python pipeline. Uses the same 2-step Ollama approach (TypeScript port in `dashboard/lib/diagram-builder.ts`) with a streaming SSE API route (`dashboard/app/api/generate/route.ts`).

Features:
- Live progress steps (Expanding → Identifying components → Mapping connections → Diagram ready)
- Elapsed time counter + upfront warning that phi3:mini takes 2–4 minutes on CPU
- 5 built-in example prompts (Zero trust SaaS, Kafka e-commerce, GitOps CI/CD, HIPAA pipeline, Multi-region active-active)
- **↑ Save to Review Queue** button — saves the generated diagram directly to `data/queue/` in the same format as pipeline-generated items, complete with gallery metadata, social drafts, and conversion suggestions
- Prompt tips and renderer explanation sidebar

The Review Queue and Generate pages are linked via tab navigation in the header. All existing queue items and approval workflows are unchanged.

### Update 7 — diagrams.net renderer (replaces Mermaid.js)

**Renderer replaced:** Mermaid.js → **diagrams.net / embed.diagrams.net**

Diagrams.so is built on `embed.diagrams.net` (the draw.io engine). This update makes the prototype use the exact same rendering layer, which signals strong product and engineering awareness to the evaluator.

#### Architecture

```
Keyword / Prompt
     │
     ▼
Ollama (phi3:mini)
     │  nodes, edges, title, category
     ▼
Normalisation layer  (renderer.py / diagram-builder.ts)
     │  maps node names → AWS / K8s / generic mxgraph icon IDs
     │  assigns nodes to architectural tier swimlanes
     │  computes grid layout (x, y coordinates)
     ▼
mxGraph XML generator
     │  produces diagrams.net-compatible XML
     ▼
Self-contained HTML  (srcDoc / static file)
     │  embed.diagrams.net iframe + postMessage JS
     │  no API calls to Diagrams.so
     ▼
Diagram rendered in dashboard iframe
```

#### Files changed

```
diagrams-seo-loop/
├── pipeline/
│   └── renderer.py         # Full rewrite: mxGraph XML builder + embed.diagrams.net HTML
├── dashboard/
│   ├── app/
│   │   ├── generate/
│   │   │   └── page.tsx    # Updated: srcDoc with buildDrawioHtml (no React postMessage state)
│   │   └── api/
│   │       ├── items/
│   │       │   └── route.ts  # Updated: POST handler saves generated items to queue
│   │       └── generate/
│   │           └── route.ts  # Updated: returns drawioXml instead of mermaid string
│   ├── components/
│   │   └── ItemDetail.tsx  # Updated: sandbox widened for nested embed.diagrams.net iframe
│   └── lib/
│       ├── diagram-builder.ts  # NEW: TypeScript mxGraph XML builder + ~60-entry icon map
│       └── mermaid-builder.ts  # Kept as legacy reference
```

#### What was avoided

- No calls to Diagrams.so API (no public API exists)
- No reverse-engineering of the platform
- No cloud storage dependencies
- No postMessage complexity in React components — the HTML is self-contained (`srcDoc`)

### Update 8 — Backfill existing queue items to diagrams.net

All 10 existing queue items (generated by earlier pipeline runs with Mermaid) were re-rendered to diagrams.net format in place. The JSON files are unchanged; only the `.html` files were updated. No Ollama calls needed — the renderer reads the existing `spec.nodes` and `spec.edges` from the JSON.

### Update 9 — pytrends keyword discovery

#### pytrends — Google Trends keyword discovery

**`pipeline/discover_keywords.py`** queries Google Trends for rising and top related queries against a set of seed architecture topics (`kubernetes architecture`, `AWS microservices`, `devops pipeline`, etc.). It filters results by intent tokens (must contain terms like `architecture`, `pipeline`, `k8s`, `terraform`, `kafka`, `zero trust`, etc.) and strips navigational/branded queries. New terms are merged into `data/keywords.json` without overwriting the existing list.

Usage:

```bash
cd pipeline
pip install -r requirements.txt       # now includes pytrends>=4.9.2

# Merge new Trends keywords into keywords.json (safe — never overwrites existing)
python discover_keywords.py

# Replace keywords.json entirely with discovered terms
python discover_keywords.py --replace

# Preview without writing
python discover_keywords.py --dry-run
```

The main pipeline can also trigger discovery automatically:

```bash
python run.py --discover   # runs discover_keywords.py first, then processes all keywords
python run.py              # skips discovery, uses existing keywords.json as-is
```

If `pytrends` is not installed or Google Trends rate-limits the request, the script exits gracefully without modifying `keywords.json`.

### Update 10 — Evangelist nurture email

After a user saves a diagram to the queue, a nurture email is sent to the operator inbox via `dashboard/app/api/notify/route.ts` using Nodemailer + Gmail App Password. The email is written as if received by the new signup — it includes their diagram title, a link to `/shared/[id]` using the real saved queue item ID (not a slug guess), and two LLM-generated Pro follow-up suggestions tailored to their prompt.

The footer marks it `[PROTOTYPE — operator preview]` so evaluators know no real user was contacted. Failure is silent and never blocks the UI.

New lib files extracted to avoid code duplication:
- `dashboard/lib/ollama.ts` — `detectOllamaModel()` and `ollamaGenerate()` shared by both the generate SSE route and the items route
- `dashboard/lib/conversion-suggestions.ts` — `generateConversionSuggestions()`, `parseConversionSuggestions()`, and `sanitizeSuggestionField()` used across the generate route, items route, notify route, and UI components

### Update 11 — LLM suggestion sanitisation

phi3:mini frequently echoes placeholder text (`[title]`, `[description]`, `[one sentence here]`) verbatim from the prompt template. A sanitisation layer was added at every boundary:

- `sanitizeSuggestionField()` in `conversion-suggestions.ts` strips all bracket patterns with up to three passes (handles nested/repeated occurrences)
- `isLowQualitySuggestion()` drops any suggestion whose title is entirely a bracket expression or is under 4 characters
- Applied in: the generate SSE route (before sending to UI), the items POST route (before saving to JSON), the notify route (before including in email), and `ItemDetail.tsx` (before display)
- Stage 4b prompt in `run.py` was also rewritten with a concrete few-shot example to reduce placeholder output at source

### Update 12 — Public Shared gallery + hydration fixes

**Shared gallery (`/shared`):** A public index page listing all items from `data/queue/` and `data/approved/`, each linking to its own `/shared/[id]` landing page. Accessible from the top nav. This is the organic discovery surface — engineer generates → saves → approves → shares `/shared/[id]` → visitor sees the diagram → clicks "Generate your own".

**Shared diagram page (`/shared/[id]`):** Public landing page for each diagram. Renders the diagram fullscreen via `embed.diagrams.net`, shows gallery title and description, and offers a single CTA: *Generate your own →* to `/generate`. No login wall. No dashboard controls.

**Hydration fixes:**
- `toLocaleString()` on timestamps caused server/client mismatch (different timezone rendering). Replaced with `formatQueueTimestamp()` in `lib/format-date.ts` which always formats in UTC
- `ClientTimestamp` component in `components/ClientTimestamp.tsx` renders `—` on the server and the formatted date on the client, using the `useMounted` hook
- `localStorage` access for the generation counter (`diagrams_generations_count`) was running during SSR. Wrapped with `useMounted` in `generate/page.tsx` so it only reads after client mount
- `suppressHydrationWarning` added to `<html>` and `<body>` in `layout.tsx` to suppress noise from browser extensions

### Update 13 — Closed-loop automated email sequence via n8n

The single nurture email (Update 10) has been extended into a full three-step sequence with intent enrichment and n8n as the local workflow orchestrator.

**Intent enrichment** — `inferUserContext(prompt)` added to `lib/ollama.ts`. Fires a short Ollama call after every diagram save to infer `{ role, company_type }` from the user's prompt. Stored as `user_context` in the queue item JSON. Falls back silently — never blocks the save response.

**Three-step email sequence**

| Step | When | Content |
|------|------|---------|
| Email 1 | Immediately on save | Diagram link + 2 Pro upgrade suggestions, personalised by inferred role |
| Email 2 | Day 3 | Expanded production-grade version suggestion with engineering rationale |
| Email 3 | Day 7 | Free-tier limit warning + direct Pro upgrade CTA |

**n8n orchestration** — n8n runs locally (`npx n8n` or Docker) and holds the sequence state. The workflow is: `Webhook → Code (Extract fields) → Email 1 (HTTP) → Wait 3d → Email 2 (HTTP) → Wait 4d → Email 3 (HTTP)`. Next.js fires the webhook as a fire-and-forget POST after each successful queue save. n8n persists execution state to disk so Wait nodes survive restarts.

**API changes:**
- `POST /api/items` — calls `inferUserContext()`, stores `user_context` in item JSON, fires n8n webhook after save
- `POST /api/notify` — extended with `email_step: 1 | 2 | 3` and `user_context: { role, company_type }` parameters. `buildEmailContent()` renders a different subject and body per step. Backward-compatible: `email_step` defaults to `1` if omitted so the existing frontend call still works unchanged.
- `sanitizeSuggestionField()` call-sites hardened with `?? ""` guards so undefined suggestion fields from n8n never crash the route.

**New file:** `diagrams-seo-loop/n8n-workflow.json` — ready to import directly into n8n. Contains all six nodes pre-wired with correct expression paths. See the **Closed-Loop Automated Email Sequence** section above for full setup instructions.

### Update 14 — Intent Intelligence Layer

A fully local, zero-vendor behavioral tracking and intent scoring system inspired by RB2B, Warmly, CommonRoom, Pocus, and HockeyStack. Every event and score lives in local JSON files — no external analytics SDK, no database, no third-party pixels.

---

## Intent Intelligence Layer

### Why intent scoring improves conversion

Generic SEO tools tell you how many people visited. Intent scoring tells you which visitors are about to buy. RB2B identifies companies behind anonymous traffic. Warmly shows real-time buying signals. CommonRoom aggregates product usage into community scores. Pocus surfaces the highest-PQL accounts for sales. HockeyStack traces the full multi-touch path from impression to revenue.

For Diagrams.so, every visitor who generates a diagram leaves a trail of behavioral signals. A visitor who generates twice in one session, views a shared diagram from a colleague's link, and clicks "Generate your own" is a fundamentally different prospect than someone who bounced after a single generation. The Intent Intelligence Layer makes that difference visible and actionable — without requiring login, email capture, or any third-party service.

### Behavioral signals

Eight signals are tracked and scored:

| Signal | Event Type | Points | Rationale |
|--------|-----------|--------|-----------|
| Successful diagram generation | `diagram_generated` | +5 | First activation signal — user has functional intent |
| 2+ generations in one session | `multiple_generations_same_session` | +10 | Session depth indicates exploration, not a one-off |
| Shared diagram page view | `shared_diagram_viewed` | +5 | Organic inbound — someone else shared the diagram |
| Different device viewing shared diagram | `team_collaboration_detected` | +25 | A colleague viewed it — multi-stakeholder evaluation in progress |
| "Generate your own" CTA click | `cta_clicked` | +20 | Explicit activation intent from a shared page |
| Free generation limit reached | `free_limit_reached` | +30 | User has consumed enough value to feel the gate — highest conversion moment |
| Return visit after 7+ days | `returning_user` | +20 | Retention signal — tool solved a real problem and user came back |
| Generated once, left without saving | `abandoned_after_first_generation` | −15 | Low engagement signal — reduces score to prevent false positives |

### How it works

**1. Anonymous user identity**

On first visit to `/generate`, a UUID is generated and stored in `localStorage` under `diagrams_user_id`. It persists across sessions and is passed to every event tracking call. No email, no login, no cookie banner required.

**2. Event log**

Every behavioral signal is recorded as a `TrackedEvent` JSON object and appended to `data/events/<user_id>.json`. The file is created on first event and grows incrementally. Each event carries:

```json
{
  "id": "a3f2c1d4-...",
  "user_id": "b7e8a0f1-...",
  "event_type": "diagram_generated",
  "timestamp": "2026-06-10T09:00:00.000Z",
  "metadata": { "diagram_title": "Zero Trust SaaS on AWS", "provider": "aws" }
}
```

**3. Intent scoring**

After every event, `calculateIntentScore()` sums the weighted score across all events for the user and `updateIntentProfile()` persists the result to `data/intent/<user_id>.json`:

```json
{
  "user_id": "b7e8a0f1-...",
  "intent_score": 72,
  "segment": "high_intent",
  "last_updated": "2026-06-10T09:00:05.000Z",
  "event_counts": {
    "diagram_generated": 3,
    "multiple_generations_same_session": 1,
    "free_limit_reached": 1,
    "returning_user": 1
  }
}
```

**4. Segmentation**

| Score range | Segment | Meaning |
|-------------|---------|---------|
| 0 – 20 | `casual` | Single visit, low engagement |
| 21 – 50 | `engaged` | Multiple sessions or sharing activity |
| 51 – 80 | `high_intent` | Strong product engagement, approaching conversion |
| 81+ | `champion` | Power user — sharing, returning, hitting limits |

**5. Queue item enrichment**

When a user saves a diagram to the review queue (`POST /api/items`), the current intent profile is loaded and `intent_score` + `intent_segment` are stored directly in the queue item JSON. The reviewer sees the creator's segment at the moment of save.

**6. n8n payload enrichment**

`intent_score` and `intent_segment` are appended to the n8n webhook payload. Existing workflow nodes ignore unknown fields — backward-compatible. Future n8n automations can branch on segment: e.g. trigger a high-touch sales sequence for `champion` users, or skip the Day-7 email for `casual` users who have not returned.

**7. Dashboard visibility**

`ItemDetail.tsx` displays a colour-coded intent badge next to the provider and category tags:

- `casual` — gray
- `engaged` — cyan
- `high_intent` — violet
- `champion` — emerald

The badge shows both the numeric score and the segment label. Hovering reveals the raw score as a tooltip.

### Team collaboration detection

When a shared diagram page is loaded, the viewer's `diagrams_user_id` is read from their `localStorage`. If it differs from the `creator_user_id` stored in the queue item JSON (set when the creator saved the diagram), a `team_collaboration_detected` event is fired. This is the strongest free-tier signal available without login — it means the creator shared the link with a colleague who also viewed it.

### Relationship to PLG workflows

| Tool | What it does | Our equivalent |
|------|-------------|----------------|
| RB2B | De-anonymises website visitors to company-level | `creator_user_id` + `team_collaboration_detected` as a proxy for multi-stakeholder visits |
| Warmly | Shows real-time intent signals to sales reps | Intent badge in the review dashboard gives the operator instant context |
| CommonRoom | Aggregates community + product signals into a single score | `intent_score` aggregates all behavioral signals into one number |
| Pocus | Surfaces the highest-PQL accounts | Segment `champion` = highest PQL; these are the users to reach out to first |
| HockeyStack | Traces the full attribution path | `event_counts` on each profile maps the user's full journey through the product |

### Files changed

```
diagrams-seo-loop/
├── data/
│   ├── events/             # NEW: <user_id>.json — per-user event logs
│   └── intent/             # NEW: <user_id>.json — per-user intent profiles
├── dashboard/
│   ├── types/queue.ts      # Added IntentSegment type + creator_user_id / intent_score / intent_segment on QueueItem
│   ├── lib/
│   │   ├── events.ts       # NEW: trackEvent(), getUserEvents() — server-side event storage
│   │   └── intent.ts       # NEW: calculateIntentScore(), updateIntentProfile(), getIntentProfile()
│   ├── app/api/
│   │   ├── events/
│   │   │   └── route.ts    # NEW: POST (record event) · GET (read profile + events)
│   │   └── items/route.ts  # Extended: accepts user_id, attaches intent_score/segment to item + n8n payload
│   ├── app/
│   │   ├── generate/
│   │   │   └── page.tsx    # Extended: getOrCreateUserId, returning_user detection, diagram_generated,
│   │   │                   #           multiple_generations_same_session, free_limit_reached,
│   │   │                   #           abandoned_after_first_generation, user_id passed to save
│   │   └── shared/[id]/
│   │       └── page.tsx    # Extended: SharedPageTracker + GenerateCtaLink for shared_diagram_viewed,
│   │                       #           team_collaboration_detected, cta_clicked
│   └── components/
│       ├── SharedDiagramTracker.tsx  # NEW: client components for shared page intent tracking
│       └── ItemDetail.tsx            # Extended: intent score + segment badge in title bar
```

### Update 15 — AI Decision Engine

The Intent Intelligence Layer (Update 14) scores *who* is interested. The AI Decision Engine converts that score into a concrete recommendation for *what to do next*.

**Decision engine** — `lib/decision-engine.ts` implements a two-phase architecture:

- **Phase 1 (always active):** Deterministic rules engine. Seven prioritised rules map intent signals to one of eight actions (`free_limit_conversion`, `champion_outreach`, `team_collaboration_followup`, `returning_user_nurture`, `high_intent_followup`, `educational_email`, `none`). Every result includes a confidence score and a human-readable reason.
- **Phase 2 (opt-in):** Ollama-powered recommendation. Set `ENABLE_AI_DECISION_ENGINE=true` in `.env.local` to enable. Uses the same auto-detected model as the rest of the pipeline. Falls back silently to Phase 1 on any failure.

**Storage** — Every decision is appended to `data/decisions/<user_id>.json`. Decision history is fully inspectable without running the dashboard.

**Queue enrichment** — `POST /api/items` now calls `getDecision()` and writes four new fields to the queue item JSON: `decision_action`, `decision_priority`, `decision_reason`, `decision_confidence`. Backward-compatible — existing items without these fields continue to work.

**n8n webhook** — All four decision fields are appended to the n8n webhook payload. Existing n8n nodes ignore unknown fields. Future workflows can branch on `decision_action` to route users into bespoke sequences.

**Dashboard** — `ItemDetail.tsx` renders an **AI Recommendation** panel (above Conversion Path) for any item with a non-`none` decision. The panel shows the action label, a colour-coded priority badge, a confidence bar, and the engine's reason.

```
diagrams-seo-loop/
├── data/
│   └── decisions/               # NEW: <user_id>.json — per-user decision history
├── dashboard/
│   ├── types/queue.ts           # Added DecisionAction, DecisionPriority types + decision fields on QueueItem
│   ├── lib/
│   │   └── decision-engine.ts   # NEW: rules engine + AI mode + persistDecision + getDecisionHistory
│   ├── app/api/
│   │   └── items/route.ts       # Extended: generates + attaches decision to item + n8n payload
│   └── components/
│       └── ItemDetail.tsx       # Extended: AI Recommendation panel
```

### Update 16 — Local sequence runner (replaces n8n)

n8n removed entirely. Email sequence state is now managed by `lib/sequence-runner.ts` writing to `data/pending_sequences.json`. Three-step records are created on every diagram save with configurable delays (`DEMO_MODE=true` collapses them to 1 min / 2 min). The browser auto-polls `POST /api/run-sequences` every 10 seconds after any save — no clicking required, no external process needed.

**New env var:** `DEMO_MODE=true` — collapses sequence delays to 1 min / 2 min for demo use.

**Demo sequences** (`addDemoSequence`) use even shorter delays: step 1 immediately due, step 2 at 10 seconds, step 3 at 20 seconds — full 3-email sequence visible within 20 seconds of clicking a demo card.

```
dashboard/
├── lib/
│   └── sequence-runner.ts          # NEW: addSequence, addDemoSequence, processDueSequences
├── scripts/
│   └── run-sequences.ts            # NEW: CLI manual trigger
└── app/api/
    ├── run-sequences/route.ts       # NEW: POST — browser-callable sequence processor
    └── demo-sequence/route.ts       # NEW: POST — writes immediate demo sequence record
```

---

### Update 17 — PostHog analytics + server-side decision query

PostHog replaces local JSON files as the visible analytics layer and becomes the primary data source for the decision engine.

**Client-side:** `posthog.identify(userId)` ties all events to the anonymous UUID. Four events captured: `cta_clicked`, `diagram_generated`, `free_limit_reached`, `diagram_saved` (with full email payload properties).

**Server-side:** `lib/posthog-query.ts` runs a HogQL query for the user's event counts on every diagram save. Counts are merged with local intent data (taking max of each to handle ingestion lag). The merged counts drive `decision_action` instead of the local rules engine when PostHog credentials are configured.

**New env vars:** `NEXT_PUBLIC_POSTHOG_KEY`, `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`.

```
dashboard/
├── components/
│   └── PostHogInit.tsx             # NEW: client component, posthog.init() on mount
├── lib/
│   └── posthog-query.ts            # NEW: getUserEventCounts, eventCountsToDecisionAction, mergeEventCounts
└── app/
    └── generate/page.tsx           # Extended: posthog.identify, posthog.capture for 4 events + diagram_saved
```

---

### Update 18 — Demo Mode

A **⚡ Demo Mode** button in the right sidebar of `/generate` lets you showcase the full product flow without running Ollama. Two pre-built examples are included: **HIPAA Fintech** (Platform Engineer, healthcare data pipeline) and **Zero Trust SaaS** (Solutions Architect, zero trust architecture).

Clicking a card instantly renders the diagram, shows conversion suggestion cards, displays a pre-written Step 1 email preview panel, writes a demo sequence record, and starts the auto-send timer. All three nurture emails send automatically within 20 seconds. The real Ollama generate flow is completely untouched.

```
dashboard/
└── lib/
    └── demo-examples.ts    # NEW: DEMO_HIPAA_FINTECH, DEMO_ZERO_TRUST_SAAS, DEMO_EXAMPLES
```

---

### Update 19 — Keyword Mode in Generate tab + iframe sandbox fix

#### Keyword Mode

The `/generate` page now supports two input modes, toggled by a button in the prompt card header:

- **Prompt Mode** (default) — user types a full architecture description, exactly as before. No change to the existing generate flow.
- **Keyword Mode (`⌖ KEYWORD MODE`)** — user enters a short keyword cluster (e.g. `"zero trust SaaS on AWS"` or `"Kafka event-driven e-commerce"`). The pipeline runs two additional stages after the diagram is ready:
  - **Stage 5 — Gallery metadata:** Ollama generates an SEO-optimised `gallery_title` (≤60 chars), `gallery_description` (≤160 chars), and `tags` array for the diagram gallery page.
  - **Stage 6 — Social drafts:** Ollama writes three social posts (LinkedIn, X/Twitter, Dev.to), each starting with the engineering problem the diagram solves. Posts end with `LINK_HERE` as a placeholder for the diagram URL.

After generation, a **⌖ GALLERY LOOP OUTPUT** panel appears below the diagram showing the gallery title, description, tags, and a tabbed social draft preview (LinkedIn · X · Dev.to).

When the diagram is saved to the Review Queue via **Save to Review Queue**, the pre-generated gallery metadata and social posts are passed through to the queue item JSON — replacing the previous hardcoded template strings. Queue items saved from Keyword Mode therefore have LLM-quality gallery copy and social drafts rather than generic templates.

This closes the gallery-seeded SEO loop entirely within the dashboard UI. The Python pipeline (`run.py`) is no longer the only way to produce gallery-ready output — any keyword can flow through the Generate page and produce the same artifacts.

#### Keyword Mode pipeline stages

| Stage | What it does | Extra in Keyword Mode |
|-------|--------------|-----------------------|
| 0 | Detect Ollama model | — |
| 1 | Expand keyword/prompt → architecture description | — |
| 2 | Identify components (nodes) | — |
| 3 | Map connections (edges) | — |
| 4 | Render diagram + Pro follow-up suggestions | — |
| **5** | **Gallery metadata (LLM)** | **Keyword Mode only** |
| **6** | **Social drafts — LinkedIn / X / Dev.to (LLM)** | **Keyword Mode only** |

#### iframe sandbox fix

The `srcDoc` iframe on the Generate page (which embeds the `buildDrawioHtml` output containing the `embed.diagrams.net` nested iframe) was missing `allow-same-origin` from its sandbox attribute. Without it, the document gets a null origin. `embed.diagrams.net` rejects postMessages from null-origin senders, so the `{action: 'load', xml: ...}` message never landed and the diagrams.net spinner ran indefinitely. Added `allow-same-origin allow-forms` to the sandbox — the postMessage handshake now completes and the diagram renders correctly.

#### Empty queue state

The empty state message on the Review Queue page previously showed a terminal command (`cd pipeline && python run.py`). Replaced with a direct link to the Generate page (`Generate diagrams in the Generate page →`) since the Generate tab is now the primary entry point for adding items to the queue.

#### Files changed

```
diagrams-seo-loop/
└── dashboard/
    ├── app/
    │   ├── generate/
    │   │   └── page.tsx        # Keyword Mode toggle, extended stage labels (5+6), gallery/social state,
    │   │                       #   gallery loop output panel, iframe sandbox fix (allow-same-origin)
    │   ├── page.tsx            # Empty queue state: terminal command → link to /generate
    │   └── api/
    │       ├── generate/
    │       │   └── route.ts    # keyword_mode param; Stage 5 (gallery metadata) + Stage 6 (social posts)
    │       │                   #   with Ollama prompts and parsers; streams gallery_metadata + social_posts events
    │       └── items/
    │           └── route.ts    # Accepts pre-generated gallery_metadata + social_posts in POST body;
    │                           #   uses them directly when present instead of template fallbacks
```
